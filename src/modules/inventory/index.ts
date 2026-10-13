/**
 * Inventario: única puerta para cambiar stock_on_hand (applyMovement), operaciones del panel y reservas.
 * stock_on_hand = físico en bodega · stock_reserved = apartado para pedidos pendientes · disponible = físico − reservado.
 * Los CHECK de la base (nunca negativo, nunca reservado > físico) respaldan todo lo de aquí aunque el código falle.
 */
import { and, asc, desc, eq, ilike, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import { inventoryMovements, movementType, products, productVariants, stockReservations, users } from "@/db/schema";
import { env } from "@/lib/env";
import { field, UserError } from "@/lib/form";

export type MovementType = (typeof movementType.enumValues)[number];

/** Signo obligatorio de cada tipo: 1 entra, −1 sale, 0 cualquiera (ajuste). */
const SIGN: Record<MovementType, 1 | -1 | 0> = {
  INITIAL_STOCK: 1,
  PURCHASE: 1,
  SALE: -1,
  SALE_CANCELLED: 1,
  RETURN: 1,
  DAMAGED: -1,
  MANUAL_ADJUSTMENT: 0,
};

/**
 * ÚNICA puerta para cambiar stock_on_hand. Exige una transacción: el stock y su movimiento se guardan juntos o ninguno.
 * El UPDATE bloquea la fila, así previous/resulting son exactos aunque haya cambios simultáneos;
 * los CHECK de la base rechazan cualquier resultado negativo o menor a lo reservado.
 * `fromReserved` (solo SALE): unidades que salen de lo reservado en el MISMO UPDATE; en dos pasos, el intermedio
 * (físico bajo y reservado intacto) violaría reservado ≤ físico.
 */
export async function applyMovement(
  tx: Transaction,
  m: {
    variantId: string;
    type: MovementType;
    quantity: number;
    fromReserved?: number;
    reason?: string | null;
    referenceType?: string;
    referenceId?: string | null;
    userId?: string | null;
  },
) {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) throw new Error("La cantidad del movimiento debe ser un entero distinto de 0.");
  const sign = SIGN[m.type];
  if (sign !== 0 && Math.sign(m.quantity) !== sign) throw new Error(`Un movimiento ${m.type} debe ser ${sign > 0 ? "positivo" : "negativo"}.`);
  if (m.type === "MANUAL_ADJUSTMENT" && !m.reason?.trim()) throw new Error("Un ajuste manual requiere motivo.");
  const fromReserved = m.fromReserved ?? 0;
  if (fromReserved && (m.type !== "SALE" || !Number.isInteger(fromReserved) || fromReserved < 0 || fromReserved > -m.quantity))
    throw new Error("Solo una venta descuenta lo reservado, y nunca más que lo vendido.");
  const [row] = await tx
    .update(productVariants)
    .set({
      stockOnHand: sql`${productVariants.stockOnHand} + ${m.quantity}`,
      ...(fromReserved && { stockReserved: sql`${productVariants.stockReserved} - ${fromReserved}` }),
    })
    .where(eq(productVariants.id, m.variantId))
    .returning({ stock: productVariants.stockOnHand });
  if (!row) throw new Error(`Variante ${m.variantId} no existe.`);
  const [movement] = await tx
    .insert(inventoryMovements)
    .values({
      variantId: m.variantId,
      type: m.type,
      quantity: m.quantity,
      previousStock: row.stock - m.quantity,
      resultingStock: row.stock,
      reason: m.reason,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      createdBy: m.userId ?? null,
      // Hora real del cambio (con la fila ya bloqueada), no la de inicio de la transacción (now()):
      // así el historial ordenado por fecha sigue el orden en que se aplicaron los movimientos concurrentes.
      createdAt: sql`clock_timestamp()`,
    })
    .returning();
  return movement!;
}

// ───────────── Operaciones del panel ─────────────

const MAX_QTY = 1_000_000;

/** Ingreso de mercadería, merma/pérdida o conteo físico (fija el stock al valor contado). */
export const stockOperationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PURCHASE"), quantity: field.int(1, MAX_QTY), reference: field.optText(100), reason: field.optText(500) }),
  z.object({ type: z.literal("DAMAGED"), quantity: field.int(1, MAX_QTY), reason: field.text(500) }),
  // expectedStock = stock físico que vio el operador: si cambió mientras contaba, el conteo ya no es válido.
  z.object({ type: z.literal("COUNT"), counted: field.int(0, MAX_QTY), expectedStock: field.int(0, 100_000_000), reason: field.text(500) }),
]);
export type StockOperation = z.infer<typeof stockOperationSchema>;

export async function adjustStock(userId: string, variantId: string, op: StockOperation) {
  return db.transaction(async (tx) => {
    // Bloquea la variante: nada cambia su stock entre esta lectura y el movimiento.
    const [v] = await tx
      .select({ onHand: productVariants.stockOnHand, reserved: productVariants.stockReserved })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .for("update");
    if (!v) throw new UserError("La variante no existe.");
    const available = v.onHand - v.reserved;
    const base = { variantId, reason: op.reason, userId };

    if (op.type === "PURCHASE")
      return applyMovement(tx, { ...base, type: "PURCHASE", quantity: op.quantity, referenceType: op.reference ? "DOCUMENT" : undefined, referenceId: op.reference });

    if (op.type === "DAMAGED") {
      if (op.quantity > available) throw new UserError(`Solo hay ${available} disponibles (${v.reserved} reservadas para pedidos).`, "quantity");
      return applyMovement(tx, { ...base, type: "DAMAGED", quantity: -op.quantity });
    }

    if (v.onHand !== op.expectedStock) throw new UserError(`El stock cambió mientras tanto: ahora hay ${v.onHand} en bodega. Revisa el conteo.`);
    if (op.counted < v.reserved) throw new UserError(`No puede quedar bajo lo reservado para pedidos (${v.reserved}).`, "counted");
    if (op.counted === v.onHand) throw new UserError(`El stock ya es ${v.onHand}; no hay nada que ajustar.`, "counted");
    return applyMovement(tx, { ...base, type: "MANUAL_ADJUSTMENT", quantity: op.counted - v.onHand, referenceType: "COUNT" });
  });
}

// ───────────── Reservas ─────────────

export class InsufficientStockError extends UserError {
  constructor(
    public variantId: string,
    public available: number,
  ) {
    super(available > 0 ? `Solo quedan ${available} unidades disponibles.` : "Sin stock disponible.");
  }
}

const byVariant = <T extends { variantId: string }>(items: T[]) => [...items].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));

/**
 * Reserva stock para un pedido. Todo o nada: si una línea no alcanza lanza InsufficientStockError y la transacción se revierte.
 * El UPDATE condicional evita la sobreventa: con stock 1 y dos clientes a la vez, el segundo ve la fila ya actualizada y falla.
 * No crea movimientos: reservar no cambia el stock físico.
 */
export async function reserveStock(tx: Transaction, orderId: string, items: { variantId: string; quantity: number }[], ttlMinutes = env.RESERVATION_TTL_MINUTES) {
  if (items.length === 0) throw new Error("Una reserva necesita al menos una línea.");
  // Orden fijo por variante: dos pedidos con los mismos productos nunca se bloquean mutuamente (deadlock).
  for (const it of byVariant(items)) {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) throw new Error("La cantidad a reservar debe ser un entero positivo.");
    const [ok] = await tx
      .update(productVariants)
      .set({ stockReserved: sql`${productVariants.stockReserved} + ${it.quantity}` })
      .where(and(eq(productVariants.id, it.variantId), sql`${productVariants.stockOnHand} - ${productVariants.stockReserved} >= ${it.quantity}`))
      .returning({ id: productVariants.id });
    if (!ok) {
      const [v] = await tx.select({ available: sql<number>`${productVariants.stockOnHand} - ${productVariants.stockReserved}` }).from(productVariants).where(eq(productVariants.id, it.variantId));
      throw new InsufficientStockError(it.variantId, v?.available ?? 0);
    }
  }
  // Vencimiento con el reloj de la base, el mismo que usa releaseExpiredReservations.
  const expiresAt = sql`now() + make_interval(mins => ${ttlMinutes})`;
  return tx
    .insert(stockReservations)
    .values(items.map((it) => ({ orderId, variantId: it.variantId, quantity: it.quantity, expiresAt })))
    .returning();
}

/**
 * Libera reservas ACTIVE y devuelve su cantidad al disponible. Idempotente: el UPDATE … WHERE status = 'ACTIVE'
 * toma cada reserva una sola vez aunque dos procesos liberen a la vez; las ya liberadas o consumidas no se tocan.
 */
async function releaseWhere(tx: Transaction, where: SQL) {
  const released = await tx.update(stockReservations).set({ status: "RELEASED" }).where(and(eq(stockReservations.status, "ACTIVE"), where)).returning();
  for (const r of byVariant(released))
    await tx
      .update(productVariants)
      .set({ stockReserved: sql`${productVariants.stockReserved} - ${r.quantity}` })
      .where(eq(productVariants.id, r.variantId));
  return released;
}

/** Pago fallido, anulado o pedido cancelado antes de pagar. */
export function releaseOrderReservations(tx: Transaction, orderId: string) {
  return releaseWhere(tx, eq(stockReservations.orderId, orderId));
}

/**
 * Pago confirmado: cada reserva ACTIVE del pedido pasa a CONSUMED y se registra su venta (SALE), que baja físico y
 * reservado juntos. Se toma cada reserva una sola vez (UPDATE … WHERE ACTIVE), y la base impide una segunda venta
 * del mismo pedido y producto. Quien llama debe tener bloqueado el pedido y haber comprobado que la reserva sigue vigente.
 */
export async function consumeOrderReservations(tx: Transaction, orderId: string, userId: string | null = null) {
  const taken = await tx
    .update(stockReservations)
    .set({ status: "CONSUMED" })
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "ACTIVE")))
    .returning();
  for (const r of byVariant(taken))
    await applyMovement(tx, { variantId: r.variantId, type: "SALE", quantity: -r.quantity, fromReserved: r.quantity, referenceType: "ORDER", referenceId: orderId, userId });
  return taken;
}

/** Reservas ACTIVE del pedido y si siguen vigentes según el reloj de la base (aunque el job de vencimiento no haya corrido). */
export async function reservationState(tx: Transaction, orderId: string) {
  const [r] = await tx
    .select({
      active: sql<number>`count(*)::int`,
      live: sql<boolean>`coalesce(bool_and(${stockReservations.expiresAt} > now()), false)`,
      expiresAt: sql<Date | null>`min(${stockReservations.expiresAt})`.mapWith((v) => (v ? new Date(v) : null)),
    })
    .from(stockReservations)
    .where(and(eq(stockReservations.orderId, orderId), eq(stockReservations.status, "ACTIVE")));
  return { active: r!.active, live: r!.active > 0 && r!.live, expiresAt: r!.expiresAt };
}

/** Para la tarea periódica (y la verificación perezosa) de reservas vencidas. */
export function releaseExpiredReservations() {
  return db.transaction((tx) => releaseWhere(tx, lte(stockReservations.expiresAt, sql`now()`)));
}

// ───────────── Consultas del panel ─────────────

export const INVENTORY_PAGE_SIZE = 50;
const available = sql<number>`${productVariants.stockOnHand} - ${productVariants.stockReserved}`;

/** Variantes con su stock. `stock` filtra (solo variantes a la venta) igual que el listado de productos. */
export async function listInventory(f: { q?: string; stock?: "agotado" | "bajo"; page?: number }) {
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      or(sql`f_unaccent(lower(${products.name})) LIKE f_unaccent(lower(${like}))`, ilike(productVariants.sku, like), eq(productVariants.barcode, f.q))!,
    );
  }
  if (f.stock === "agotado") where.push(sql`${productVariants.active} AND ${available} <= 0`);
  if (f.stock === "bajo") where.push(sql`${productVariants.active} AND ${available} > 0 AND ${available} <= ${productVariants.minimumStock}`);
  const page = f.page ?? 1;
  const rows = await db
    .select({
      id: productVariants.id,
      productId: products.id,
      product: products.name,
      productActive: products.active,
      name: productVariants.name,
      sku: productVariants.sku,
      onHand: productVariants.stockOnHand,
      reserved: productVariants.stockReserved,
      available,
      minimum: productVariants.minimumStock,
      active: productVariants.active,
      total: sql<number>`count(*) OVER ()::int`,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(...where))
    .orderBy(asc(products.name), asc(productVariants.sortOrder), asc(productVariants.id))
    .limit(INVENTORY_PAGE_SIZE)
    .offset((page - 1) * INVENTORY_PAGE_SIZE);
  return { items: rows, total: rows[0]?.total ?? 0 };
}

export async function getVariantStock(variantId: string) {
  const [v] = await db
    .select({
      id: productVariants.id,
      productId: products.id,
      product: products.name,
      name: productVariants.name,
      sku: productVariants.sku,
      onHand: productVariants.stockOnHand,
      reserved: productVariants.stockReserved,
      available,
      minimum: productVariants.minimumStock,
      active: productVariants.active,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId));
  return v ?? null;
}

/** Historial de una variante, del más reciente al más antiguo. Trae uno extra para saber si hay página siguiente. */
export async function listMovements(variantId: string, page = 1) {
  return db
    .select({ movement: inventoryMovements, email: users.email })
    .from(inventoryMovements)
    .leftJoin(users, eq(users.id, inventoryMovements.createdBy))
    .where(eq(inventoryMovements.variantId, variantId))
    .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
    .limit(INVENTORY_PAGE_SIZE + 1)
    .offset((page - 1) * INVENTORY_PAGE_SIZE);
}
