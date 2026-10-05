/**
 * Pedidos: creación desde el carrito (con reserva de stock), máquina de estados y consultas del panel.
 * Un pedido nace PENDING_PAYMENT con sus reservas; solo el módulo de pagos (FASE 7) lo pasa a PAID.
 */
import { and, asc, desc, eq, ilike, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import * as s from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { cartLines } from "@/modules/cart";
import { releaseOrderReservations, reserveStock } from "@/modules/inventory";

export type OrderStatus = (typeof s.orderStatus.enumValues)[number];
export type PaymentStatus = (typeof s.paymentStatus.enumValues)[number];
type Order = typeof s.orders.$inferSelect;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Pendiente de pago",
  PAID: "Pagado",
  PROCESSING: "En preparación",
  SHIPPED: "Despachado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  AUTHORIZED: "Autorizado",
  PAID: "Pagado",
  FAILED: "Rechazado",
  EXPIRED: "Vencido",
  CANCELLED: "Anulado",
  REFUNDED: "Reembolsado",
  PARTIALLY_REFUNDED: "Reembolso parcial",
};

/** Transiciones permitidas. Agregar un estado = enum + una línea aquí. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Lo que mueve dinero (cobrar, reembolsar, anular algo pagado o con un pago autorizado) lo hace solo
 * el módulo de pagos (FASE 7), con confirmación verificada del proveedor. Nunca desde el panel.
 */
const movesMoney = (o: Pick<Order, "status" | "paymentStatus">, to: OrderStatus) =>
  to === "PAID" ||
  to === "REFUNDED" ||
  (to === "CANCELLED" && (o.status !== "PENDING_PAYMENT" || o.paymentStatus === "AUTHORIZED" || o.paymentStatus === "PAID"));

/** Cambios que el personal puede hacer desde el panel. */
export const manualTransitions = (o: Pick<Order, "status" | "paymentStatus">) => TRANSITIONS[o.status].filter((to) => !movesMoney(o, to));

// ───────────── Creación ─────────────

/**
 * Datos mínimos para crear un pedido. `expectedTotal` es el total que el cliente vio al confirmar:
 * no se usa para cobrar (los montos se recalculan aquí), solo para no crear un pedido con precios que no aceptó.
 * El checkout (FASE 6) agrega dirección, despacho, teléfono y RUT.
 */
export const orderInputSchema = z.object({
  email: z.email("Email inválido").trim().toLowerCase().max(200, "Máximo 200 caracteres"),
  firstName: field.text(100),
  lastName: field.text(100),
  expectedTotal: field.int(0),
});
export type OrderInput = z.infer<typeof orderInputSchema>;

/** Cliente con cuenta: su ficha (se crea la primera vez). Invitado: una ficha nueva por pedido. */
async function customerFor(tx: Transaction, input: OrderInput, userId: string | null) {
  const values = { userId, email: input.email, firstName: input.firstName, lastName: input.lastName };
  const [c] = userId
    ? await tx.insert(s.customers).values(values).onConflictDoUpdate({ target: s.customers.userId, set: { updatedAt: new Date() } }).returning({ id: s.customers.id })
    : await tx.insert(s.customers).values(values).returning({ id: s.customers.id });
  return c!.id;
}

/**
 * Convierte el carrito en un pedido PENDING_PAYMENT. Todo en una transacción: pedido, ítems (copia de nombre,
 * SKU y precio), historial, reservas y borrado del carrito; si algo falla —precio cambiado, producto retirado,
 * stock insuficiente— no queda nada y el carrito sigue intacto.
 */
export async function createOrderFromCart(cartId: string, input: OrderInput, userId: string | null = null) {
  await expireOrders(); // verificación perezosa: lo vencido no debe bloquear este pedido
  return db.transaction(async (tx) => {
    // Un doble envío del mismo carrito espera aquí y luego lo encuentra borrado: nunca dos pedidos.
    const [cart] = await tx.select({ id: s.carts.id }).from(s.carts).where(eq(s.carts.id, cartId)).for("update");
    const lines = cart ? await cartLines(tx, cartId) : [];
    if (!lines.length) throw new UserError("Tu carrito está vacío.");
    const bad = lines.find((l) => l.problem);
    if (bad) throw new UserError(`${bad.productName} (${bad.variantName}): ${bad.problem}. Revisa tu carrito.`);
    const subtotal = lines.reduce((t, l) => t + l.lineTotal, 0);
    if (subtotal !== input.expectedTotal) throw new UserError("Los precios de tu carrito cambiaron. Revisa el total antes de confirmar.");

    const [order] = await tx
      .insert(s.orders)
      .values({
        customerId: await customerFor(tx, input, userId),
        email: input.email,
        customerName: `${input.firstName} ${input.lastName}`,
        subtotal,
        total: subtotal,
      })
      .returning();
    await tx.insert(s.orderItems).values(
      lines.map((l) => ({
        orderId: order!.id,
        variantId: l.variantId,
        productName: l.productName,
        variantName: l.variantName,
        sku: l.sku,
        unitPrice: l.price,
        quantity: l.quantity,
        lineTotal: l.lineTotal,
      })),
    );
    await tx.insert(s.orderStatusHistory).values({ orderId: order!.id, toStatus: "PENDING_PAYMENT", changedBy: userId });
    // Reserva atómica (FASE 4): si otro cliente se llevó el stock entre la lectura y aquí, lanza y se revierte todo.
    await reserveStock(tx, order!.id, lines);
    await tx.delete(s.carts).where(eq(s.carts.id, cartId));
    return order!;
  });
}

// ───────────── Estados ─────────────

async function lockOrder(tx: Transaction, orderId: string) {
  const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId)).for("update");
  if (!o) throw new UserError("El pedido no existe.");
  return o;
}

/** Aplica una transición sobre un pedido ya bloqueado. Cancelar libera las reservas en la misma transacción. */
async function transition(tx: Transaction, o: Order, to: OrderStatus, opts: { userId: string | null; note?: string | null; paymentStatus?: PaymentStatus }) {
  if (!TRANSITIONS[o.status].includes(to))
    throw new UserError(`Un pedido "${ORDER_STATUS_LABELS[o.status]}" no puede pasar a "${ORDER_STATUS_LABELS[to]}".`);
  const cancel = to === "CANCELLED";
  if (cancel) await releaseOrderReservations(tx, o.id);
  const [row] = await tx
    .update(s.orders)
    .set({
      status: to,
      ...(cancel && { cancelledAt: new Date(), paymentStatus: opts.paymentStatus ?? (o.paymentStatus === "PENDING" ? "CANCELLED" : o.paymentStatus) }),
    })
    .where(eq(s.orders.id, o.id))
    .returning();
  await tx.insert(s.orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: to, changedBy: opts.userId, note: opts.note });
  return row!;
}

export const statusChangeSchema = z.object({ to: z.enum(s.orderStatus.enumValues), note: field.optText(500) });

/** Cambio de estado desde el panel (permiso orders:manage), con auditoría. */
export async function changeOrderStatus(userId: string, orderId: string, input: z.infer<typeof statusChangeSchema>) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (TRANSITIONS[o.status].includes(input.to) && movesMoney(o, input.to))
      throw new UserError("Ese cambio involucra el pago: lo registra el módulo de pagos con la confirmación del proveedor.");
    if (input.to === "CANCELLED" && !input.note) throw new UserError("Indica el motivo de la cancelación.", "note");
    const row = await transition(tx, o, input.to, { userId, note: input.note });
    const pick = (x: Order) => ({ status: x.status, paymentStatus: x.paymentStatus });
    await audit(tx, { userId, action: "order.status", entityType: "order", entityId: o.id, before: pick(o), after: pick(row) });
    return row;
  });
}

/**
 * Cancela los pedidos impagos cuya reserva venció y devuelve su stock al disponible.
 * Corre como tarea periódica (src/instrumentation.ts) y antes de crear cada pedido.
 * Un pedido por transacción: cada una bloquea solo sus variantes (en orden de id), sin deadlocks con pedidos nuevos.
 */
export async function expireOrders() {
  const due = await db
    .selectDistinct({ id: s.stockReservations.orderId })
    .from(s.stockReservations)
    .innerJoin(s.orders, eq(s.orders.id, s.stockReservations.orderId))
    .where(and(eq(s.stockReservations.status, "ACTIVE"), lte(s.stockReservations.expiresAt, sql`now()`), eq(s.orders.status, "PENDING_PAYMENT")));
  let n = 0;
  for (const { id } of due)
    await db.transaction(async (tx) => {
      const o = await lockOrder(tx, id);
      // Otro proceso ya lo tomó, o hay un pago en curso (lo resuelve el módulo de pagos).
      if (o.status !== "PENDING_PAYMENT" || movesMoney(o, "CANCELLED")) return;
      await transition(tx, o, "CANCELLED", { userId: null, paymentStatus: "EXPIRED", note: "Reserva vencida: no se recibió el pago a tiempo." });
      n++;
    });
  return n;
}

// ───────────── Consultas del panel ─────────────

export const ORDERS_PAGE_SIZE = 50;

export async function listOrders(f: { q?: string; status?: OrderStatus; page?: number }) {
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(or(ilike(s.orders.orderNumber, like), ilike(s.orders.email, like), ilike(s.orders.customerName, like))!);
  }
  if (f.status) where.push(eq(s.orders.status, f.status));
  const page = f.page ?? 1;
  const rows = await db
    .select({
      id: s.orders.id,
      orderNumber: s.orders.orderNumber,
      customerName: s.orders.customerName,
      email: s.orders.email,
      total: s.orders.total,
      status: s.orders.status,
      paymentStatus: s.orders.paymentStatus,
      createdAt: s.orders.createdAt,
      // "orders"."id" explícito: sin joins Drizzle escribe la columna sin tabla y dentro de la subconsulta sería i.id.
      items: sql<number>`(SELECT coalesce(sum(i.quantity), 0)::int FROM order_items i WHERE i.order_id = "orders"."id")`,
      matches: sql<number>`count(*) OVER ()::int`,
    })
    .from(s.orders)
    .where(and(...where))
    .orderBy(desc(s.orders.createdAt), desc(s.orders.id))
    .limit(ORDERS_PAGE_SIZE)
    .offset((page - 1) * ORDERS_PAGE_SIZE);
  return { items: rows, total: rows[0]?.matches ?? 0 };
}

/** Para el inicio del panel: pedidos esperando pago y pagados que hay que preparar. */
export async function orderStats() {
  const [r] = await db
    .select({
      pending: sql<number>`count(*) FILTER (WHERE ${s.orders.status} = 'PENDING_PAYMENT')::int`,
      paid: sql<number>`count(*) FILTER (WHERE ${s.orders.status} = 'PAID')::int`,
    })
    .from(s.orders);
  return r!;
}

export async function getOrder(id: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, id));
  if (!order) return null;
  const [items, history, reservations, customer] = await Promise.all([
    db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id)).orderBy(asc(s.orderItems.productName), asc(s.orderItems.sku)),
    db
      .select({ entry: s.orderStatusHistory, email: s.users.email })
      .from(s.orderStatusHistory)
      .leftJoin(s.users, eq(s.users.id, s.orderStatusHistory.changedBy))
      .where(eq(s.orderStatusHistory.orderId, id))
      .orderBy(asc(s.orderStatusHistory.createdAt), asc(s.orderStatusHistory.id)),
    db.select().from(s.stockReservations).where(eq(s.stockReservations.orderId, id)),
    db.select({ userId: s.customers.userId }).from(s.customers).where(eq(s.customers.id, order.customerId)),
  ]);
  return { order, items, history, reservations, hasAccount: !!customer[0]?.userId };
}
