import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { jsonLdText } from "@/components/store/json-ld";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { DEFAULT_SETTINGS } from "@/lib/site";
import { hashPassword } from "@/modules/auth/password";
import { authenticate, createSession, purgeExpiredSessions, validateSession } from "@/modules/auth/session";
import { changeOwnPassword, ownPasswordSchema } from "@/modules/auth/users";
import { addToCart, getCart, purgeStaleCarts } from "@/modules/cart";
import { netFromGross } from "@/modules/chile";
import { getCustomer, listCustomers } from "@/modules/customers";
import { renderEmail } from "@/modules/mail";
import { confirmTransfer, placeOrder, refundOrder, transferConfirmationSchema } from "@/modules/payments";
import { ordersForExport, parseReportRange, salesByPeriod, salesSummary, topProducts, toCsv } from "@/modules/reports";
import { getInfoPage, listInfoPages, readSettings, saveInfoPage, saveSettings, settingsSchema } from "@/modules/settings";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;
let communeId: number;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: await hashPassword("clave-actual-123"), role: "ADMIN" }).returning();
  adminId = u!.id;
  communeId = (await makeCommune("P9", 0)).communeId;
});

type Who = { email?: string; firstName?: string; lastName?: string; phone?: string; rut?: string | null };
async function order(variantId: string, who: Who = {}, qty = 1) {
  const cart = await addToCart(null, { variantId, quantity: qty });
  const input = { email: "ana@test.cl", firstName: "Ana", lastName: "Pérez", phone: "+56912345678", rut: null, communeId, street: "Calle", number: "1", apartment: null, notes: null, ...who };
  return placeOrder(cart, { ...input, expectedTotal: (await getCart(cart)).subtotal }, "transferencia");
}
/** Pedido pagado por transferencia, con la fecha de pago que se indique (hora exacta, para probar los cortes de día). */
async function paidOrder(variantId: string, paidAt: string, who: Who = {}, qty = 1) {
  const o = await order(variantId, who, qty);
  const [p] = await db.select().from(s.payments).where(eq(s.payments.orderId, o.id));
  await confirmTransfer(adminId, p!.id, transferConfirmationSchema.parse({ amount: String(1000 * qty), receivedOn: "2026-10-01", bankReference: "", note: "", commandId: randomUUID() }));
  await db.update(s.orders).set({ paidAt: new Date(paidAt) }).where(eq(s.orders.id, o.id));
  return o;
}
const range = (from: string, to: string, group: "dia" | "mes" = "dia") => ({ from, to, group });

describe("datos para buscadores (JSON-LD)", () => {
  it("un texto con </script> no puede cerrar el bloque: cada < se escribe como \\u003c", () => {
    const evil = "</script><script>alert(1)</script>";
    const text = jsonLdText({ name: evil });
    expect(text).not.toContain("<");
    expect(JSON.parse(text).name).toBe(evil);
  });
});

describe("reportes de ventas", () => {
  it("cuenta por fecha de pago en hora de Chile, con neto, IVA, unidades y más vendidos", async () => {
    const v = await makeVariant(20);
    await paidOrder(v.id, "2026-09-30T23:30:00-03:00"); // 30-sep en Chile, 1-oct en UTC
    await paidOrder(v.id, "2026-10-02T10:00:00-03:00", {}, 2);
    await order(v.id); // pendiente de pago: no es venta

    expect(await salesSummary(range("2026-09-01", "2026-09-30"))).toMatchObject({ orders: 1, total: 1000, units: 1 });
    const oct = await salesSummary(range("2026-10-01", "2026-10-31"));
    const { net, iva } = netFromGross(2000);
    expect(oct).toMatchObject({ orders: 1, total: 2000, net, iva, average: 2000, units: 2, reversed: { orders: 0, total: 0 } });

    const days = await salesByPeriod(range("2026-09-30", "2026-10-02"));
    expect(days).toEqual([
      { period: "2026-09-30", orders: 1, total: 1000 },
      { period: "2026-10-01", orders: 0, total: 0 },
      { period: "2026-10-02", orders: 1, total: 2000 },
    ]);
    expect(await salesByPeriod(range("2026-09-15", "2026-10-20", "mes"))).toEqual([
      { period: "2026-09-01", orders: 1, total: 1000 },
      { period: "2026-10-01", orders: 1, total: 2000 },
    ]);
    expect(await topProducts(range("2026-09-01", "2026-10-31"))).toMatchObject([{ variantId: v.id, units: 3, total: 3000, orders: 2 }]);
  });

  it("un mes ya cerrado no cambia si después se anula un pedido: la anulación cuenta en su propio mes", async () => {
    const v = await makeVariant(20);
    const a = await paidOrder(v.id, "2026-09-30T12:00:00-03:00");
    await paidOrder(v.id, "2026-10-05T12:00:00-03:00");
    await refundOrder(adminId, a.id, { note: "Arrepentimiento", restock: false });
    await db.update(s.orders).set({ cancelledAt: new Date("2026-10-02T12:00:00-03:00") }).where(eq(s.orders.id, a.id));

    expect(await salesSummary(range("2026-09-01", "2026-09-30"))).toMatchObject({ orders: 1, total: 1000, reversed: { orders: 0 } });
    expect(await salesSummary(range("2026-10-01", "2026-10-31"))).toMatchObject({ orders: 1, total: 1000, reversed: { orders: 1, total: 1000 }, netOfReversals: 0 });
    // La exportación del mes sigue mostrando la venta, con su estado actual.
    const [row] = await ordersForExport(range("2026-09-01", "2026-09-30"), "pagados");
    expect(row).toMatchObject({ 3: "Cancelado", 15: 1000 });
  });

  it("rango de fechas: por omisión 30 días, invertido se corrige, largo se agrupa por mes", () => {
    expect(parseReportRange({}, "2026-10-18")).toEqual({ from: "2026-09-19", to: "2026-10-18", group: "dia" });
    expect(parseReportRange({ desde: "2026-10-10", hasta: "2026-10-01" }, "2026-10-18")).toMatchObject({ from: "2026-10-01", to: "2026-10-10" });
    expect(parseReportRange({ desde: "2026-01-01", hasta: "2026-10-18" }, "2026-10-18").group).toBe("mes");
    expect(parseReportRange({ desde: "no-es-fecha", agrupar: "año" }, "2026-10-18")).toEqual({ from: "2026-09-19", to: "2026-10-18", group: "dia" });
  });

  it("CSV para Excel: BOM, punto y coma, CRLF y sin fórmulas ejecutables", () => {
    const csv = toCsv([
      ["Cliente", "Total"],
      ["=HYPERLINK(\"http://x\")", 1000],
      ["Pérez; Ana", null],
      ["@SUM(A1)", "-3"],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Cliente;Total\r\n"\'=HYPERLINK(""http://x"")";1000\r\n"Pérez; Ana";\r\n\'@SUM(A1);\'-3\r\n');
  });
});

describe("clientes", () => {
  it("un cliente por email; busca por nombre sin tildes, teléfono o RUT con o sin puntos; el gasto cuenta solo lo pagado", async () => {
    const v = await makeVariant(20);
    await paidOrder(v.id, "2026-10-01T12:00:00-03:00", { rut: "11111111-1" }); // ya normalizado, como lo entrega orderInputSchema
    await order(v.id, { phone: "+56987654321" }); // mismo email, pendiente
    await order(v.id, { email: "otro@test.cl", firstName: "Luis", lastName: "Soto", phone: "+56911112222" });

    const all = await listCustomers({});
    expect(all.total).toBe(2);
    const ana = all.items.find((c) => c.email === "ana@test.cl")!;
    expect(ana).toMatchObject({ orders: 2, paidOrders: 1, spent: 1000, rut: "11111111-1", phone: "+56987654321" }); // datos del pedido más reciente
    for (const q of ["perez", "8765 4321", "11.111.111-1", "111111111", "ANA@TEST"]) expect((await listCustomers({ q })).items.map((c) => c.email), q).toEqual(["ana@test.cl"]);
    expect((await listCustomers({ q: "nadie" })).total).toBe(0);
    expect((await listCustomers({ sort: "gasto" })).items[0]!.email).toBe("ana@test.cl");

    const detail = await getCustomer(ana.customerId);
    expect(detail).toMatchObject({ email: "ana@test.cl", stats: { orders: 2, paid: 1, spent: 1000, average: 1000 } });
    expect(detail!.phones).toEqual(["+56987654321", "+56912345678"]);
    expect(await getCustomer(randomUUID())).toBeNull();
  });
});

describe("mi cuenta: cambiar la propia contraseña", () => {
  it("exige la actual, cierra las otras sesiones (no la de este equipo) y no audita secretos", async () => {
    const here = await createSession(adminId);
    const other = await createSession(adminId);
    await expect(changeOwnPassword(adminId, here.token, { currentPassword: "equivocada-123", password: "nueva-clave-456" })).rejects.toBeInstanceOf(UserError);
    expect(await validateSession(other.token)).not.toBeNull();

    await changeOwnPassword(adminId, here.token, { currentPassword: "clave-actual-123", password: "nueva-clave-456" });
    expect(await validateSession(here.token)).not.toBeNull();
    expect(await validateSession(other.token)).toBeNull();
    expect(await authenticate("admin@test.cl", "nueva-clave-456")).not.toBeNull();
    expect(await authenticate("admin@test.cl", "clave-actual-123")).toBeNull();
    const [log] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "user.password_change"));
    expect(JSON.stringify(log)).not.toMatch(/argon|nueva-clave/);
  });

  it("el formulario rechaza confirmaciones distintas y repetir la actual", () => {
    expect(ownPasswordSchema.safeParse({ currentPassword: "a", password: "nueva-clave-456", passwordConfirm: "otra-cosa-789" }).success).toBe(false);
    expect(ownPasswordSchema.safeParse({ currentPassword: "nueva-clave-456", password: "nueva-clave-456", passwordConfirm: "nueva-clave-456" }).success).toBe(false);
    expect(ownPasswordSchema.safeParse({ currentPassword: "a", password: "corta", passwordConfirm: "corta" }).success).toBe(false);
  });
});

describe("datos de la tienda y páginas", () => {
  it("sin datos guardados rigen los por omisión; al guardar se validan, normalizan y auditan", async () => {
    expect(await readSettings()).toEqual(DEFAULT_SETTINGS);
    const bad = settingsSchema.safeParse({ name: "X", description: "Y", whatsapp: "22 123 4567", instagram: "http://instagram.com/x", facebook: "https://evil.com/fb", email: "no-es-email" });
    expect(bad.success).toBe(false);
    expect(Object.keys(bad.error!.flatten().fieldErrors).sort()).toEqual(["email", "facebook", "instagram", "whatsapp"]);

    const data = settingsSchema.parse({ name: " Limpio ", description: "Aseo", email: " Hola@Tienda.CL ", whatsapp: "9 1234 5678", instagram: "https://www.instagram.com/limpio", orderNotifyEmail: "" });
    expect(data).toMatchObject({ name: "Limpio", email: "hola@tienda.cl", whatsapp: "+56912345678", instagram: "https://www.instagram.com/limpio", facebook: null, orderNotifyEmail: null });
    await saveSettings(adminId, data);
    expect(await readSettings()).toMatchObject(data);
    const [log] = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "settings.update"));
    expect(log).toMatchObject({ before: { name: "Tienda" }, after: { name: "Limpio" } });
  });

  it("páginas: solo las del pie; vacía = pendiente", async () => {
    expect(await getInfoPage("no-existe")).toBeNull();
    await expect(saveInfoPage(adminId, "no-existe", "x")).rejects.toBeInstanceOf(UserError);
    await saveInfoPage(adminId, "terminos", "# Términos\nTexto oficial.");
    expect(await getInfoPage("terminos")).toMatchObject({ title: "Términos y condiciones", body: "# Términos\nTexto oficial." });
    expect((await listInfoPages()).filter((p) => p.filled).map((p) => p.slug)).toEqual(["terminos"]);
    await saveInfoPage(adminId, "terminos", "");
    expect((await listInfoPages()).some((p) => p.filled)).toBe(false);
  });
});

describe("aviso a la tienda de pedido nuevo", () => {
  it("solo con correo de avisos configurado; el texto lleva el pedido y el enlace al panel", async () => {
    const v = await makeVariant(20);
    const sinAviso = await order(v.id);
    expect(await db.select().from(s.emailOutbox).where(eq(s.emailOutbox.key, `store.order_new:${sinAviso.id}`))).toHaveLength(0);

    await saveSettings(adminId, { ...DEFAULT_SETTINGS, orderNotifyEmail: "pedidos@tienda.cl" });
    const o = await order(v.id, { email: "luis@test.cl" });
    const [mail] = await db.select().from(s.emailOutbox).where(eq(s.emailOutbox.key, `store.order_new:${o.id}`));
    expect(mail).toMatchObject({ to: "pedidos@tienda.cl", kind: "store.order_new" });
    const msg = await renderEmail(db, "store.order_new", o.id);
    expect(msg!.subject).toContain(o.orderNumber);
    expect(msg!.text).toContain(`/admin/pedidos/${o.id}`);
    expect(msg!.text).toContain("luis@test.cl");
  });
});

describe("limpieza (tareas programadas)", () => {
  it("borra carritos sin cambios hace más de 30 días y sesiones vencidas", async () => {
    const v = await makeVariant(20);
    const old = await addToCart(null, { variantId: v.id, quantity: 1 });
    const fresh = await addToCart(null, { variantId: v.id, quantity: 1 });
    await db.update(s.carts).set({ updatedAt: sql`now() - interval '31 days'` }).where(eq(s.carts.id, old));
    expect(await purgeStaleCarts()).toBe(1);
    expect((await getCart(old)).lines).toHaveLength(0);
    expect((await getCart(fresh)).lines).toHaveLength(1);

    const s1 = await createSession(adminId);
    await db.insert(s.sessions).values({ id: "vencida", userId: adminId, expiresAt: new Date(Date.now() - 1000) });
    await purgeExpiredSessions();
    expect((await db.select().from(s.sessions)).map((x) => x.id)).not.toContain("vencida");
    expect(await validateSession(s1.token)).not.toBeNull();
  });
});
