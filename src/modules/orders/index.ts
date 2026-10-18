/**
 * Pedidos: creación desde el carrito (con reserva de stock), máquina de estados y consultas del panel.
 * Un pedido nace PENDING_PAYMENT con sus reservas; solo el módulo de pagos (markOrderPaid) lo pasa a PAID.
 */
import { and, asc, desc, eq, ilike, inArray, lte, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "@/db";
import * as s from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { cartLines } from "@/modules/cart";
import { normalizeChileanPhone, normalizeRut } from "@/modules/chile";
import { releaseOrderReservations, reserveStock } from "@/modules/inventory";
import { enqueueEmail } from "@/modules/mail";
import { pickupAvailable, shippingCost } from "@/lib/site";
import { applyCoupon } from "@/modules/promotions";
import { readSettings } from "@/modules/settings";
import { quoteShipping } from "@/modules/shipping";
import { isSold, SOLD_STATUSES } from "./status";

export { isSold, SOLD_STATUSES };

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
  REFUNDED: "Devuelto",
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
  UNCERTAIN: "Por verificar",
  REVIEW: "En revisión",
};

export type Fulfillment = (typeof s.fulfillment.enumValues)[number];

/** Con retiro en el local, "despachado" es "listo para retiro" y "entregado" es "retirado" (mismo estado, otro nombre). */
export function statusLabel(status: OrderStatus, fulfillment: Fulfillment) {
  if (fulfillment === "PICKUP" && status === "SHIPPED") return "Listo para retiro";
  if (fulfillment === "PICKUP" && status === "DELIVERED") return "Retirado";
  return ORDER_STATUS_LABELS[status];
}

/** Transiciones permitidas. Agregar un estado = enum + una línea aquí. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
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

/** Texto opcional normalizado (RUT, teléfono): vacío = null; inválido = error en el campo. */
const normalized = (normalize: (v: string) => string | null, message: string) =>
  field.optText(30).transform((v, ctx) => {
    if (v === null) return null;
    const n = normalize(v);
    if (!n) ctx.addIssue({ code: "custom", message });
    return n;
  });

/**
 * Datos del checkout. `expectedTotal` es el total (productos + despacho) que el cliente vio al confirmar:
 * no se usa para cobrar (los montos se recalculan aquí), solo para no crear un pedido con montos que no aceptó.
 * Con `delivery: "retiro"` no hay despacho: comuna y dirección no se piden (y se ignoran si llegan).
 */
export const orderInputSchema = z
  .object({
  // Sin indicar = despacho (el comportamiento de siempre).
  delivery: z.enum(["despacho", "retiro"]).optional(),
  // Recortar antes de validar (z.email().trim() rechaza "ana@x.cl " del autocompletado del celular).
  email: z.string().trim().toLowerCase().max(200, "Máximo 200 caracteres").pipe(z.email("Email inválido")),
  firstName: field.text(100),
  lastName: field.text(100),
  phone: normalized(normalizeChileanPhone, "Teléfono chileno inválido (ej. 9 1234 5678)").refine((v) => v !== null, "Obligatorio"),
  rut: normalized(normalizeRut, "RUT inválido"),
  communeId: field.optInt(1, 1_000_000),
  street: field.optText(120),
  number: field.optText(20),
  apartment: field.optText(40),
  notes: field.optText(300),
  couponCode: field.optText(40).optional(),
  expectedTotal: field.int(0),
})
  .superRefine((d, ctx) => {
    if (d.delivery === "retiro") return;
    for (const k of ["communeId", "street", "number"] as const) if (d[k] === null) ctx.addIssue({ code: "custom", path: [k], message: "Obligatorio" });
  });
export type OrderInput = z.infer<typeof orderInputSchema>;

/** Cliente con cuenta: su ficha (se crea la primera vez). Invitado: una ficha nueva por pedido. */
async function customerFor(tx: Transaction, input: OrderInput, userId: string | null) {
  const values = { userId, email: input.email, firstName: input.firstName, lastName: input.lastName, phone: input.phone, rut: input.rut };
  const [c] = userId
    ? await tx.insert(s.customers).values(values).onConflictDoUpdate({ target: s.customers.userId, set: { updatedAt: new Date() } }).returning({ id: s.customers.id })
    : await tx.insert(s.customers).values(values).returning({ id: s.customers.id });
  return c!.id;
}

/**
 * Convierte el carrito en un pedido PENDING_PAYMENT. Todo en una transacción: pedido, ítems (copia de nombre,
 * SKU y precio), historial, reservas y borrado del carrito; si algo falla —precio cambiado, producto retirado,
 * stock insuficiente— no queda nada y el carrito sigue intacto.
 * `opts.within` corre en la MISMA transacción con el pedido ya reservado (el módulo de pagos crea ahí el intento).
 */
export async function createOrderFromCart(
  cartId: string,
  input: OrderInput,
  userId: string | null = null,
  opts: { reservationMinutes?: number; within?: (tx: Transaction, order: Order, reservedUntil: Date) => Promise<void> } = {},
) {
  await expireOrders(); // verificación perezosa: lo vencido no debe bloquear este pedido
  return db.transaction(async (tx) => {
    // Un doble envío del mismo carrito espera aquí y luego lo encuentra borrado: nunca dos pedidos.
    const [cart] = await tx.select({ id: s.carts.id }).from(s.carts).where(eq(s.carts.id, cartId)).for("update");
    const lines = cart ? await cartLines(tx, cartId) : [];
    if (!lines.length) throw new UserError("Tu carrito está vacío.");
    const bad = lines.find((l) => l.problem);
    if (bad) throw new UserError(`${bad.productName} (${bad.variantName}): ${bad.problem}. Revisa tu carrito.`);
    const subtotal = lines.reduce((t, l) => t + l.lineTotal, 0);
    const pickup = input.delivery === "retiro";
    const settings = await readSettings(tx);
    // Retiro: sin costo ni dirección, y solo si el local lo ofrece ahora (se comprueba aquí, no en el formulario).
    if (pickup && !pickupAvailable(settings)) throw new UserError("El retiro en el local no está disponible. Elige despacho a domicilio.");
    const ship = pickup ? null : input.communeId ? await quoteShipping(input.communeId, tx) : null;
    if (!pickup && !ship) throw new UserError("Por ahora no despachamos a esa comuna.", "communeId");
    // Cupón bloqueado hasta el final de la transacción: dos pedidos a la vez no superan su máximo de usos.
    const coupon = input.couponCode ? await applyCoupon(tx, input.couponCode, { subtotal, email: input.email, lock: true }) : null;
    const discountTotal = coupon?.discount ?? 0;
    const shippingTotal = ship ? shippingCost(ship.cost, subtotal - discountTotal, settings) : 0;
    const total = subtotal - discountTotal + shippingTotal;
    if (total !== input.expectedTotal) throw new UserError("El total cambió (precios, despacho o descuento). Revisa el resumen antes de confirmar.");

    const [order] = await tx
      .insert(s.orders)
      .values({
        customerId: await customerFor(tx, input, userId),
        email: input.email,
        customerName: `${input.firstName} ${input.lastName}`,
        phone: input.phone,
        rut: input.rut,
        fulfillment: pickup ? "PICKUP" : "DELIVERY",
        shippingCommuneId: ship?.communeId ?? null,
        // Copia de la dirección: el pedido no cambia si después se edita la comuna o la libreta del cliente.
        shippingAddress: ship
          ? {
              recipientName: `${input.firstName} ${input.lastName}`,
              phone: input.phone,
              street: input.street!,
              number: input.number!,
              apartment: input.apartment,
              commune: ship.commune,
              region: ship.region,
              notes: input.notes,
            }
          : null,
        subtotal,
        discountTotal,
        couponCode: coupon?.code ?? null,
        shippingTotal,
        total,
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
    const [reserved] = await reserveStock(tx, order!.id, lines, opts.reservationMinutes);
    await opts.within?.(tx, order!, reserved!.expiresAt);
    await tx.delete(s.carts).where(eq(s.carts.id, cartId));
    return order!;
  });
}

// ───────────── Estados ─────────────

export async function lockOrder(tx: Transaction, orderId: string) {
  const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId)).for("update");
  if (!o) throw new UserError("El pedido no existe.");
  return o;
}

/**
 * Aplica una transición sobre un pedido ya bloqueado. Cancelar libera las reservas y cierra sus solicitudes de pago
 * pendientes (vencidas o anuladas aquí, sin afirmar nada sobre el dinero: si llega, se registra como pago tardío).
 */
async function transition(tx: Transaction, o: Order, to: OrderStatus, opts: { userId: string | null; note?: string | null; paymentStatus?: PaymentStatus }) {
  if (!TRANSITIONS[o.status].includes(to))
    throw new UserError(`Un pedido "${ORDER_STATUS_LABELS[o.status]}" no puede pasar a "${ORDER_STATUS_LABELS[to]}".`);
  const cancel = to === "CANCELLED";
  if (cancel) {
    await releaseOrderReservations(tx, o.id);
    await tx
      .update(s.payments)
      // Solo el vencimiento indica paymentStatus; una cancelación del panel o del cliente anula.
      .set({ status: opts.paymentStatus ? "EXPIRED" : "CANCELLED" })
      .where(and(eq(s.payments.orderId, o.id), eq(s.payments.status, "PENDING")));
  }
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
    if (input.to === "SHIPPED") await enqueueEmail(tx, "order.shipped", row);
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
      // Un pago en revisión o ya devuelto no se borra del resumen: el pedido se cancela, el dinero conserva su estado.
      const paymentStatus = o.paymentStatus === "PENDING" ? "EXPIRED" : o.paymentStatus;
      await transition(tx, o, "CANCELLED", { userId: null, paymentStatus, note: "Reserva vencida: no se recibió el pago a tiempo." });
      n++;
    });
  return n;
}

// ───────────── Pago (lo llama solo el módulo de pagos, con el pedido bloqueado) ─────────────

/** Un pedido cancelado por vencimiento (no expresamente) puede recuperarse si llega el pago y hay stock. */
export const recoverable = (o: Pick<Order, "status" | "paymentStatus">) => o.status === "CANCELLED" && o.paymentStatus === "EXPIRED";

/** Pago verificado y venta ya registrada: PENDING_PAYMENT (o cancelado por vencimiento) → PAID. */
export async function markOrderPaid(tx: Transaction, o: Order, opts: { method: string; userId: string | null; note: string }) {
  if (o.status !== "PENDING_PAYMENT" && !recoverable(o)) throw new Error(`El pedido ${o.orderNumber} no está esperando un pago.`);
  const [row] = await tx
    .update(s.orders)
    .set({ status: "PAID", paymentStatus: "PAID", paymentMethod: opts.method, paidAt: new Date(), cancelledAt: null })
    .where(eq(s.orders.id, o.id))
    .returning();
  await tx.insert(s.orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: "PAID", changedBy: opts.userId, note: opts.note });
  await enqueueEmail(tx, "order.paid", row!);
  return row!;
}

/**
 * Un pedido pagado se anula (pagado o en preparación → CANCELLED) o se devuelve (despachado o entregado → REFUNDED).
 * El dinero queda por devolver (REVIEW) hasta que se registre el reembolso. Lo llama solo el módulo de pagos, con el
 * pedido bloqueado; el stock lo devuelve quien llama.
 */
export async function reversePaidOrder(tx: Transaction, o: Order, opts: { userId: string; note: string }) {
  const to: OrderStatus = o.status === "SHIPPED" || o.status === "DELIVERED" ? "REFUNDED" : "CANCELLED";
  if (!isSold(o.status) || !TRANSITIONS[o.status].includes(to))
    throw new UserError(`Un pedido "${ORDER_STATUS_LABELS[o.status]}" no se puede anular ni devolver.`);
  // Otra solicitud de pago que quedó abierta (otro medio que el cliente alcanzó a iniciar) ya no corresponde.
  await tx.update(s.payments).set({ status: "CANCELLED" }).where(and(eq(s.payments.orderId, o.id), eq(s.payments.status, "PENDING")));
  const [row] = await tx.update(s.orders).set({ status: to, paymentStatus: "REVIEW", cancelledAt: new Date() }).where(eq(s.orders.id, o.id)).returning();
  await tx.insert(s.orderStatusHistory).values({ orderId: o.id, fromStatus: o.status, toStatus: to, changedBy: opts.userId, note: opts.note });
  return row!;
}

/** Resumen de dinero del pedido (p. ej. REVIEW: hay un pago recibido por resolver). No cambia su estado operativo. */
export async function setOrderPaymentStatus(tx: Transaction, o: Order, paymentStatus: PaymentStatus) {
  await tx.update(s.orders).set({ paymentStatus }).where(eq(s.orders.id, o.id));
}

/** Pago tardío sin stock sobre un pedido aún pendiente: se cancela como vencido, con el dinero en revisión. */
export function cancelExpiredWithPayment(tx: Transaction, o: Order, note: string) {
  return transition(tx, o, "CANCELLED", { userId: null, paymentStatus: "REVIEW", note });
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
      fulfillment: s.orders.fulfillment,
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

/** "1003", "001003", "ord 1003" u "ORD-001003" → "ORD-001003"; null si no parece un número de pedido. */
export function normalizeOrderNumber(v: string): string | null {
  const m = v.trim().toUpperCase().match(/^(?:ORD[-\s]?)?0*(\d{1,9})$/);
  return m ? `ORD-${m[1]!.padStart(6, "0")}` : null;
}

/**
 * Seguimiento sin cuenta: número y email del pedido → su id (el enlace secreto del comprobante). Tienen que
 * coincidir los dos; el número solo no basta (es correlativo).
 */
export async function findOrderId(number: string, email: string) {
  const n = normalizeOrderNumber(number);
  if (!n) return null;
  const [o] = await db
    .select({ id: s.orders.id })
    .from(s.orders)
    .where(and(eq(s.orders.orderNumber, n), eq(s.orders.email, email.trim().toLowerCase())));
  return o?.id ?? null;
}

export async function getOrder(id: string) {
  const [order] = await db.select().from(s.orders).where(eq(s.orders.id, id));
  if (!order) return null;
  const [items, history, reservations, customer, [returned]] = await Promise.all([
    db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id)).orderBy(asc(s.orderItems.productName), asc(s.orderItems.sku)),
    db
      .select({ entry: s.orderStatusHistory, email: s.users.email })
      .from(s.orderStatusHistory)
      .leftJoin(s.users, eq(s.users.id, s.orderStatusHistory.changedBy))
      .where(eq(s.orderStatusHistory.orderId, id))
      .orderBy(asc(s.orderStatusHistory.createdAt), asc(s.orderStatusHistory.id)),
    db.select().from(s.stockReservations).where(eq(s.stockReservations.orderId, id)),
    db.select({ userId: s.customers.userId }).from(s.customers).where(eq(s.customers.id, order.customerId)),
    // Unidades que volvieron al stock al anular o devolver el pedido.
    db
      .select({ units: sql<number>`coalesce(sum(${s.inventoryMovements.quantity}), 0)::int` })
      .from(s.inventoryMovements)
      .where(
        and(
          eq(s.inventoryMovements.referenceType, "ORDER"),
          eq(s.inventoryMovements.referenceId, id),
          inArray(s.inventoryMovements.type, ["SALE_CANCELLED", "RETURN"]),
        ),
      ),
  ]);
  return { order, items, history, reservations, hasAccount: !!customer[0]?.userId, returnedUnits: returned!.units };
}
