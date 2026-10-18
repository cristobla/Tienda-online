/**
 * Promociones: cupones de descuento sobre los productos y despacho gratis desde un monto (permiso promotions:manage).
 * El descuento se calcula SIEMPRE en el servidor al crear el pedido (con el cupón bloqueado); el checkout solo lo
 * muestra antes. Los usos se cuentan desde los pedidos no cancelados: un pedido vencido devuelve su uso.
 */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import * as s from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { formatCLP } from "@/modules/chile";

export type Coupon = typeof s.coupons.$inferSelect;
const TZ = "America/Santiago";

/** "  bienvenida 10 " → "BIENVENIDA10". */
export const normalizeCode = (v: string) => v.normalize("NFC").replace(/\s+/g, "").toUpperCase();

const date = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").nullable(),
);

export const couponSchema = z
  .object({
    code: z
      .string()
      .transform(normalizeCode)
      .pipe(z.string().regex(/^[A-Z0-9_-]{3,30}$/, "Entre 3 y 30 letras, números, guion o guion bajo (sin espacios ni tildes)")),
    kind: z.enum(["PERCENT", "FIXED"]),
    value: field.int(1, 10_000_000),
    minSubtotal: field.optInt(0, 100_000_000).transform((v) => v ?? 0),
    startsOn: date,
    endsOn: date,
    maxUses: field.optInt(1, 1_000_000),
    oncePerEmail: field.bool(),
    active: field.bool(),
    note: field.optText(200),
  })
  .refine((c) => c.kind !== "PERCENT" || c.value <= 90, { path: ["value"], message: "Máximo 90 %" })
  .refine((c) => !c.startsOn || !c.endsOn || c.startsOn <= c.endsOn, { path: ["endsOn"], message: "Termina antes de empezar" });
export type CouponInput = z.infer<typeof couponSchema>;

/** Las fechas del formulario son días en hora de Chile: desde las 00:00 del inicio hasta el final del día de término. */
const columns = (d: CouponInput) => ({
  code: d.code,
  kind: d.kind,
  value: d.value,
  minSubtotal: d.minSubtotal,
  startsAt: d.startsOn ? sql<Date>`(${d.startsOn}::date)::timestamp AT TIME ZONE ${TZ}` : null,
  endsAt: d.endsOn ? sql<Date>`(${d.endsOn}::date + 1)::timestamp AT TIME ZONE ${TZ}` : null,
  maxUses: d.maxUses,
  oncePerEmail: d.oncePerEmail,
  active: d.active,
  note: d.note,
});

export async function saveCoupon(userId: string, id: string | null, d: CouponInput) {
  return db.transaction(async (tx) => {
    const [before] = id ? await tx.select().from(s.coupons).where(eq(s.coupons.id, id)).for("update") : [];
    if (id && !before) throw new UserError("El cupón no existe.");
    // Los usos se cuentan por el código guardado en los pedidos: renombrar uno usado reiniciaría sus límites.
    if (before && before.code !== d.code && (await tx.$count(s.orders, eq(s.orders.couponCode, before.code))) > 0)
      throw new UserError("Este cupón ya se usó: no se puede cambiar su código. Pausa este y crea uno nuevo.", "code");
    const [row] = before
      ? await tx.update(s.coupons).set({ ...columns(d), updatedAt: new Date() }).where(eq(s.coupons.id, before.id)).returning()
      : await tx.insert(s.coupons).values(columns(d)).returning();
    await audit(tx, { userId, action: before ? "coupon.update" : "coupon.create", entityType: "coupon", entityId: row!.id, before, after: row });
    return row!;
  });
}

const uses = sql<number>`(SELECT count(*)::int FROM orders o WHERE o.coupon_code = "coupons"."code" AND o.status <> 'CANCELLED')`;

export async function listCoupons() {
  return db.select({ c: s.coupons, uses }).from(s.coupons).orderBy(desc(s.coupons.active), desc(s.coupons.createdAt));
}

/** Para el formulario de edición: las fechas vuelven a días de Chile. */
export async function getCoupon(id: string) {
  const [r] = await db
    .select({
      c: s.coupons,
      uses,
      startsOn: sql<string | null>`to_char("coupons"."starts_at" AT TIME ZONE ${TZ}, 'YYYY-MM-DD')`,
      endsOn: sql<string | null>`to_char(("coupons"."ends_at" AT TIME ZONE ${TZ}) - interval '1 day', 'YYYY-MM-DD')`,
    })
    .from(s.coupons)
    .where(eq(s.coupons.id, id));
  return r ?? null;
}

/** Descuento en CLP enteros sobre los productos: el porcentaje se redondea hacia abajo y nunca supera el subtotal. */
export const discountFor = (c: Pick<Coupon, "kind" | "value">, subtotal: number) =>
  Math.min(subtotal, c.kind === "PERCENT" ? Math.floor((subtotal * c.value) / 100) : c.value);

/**
 * Valida el cupón para estos productos y devuelve el descuento. Con `lock` bloquea la fila (crear pedido): dos
 * pedidos a la vez no superan el máximo de usos. Sin email (vista previa del checkout) no revisa "uno por cliente".
 * Errores para el cliente con campo `couponCode`.
 * shortcut: un pedido vencido que luego se paga (recuperado) vuelve a contar su uso aunque ya se haya llegado al máximo; caso raro, se acepta.
 */
export async function applyCoupon(tx: Tx, rawCode: string, { subtotal, email, lock = false }: { subtotal: number; email: string | null; lock?: boolean }) {
  const code = normalizeCode(rawCode);
  const q = tx
    .select({ c: s.coupons, live: sql<boolean>`("coupons"."starts_at" IS NULL OR "coupons"."starts_at" <= now()) AND ("coupons"."ends_at" IS NULL OR now() < "coupons"."ends_at")` })
    .from(s.coupons)
    .where(eq(s.coupons.code, code));
  const [row] = lock ? await q.for("update") : await q;
  const fail = (m: string) => new UserError(m, "couponCode");
  if (!row || !row.c.active || !row.live) throw fail("Ese cupón no existe o no está vigente.");
  const c = row.c;
  if (subtotal < c.minSubtotal) throw fail(`Este cupón es para compras desde ${formatCLP(c.minSubtotal)}.`);
  if (c.maxUses !== null) {
    const used = await tx.$count(s.orders, and(eq(s.orders.couponCode, c.code), ne(s.orders.status, "CANCELLED")));
    if (used >= c.maxUses) throw fail("Este cupón ya se agotó.");
  }
  if (c.oncePerEmail && email) {
    const mine = await tx.$count(s.orders, and(eq(s.orders.couponCode, c.code), ne(s.orders.status, "CANCELLED"), eq(s.orders.email, email.toLowerCase())));
    if (mine > 0) throw fail("Ya usaste este cupón.");
  }
  return { code: c.code, discount: discountFor(c, subtotal), label: c.kind === "PERCENT" ? `${c.value} %` : null };
}
