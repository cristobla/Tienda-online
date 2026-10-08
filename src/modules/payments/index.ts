/**
 * PaymentService: orquesta intentos, resultados y la confirmación del pedido. applyResult() es el ÚNICO lugar donde
 * un pago confirma un pedido: la transferencia (comprobada por el admin) y las pasarelas (retorno, webhook, consulta)
 * llegan ahí con un resultado VERIFICADO. Los adaptadores (./providers.ts) solo hablan con su proveedor.
 * Estados, transiciones y flujos: docs/PAGOS.md.
 */
import { and, asc, desc, eq, gt, ilike, inArray, isNull, lt, or, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction, type Tx } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { field, UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { formatCLP } from "@/modules/chile";
import { consumeOrderReservations, InsufficientStockError, releaseOrderReservations, reservationState, reserveStock } from "@/modules/inventory";
import {
  cancelExpiredWithPayment,
  createOrderFromCart,
  expireOrders,
  lockOrder,
  markOrderPaid,
  type OrderInput,
  type PaymentStatus,
  recoverable,
  setOrderPaymentStatus,
} from "@/modules/orders";
import {
  type AttemptInfo,
  getProvider,
  type PaymentProvider,
  type ProviderId,
  PROVIDERS,
  type ProviderResult,
  ProviderTimeoutError,
  type TransferSettings,
} from "./providers";

export { ACCOUNT_TYPES, getProvider, PROVIDERS, type ProviderId, simulator, transferSettingsSchema } from "./providers";

type Payment = typeof s.payments.$inferSelect;

// ───────────── Estados ─────────────

/**
 * Transiciones del INTENTO. El dinero verificado (PAID, REVIEW) nunca retrocede a rechazado por un evento viejo,
 * y un intento cerrado localmente (FAILED, CANCELLED, EXPIRED) puede registrar dinero que llegó igual: cerrar el
 * checkout no prueba que el proveedor no haya cobrado.
 */
export const ATTEMPT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ["AUTHORIZED", "PAID", "FAILED", "CANCELLED", "EXPIRED", "UNCERTAIN", "REVIEW"],
  AUTHORIZED: ["PAID", "FAILED", "CANCELLED", "EXPIRED", "UNCERTAIN", "REVIEW"],
  UNCERTAIN: ["AUTHORIZED", "PAID", "FAILED", "CANCELLED", "EXPIRED", "REVIEW"],
  FAILED: ["PAID", "REVIEW"],
  CANCELLED: ["PAID", "REVIEW"],
  EXPIRED: ["PAID", "REVIEW"],
  PAID: ["REFUNDED", "PARTIALLY_REFUNDED"],
  REVIEW: ["REFUNDED"],
  PARTIALLY_REFUNDED: ["REFUNDED"],
  REFUNDED: [],
};

/** Intentos que todavía pueden terminar en un cobro. */
const OPEN: PaymentStatus[] = ["PENDING", "AUTHORIZED", "UNCERTAIN"];
/** Hay dinero verificado como recibido (confirme o no el pedido). */
const MONEY: PaymentStatus[] = ["PAID", "REVIEW", "PARTIALLY_REFUNDED", "REFUNDED"];
const PAID_ORDER = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export const SOURCE_LABELS: Record<string, string> = { webhook: "Notificación del proveedor", return: "Retorno del cliente", admin: "Panel", reconcile: "Consulta automática" };

/** "30 minutos", "24 horas", "1 h 30 min". */
export function formatMinutes(n: number) {
  if (n < 60) return `${n} minutos`;
  const h = Math.floor(n / 60);
  if (n % 60) return `${h} h ${n % 60} min`;
  return h === 1 ? "1 hora" : `${h} horas`;
}

// ───────────── Seguridad de lo que se guarda ─────────────

const SECRET_KEY = /token|secret|password|clave|api.?key|authorization|signature|firma|card|tarjeta|cvv|^pan$/i;

/** Copia sin secretos ni datos de tarjeta (y acotada) de lo que trae o responde un proveedor. */
export function redact(v: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redact(x, depth + 1));
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .slice(0, 100)
        .map(([k, x]) => [k, SECRET_KEY.test(k) ? "[redactado]" : redact(x, depth + 1)]),
    );
  if (typeof v === "string" && v.length > 500) return `${v.slice(0, 500)}…`;
  return v;
}

/** Mensaje que se puede mostrar o guardar: el detalle técnico va solo al registro del servidor. */
function safeMessage(e: unknown) {
  if (e instanceof UserError) return e.message;
  console.error("Pagos:", e instanceof Error ? e.message : e);
  return "Error interno al procesar el pago (detalle en el registro del servidor).";
}

// ───────────── Métodos: implementado / configurado / habilitado ─────────────

type MethodRow = typeof s.paymentMethods.$inferSelect;

function setupOf(provider: PaymentProvider, row: MethodRow | undefined) {
  const conf = provider.configure(row?.settings ?? {}, env.APP_ENV);
  // El interruptor del panel solo apaga: un método pendiente o sin configuración no se vuelve operativo por él.
  const enabled = provider.implemented && (provider.testOnly || (row?.enabled ?? true));
  const reason = !provider.implemented ? "Integración pendiente." : !conf.ok ? conf.reason : !enabled ? "Deshabilitado en el panel." : null;
  return { provider, row, ctx: conf.ok ? conf.ctx : null, enabled, reason };
}

async function providerSetup(tx: Tx, id: string) {
  const provider = getProvider(id);
  if (!provider) return null;
  const [row] = await tx.select().from(s.paymentMethods).where(eq(s.paymentMethods.provider, provider.id));
  return setupOf(provider, row);
}

export async function methodStates(tx: Tx = db) {
  const rows = new Map((await tx.select().from(s.paymentMethods)).map((r) => [r.provider, r]));
  return Object.values(PROVIDERS).map((p) => {
    const x = setupOf(p, rows.get(p.id));
    return {
      id: p.id,
      label: p.label,
      description: p.description,
      implemented: p.implemented,
      testOnly: !!p.testOnly,
      capabilities: p.capabilities,
      configured: !!x.ctx,
      enabled: x.enabled,
      available: x.reason === null,
      reason: x.reason,
      example: !!x.ctx?.example,
      reservationMinutes: p.reservationMinutes(),
      settings: x.row?.settings ?? null,
    };
  });
}
export type MethodState = Awaited<ReturnType<typeof methodStates>>[number];

/** Lo que se ofrece al cliente: solo métodos implementados, configurados y habilitados. */
export const checkoutMethods = async () => (await methodStates()).filter((m) => m.available);

/**
 * Proveedor para entradas externas (retorno, webhook) y su contexto. Exige implementado y configurado; si el panel
 * lo deshabilitó, deja de ofrecerse para pagos nuevos pero los intentos en curso se siguen verificando.
 */
export async function inboundProvider(id: string) {
  const x = await providerSetup(db, id);
  return x?.provider.implemented && x.ctx ? { provider: x.provider, ctx: x.ctx } : null;
}

async function usable(tx: Tx, id: string) {
  const x = await providerSetup(tx, id);
  if (!x?.ctx || x.reason) throw new UserError("Ese medio de pago no está disponible.");
  return { provider: x.provider, ctx: x.ctx };
}

// ───────────── Intentos ─────────────

const orderNumberOf = (p: Payment) => p.reference.slice(0, p.reference.lastIndexOf("-"));
const info = (p: Payment): AttemptInfo => ({
  reference: p.reference,
  orderNumber: orderNumberOf(p),
  amount: p.amount,
  currency: p.currency,
  externalId: p.providerReference,
  expiresAt: p.expiresAt,
});

/** Intento PENDING con el total congelado del pedido. Corre en la transacción del llamador, con el pedido bloqueado. */
async function openAttempt(tx: Transaction, order: typeof s.orders.$inferSelect, providerId: string, expiresAt: Date | null) {
  const { provider, ctx } = await usable(tx, providerId);
  const [next] = await tx
    .select({ n: sql<number>`coalesce(max(${s.payments.attempt}), 0)::int + 1` })
    .from(s.payments)
    .where(eq(s.payments.orderId, order.id));
  const [p] = await tx
    .insert(s.payments)
    .values({
      orderId: order.id,
      attempt: next!.n,
      reference: `${order.orderNumber}-${next!.n}`,
      provider: provider.id,
      environment: ctx.environment,
      account: ctx.account,
      amount: order.total,
      currency: order.currency,
      expiresAt,
    })
    .returning();
  return p!;
}

/**
 * Checkout: pedido + reserva + intento en UNA transacción (un doble envío no crea nada más: el carrito queda
 * bloqueado y luego borrado). Recién después se pide la acción de pago al proveedor, fuera de la transacción.
 */
export async function placeOrder(cartId: string, input: OrderInput, providerId: string, userId: string | null = null) {
  const x = await providerSetup(db, providerId);
  if (!x?.ctx || x.reason) throw new UserError("Elige un medio de pago disponible.");
  let paymentId = "";
  const order = await createOrderFromCart(cartId, input, userId, {
    reservationMinutes: x.provider.reservationMinutes(),
    within: async (tx, o, until) => {
      paymentId = (await openAttempt(tx, o, providerId, until)).id;
    },
  });
  await beginAttempt(paymentId);
  return order;
}

/**
 * Pide al proveedor la acción de pago de un intento YA persistido (puede usar la red: nunca dentro de una
 * transacción ni con stock bloqueado). Idempotente: solo completa un intento PENDING sin acción.
 */
export async function beginAttempt(paymentId: string) {
  const [p] = await db.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!p || p.status !== "PENDING" || p.checkout) return;
  const pending = and(eq(s.payments.id, p.id), eq(s.payments.status, "PENDING"));
  const x = await providerSetup(db, p.provider);
  if (!x?.ctx || x.reason) {
    await db.update(s.payments).set({ status: "FAILED", lastError: "El medio de pago dejó de estar disponible." }).where(pending);
    return;
  }
  try {
    const r = await x.provider.start(info(p), x.ctx);
    await db
      .update(s.payments)
      .set({ checkout: r.action, providerReference: r.externalId ?? p.providerReference, raw: r.raw === undefined ? p.raw : redact(r.raw), lastError: null })
      .where(and(pending, isNull(s.payments.checkout)));
  } catch (e) {
    // Sin respuesta: no se sabe si el proveedor creó la transacción → incierto (se consulta después), nunca se repite a ciegas.
    await db
      .update(s.payments)
      .set(e instanceof ProviderTimeoutError ? { status: "UNCERTAIN", lastError: "El proveedor no respondió al iniciar el pago." } : { status: "FAILED", lastError: safeMessage(e) })
      .where(pending);
  }
}

/**
 * El cliente elige o reintenta cómo pagar un pedido pendiente: mismo pedido, misma reserva y mismo plazo (no se
 * extiende). Un doble clic devuelve el intento abierto en vez de crear otro.
 */
export async function startPayment(orderId: string, providerId: string) {
  const id = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "PENDING_PAYMENT") throw new UserError("Este pedido ya no admite pagos.");
    const res = await reservationState(tx, order.id);
    if (!res.live) throw new UserError("La reserva de tu pedido venció: ya no se puede pagar.");
    const attempts = await tx.select().from(s.payments).where(eq(s.payments.orderId, order.id));
    if (attempts.some((a) => a.status === "REVIEW")) throw new UserError("Tenemos un pago de este pedido en revisión; te contactaremos.");
    const open = attempts.find((a) => a.provider === providerId && OPEN.includes(a.status));
    if (open) return open.id;
    // Cambiar de método anula localmente la solicitud pendiente anterior (si su dinero llegara igual, se registra).
    await tx.update(s.payments).set({ status: "CANCELLED" }).where(and(eq(s.payments.orderId, order.id), eq(s.payments.status, "PENDING")));
    return (await openAttempt(tx, order, providerId, res.expiresAt)).id;
  });
  await beginAttempt(id);
  return id;
}

// ───────────── Flujo central ─────────────

export type Outcome = "confirmed" | "late_confirmed" | "review" | "updated" | "unchanged" | "ignored";
type Actor = { userId: string | null; source: string };
type Verified = ProviderResult | { status: "UNCERTAIN"; raw: unknown };

/**
 * Aplica un resultado VERIFICADO a un intento. Bloquea pedido y luego intento (el mismo orden que el vencimiento:
 * sin deadlocks). Confirma el pedido y registra la venta una sola vez. El dinero que no puede confirmar
 * (monto distinto, pago tardío sin stock, pago duplicado, pedido cancelado) queda en REVIEW: nunca se descarta.
 */
export async function applyResult(tx: Transaction, paymentId: string, r: Verified, actor: Actor): Promise<{ outcome: Outcome; reason?: string; payment: Payment }> {
  const [ref] = await tx.select({ orderId: s.payments.orderId }).from(s.payments).where(eq(s.payments.id, paymentId));
  if (!ref) throw new UserError("El pago no existe.");
  const order = await lockOrder(tx, ref.orderId);
  // NO KEY UPDATE: no choca con el bloqueo compartido que toma un evento al referenciar este pago (evita deadlocks).
  const [p] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId)).for("no key update");
  const keep = (outcome: Outcome, reason?: string) => ({ outcome, reason, payment: p! });

  // La respuesta tiene que ser del contexto del intento: ambiente, cuenta/comercio receptor y moneda.
  if ("environment" in r && r.environment && r.environment !== p!.environment) return keep("ignored", "El resultado es de otro ambiente.");
  if ("account" in r && r.account && r.account !== p!.account) return keep("ignored", "El resultado es de otra cuenta o comercio.");
  if ("currency" in r && r.currency && r.currency !== p!.currency) return keep("ignored", "El resultado es en otra moneda.");

  let to: PaymentStatus = r.status;
  let outcome: Outcome = "updated";
  const patch: Partial<typeof s.payments.$inferInsert> = {};

  if (r.status === "PAID") {
    if (MONEY.includes(p!.status)) return keep("unchanged", "El dinero de este intento ya estaba registrado.");
    if (!ATTEMPT_TRANSITIONS[p!.status].includes("PAID")) return keep("ignored", `Un intento ${p!.status} no puede registrar un pago.`);
    if (!Number.isInteger(r.amount) || r.amount! <= 0) return keep("ignored", "El resultado no informa un monto válido.");
    const amount = r.amount!;
    Object.assign(patch, {
      receivedAmount: amount,
      receivedAt: r.receivedAt ?? new Date(),
      verifiedAt: new Date(),
      verifiedBy: actor.userId,
      providerReference: r.externalId ?? p!.providerReference,
    });
    const live = order.status === "PENDING_PAYMENT" && (await reservationState(tx, order.id)).live;

    if (amount !== p!.amount) {
      // Sin pagos parciales: el total del pedido no se toca para "cuadrar".
      to = "REVIEW";
      patch.incident = `Monto recibido ${formatCLP(amount)} distinto del total ${formatCLP(p!.amount)}: devolver o regularizar con el cliente.`;
    } else if (live) {
      await consumeOrderReservations(tx, order.id, actor.userId);
      await markOrderPaid(tx, order, { method: p!.provider, userId: actor.userId, note: `Pago verificado (${p!.reference}).` });
      outcome = "confirmed";
    } else if (order.status === "PENDING_PAYMENT" || recoverable(order)) {
      // Pago tardío: la reserva venció (aunque el job no haya corrido). Se reserva todo de nuevo, o nada.
      await releaseOrderReservations(tx, order.id);
      const items = await tx
        .select({ variantId: s.orderItems.variantId, quantity: s.orderItems.quantity })
        .from(s.orderItems)
        .where(eq(s.orderItems.orderId, order.id));
      try {
        await tx.transaction((sp) => reserveStock(sp, order.id, items, 1)); // savepoint: si falta stock no aborta lo demás
        await consumeOrderReservations(tx, order.id, actor.userId);
        await markOrderPaid(tx, order, { method: p!.provider, userId: actor.userId, note: `Pago verificado después del vencimiento (${p!.reference}): stock reservado de nuevo.` });
        outcome = "late_confirmed";
      } catch (e) {
        if (!(e instanceof InsufficientStockError)) throw e;
        to = "REVIEW";
        patch.incident = "Pago recibido después del vencimiento y sin stock suficiente: reembolso pendiente.";
        if (order.status === "PENDING_PAYMENT") await cancelExpiredWithPayment(tx, order, "Reserva vencida; el pago llegó tarde y no hay stock suficiente: reembolso pendiente.");
      }
    } else {
      to = "REVIEW";
      patch.incident = PAID_ORDER.includes(order.status)
        ? "Pago duplicado: el pedido ya estaba pagado con otro intento. Reembolso pendiente."
        : "Pago recibido sobre un pedido cancelado o reembolsado: reembolso pendiente.";
    }
    if (to === "REVIEW") {
      outcome = "review";
      if (!PAID_ORDER.includes(order.status)) await setOrderPaymentStatus(tx, order, "REVIEW");
    }
  } else {
    if (p!.status === to) return keep("unchanged");
    if (MONEY.includes(p!.status) || !ATTEMPT_TRANSITIONS[p!.status].includes(to))
      return keep("ignored", `Un intento ${p!.status} no pasa a ${to} (resultado viejo o fuera de orden).`);
  }

  const [row] = await tx
    .update(s.payments)
    .set({ ...patch, status: to, lastError: null, raw: redact({ resultado: r.status, origen: actor.source, proveedor: r.raw }) })
    .where(eq(s.payments.id, p!.id))
    .returning();
  await audit(tx, {
    userId: actor.userId,
    action: "payment.result",
    entityType: "payment",
    entityId: p!.id,
    before: { status: p!.status },
    after: { status: to, origen: actor.source, recibido: patch.receivedAmount ?? null, incidencia: patch.incident ?? null },
  });
  return { outcome, payment: row! };
}

// ───────────── Entradas de proveedores: guardar, verificar, aplicar ─────────────

const MAX_TRIES = 10;

async function markEvent(id: string, status: "PROCESSED" | "FAILED" | "IGNORED", lastError: string | null, paymentId: string | null, tx: Tx = db) {
  const [ev] = await tx
    .update(s.paymentEvents)
    .set({ status, lastError, paymentId, tries: sql`${s.paymentEvents.tries} + 1`, processedAt: status === "FAILED" ? null : new Date() })
    .where(eq(s.paymentEvents.id, id))
    .returning();
  return ev!;
}

/**
 * Consulta al proveedor el estado REAL del intento y lo aplica. La consulta (red) va fuera de la transacción;
 * si falla entre la consulta y la escritura, no se aplicó nada y el evento queda FAILED para reintentar.
 */
async function verifyAndApply(p: Payment, source: string, eventRowId: string | null) {
  const x = await providerSetup(db, p.provider);
  const fail = async (msg: string) => {
    if (eventRowId) await markEvent(eventRowId, "FAILED", msg, p.id);
    return { outcome: "failed" as const, reason: msg };
  };
  if (!x?.provider.verify) {
    if (eventRowId) await markEvent(eventRowId, "IGNORED", "Este proveedor no permite consultar el estado.", p.id);
    return { outcome: "ignored" as const };
  }
  if (!x.ctx) return fail(x.reason ?? "Proveedor sin configuración."); // configuración ausente: no cambia pagos, pedidos ni stock
  let r: ProviderResult;
  try {
    r = await x.provider.verify(info(p), x.ctx);
  } catch (e) {
    if (!(e instanceof ProviderTimeoutError)) return fail(safeMessage(e));
    await db.transaction((tx) => applyResult(tx, p.id, { status: "UNCERTAIN", raw: { motivo: e.message } }, { userId: null, source }));
    return fail("Sin respuesta del proveedor: resultado incierto, se volverá a consultar.");
  }
  try {
    return await db.transaction(async (tx) => {
      if (eventRowId) {
        const [ev] = await tx.select({ status: s.paymentEvents.status }).from(s.paymentEvents).where(eq(s.paymentEvents.id, eventRowId)).for("update");
        if (ev?.status === "PROCESSED") return { outcome: "unchanged" as const };
      }
      const out = await applyResult(tx, p.id, r, { userId: null, source });
      if (eventRowId) await markEvent(eventRowId, out.outcome === "ignored" ? "IGNORED" : "PROCESSED", out.reason ?? null, p.id, tx);
      return { outcome: out.outcome, reason: out.reason };
    });
  } catch (e) {
    return fail(safeMessage(e));
  }
}

/** Procesa un evento guardado: encuentra el intento y CONSULTA al proveedor (nunca confía en el cuerpo recibido). */
export async function processEvent(eventRowId: string) {
  const [ev] = await db.select().from(s.paymentEvents).where(eq(s.paymentEvents.id, eventRowId));
  if (!ev || ev.status === "PROCESSED" || ev.status === "IGNORED") return ev ?? null;
  const [p] = ev.paymentId
    ? await db.select().from(s.payments).where(eq(s.payments.id, ev.paymentId))
    : ev.reference
      ? await db.select().from(s.payments).where(and(eq(s.payments.provider, ev.provider), eq(s.payments.providerReference, ev.reference)))
      : [];
  if (!p) return markEvent(ev.id, "IGNORED", "No corresponde a ningún intento de pago.", null);
  await verifyAndApply(p, ev.source, ev.id);
  const [after] = await db.select().from(s.paymentEvents).where(eq(s.paymentEvents.id, ev.id));
  return after!;
}

/**
 * Retorno del navegador o webhook: se GUARDA primero (durable) y después se verifica y aplica. Un duplicado ya
 * resuelto no hace nada; uno que falló se vuelve a procesar (la deduplicación no bloquea el reintento).
 */
export async function receiveProviderInput(providerId: ProviderId, source: "return" | "webhook", input: { eventId: string | null; externalId: string; payload: unknown }) {
  const [p] = await db
    .select({ id: s.payments.id, orderId: s.payments.orderId })
    .from(s.payments)
    .where(and(eq(s.payments.provider, providerId), eq(s.payments.providerReference, input.externalId)));
  const values = { provider: providerId, source, eventId: input.eventId, paymentId: p?.id ?? null, reference: input.externalId, payload: redact(input.payload) ?? {} };
  let [ev] = await db.insert(s.paymentEvents).values(values).onConflictDoNothing({ target: [s.paymentEvents.provider, s.paymentEvents.eventId] }).returning();
  if (!ev) [ev] = await db.select().from(s.paymentEvents).where(and(eq(s.paymentEvents.provider, providerId), eq(s.paymentEvents.eventId, input.eventId!)));
  const duplicate = ev!.status === "PROCESSED" || ev!.status === "IGNORED";
  return { event: duplicate ? ev! : ((await processEvent(ev!.id)) ?? ev!), orderId: p?.orderId ?? null, duplicate };
}

/**
 * Reconciliación (job): reprocesa eventos guardados sin terminar (reinicio, error técnico) y consulta al proveedor
 * los intentos abiertos o cerrados hace poco (cliente que no volvió). Acotada por corrida y por evento.
 */
export async function reconcilePayments({ olderThanSeconds = 60, limit = 50 } = {}) {
  const cutoff = sql`now() - make_interval(secs => ${olderThanSeconds})`;
  const events = await db
    .select({ id: s.paymentEvents.id })
    .from(s.paymentEvents)
    .where(and(inArray(s.paymentEvents.status, ["RECEIVED", "FAILED"]), lt(s.paymentEvents.tries, MAX_TRIES), lt(s.paymentEvents.updatedAt, cutoff)))
    .orderBy(asc(s.paymentEvents.createdAt))
    .limit(limit);
  for (const e of events) await processEvent(e.id);

  const verifiable = Object.values(PROVIDERS)
    .filter((p) => p.implemented && p.capabilities.verify)
    .map((p) => p.id);
  const attempts = await db
    .select()
    .from(s.payments)
    .where(
      and(
        inArray(s.payments.provider, verifiable),
        lt(s.payments.updatedAt, cutoff),
        or(
          // Abiertos de los últimos 3 días; uno más viejo sin resolver se revisa a mano (filtro "Por verificar" del panel).
          and(inArray(s.payments.status, OPEN), gt(s.payments.createdAt, sql`now() - interval '3 days'`)),
          // Cerrado localmente en las últimas 2 horas: el cliente pudo pagar y no volver (el proveedor es la autoridad).
          and(inArray(s.payments.status, ["EXPIRED", "CANCELLED"]), isNull(s.payments.verifiedAt), gt(s.payments.createdAt, sql`now() - interval '2 hours'`)),
        ),
      ),
    )
    .orderBy(asc(s.payments.updatedAt))
    .limit(limit);
  for (const p of attempts) await verifyAndApply(p, "reconcile", null);
  return { events: events.length, attempts: attempts.length };
}

/** Vencimiento + reconciliación. Lo corre `npm run jobs` (programable con cron) y, en el servidor, cada minuto. */
export async function runPaymentJobs(opts?: { olderThanSeconds?: number }) {
  const expired = await expireOrders();
  return { expired, ...(await reconcilePayments(opts)) };
}

// ───────────── Panel: transferencias e incidencias ─────────────

export const transferConfirmationSchema = z.object({
  amount: field.int(1, 100_000_000),
  receivedOn: z.iso.date("Fecha inválida"),
  bankReference: field.optText(60).transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "") : null)),
  note: field.optText(500),
  /** Id único del formulario: el mismo envío repetido se aplica una sola vez. */
  commandId: z.uuid(),
});
export type TransferConfirmation = z.infer<typeof transferConfirmationSchema>;

/**
 * El admin comprobó la transferencia EN LA CUENTA: registra monto, fecha y n.º de operación y llama al mismo
 * applyResult que una pasarela. Monto distinto → incidencia (el pedido no se confirma). Una operación bancaria no
 * se aplica a dos pagos. Doble clic, dos administradores o un reintento: una sola venta.
 */
export async function confirmTransfer(adminId: string, paymentId: string, input: TransferConfirmation) {
  const receivedAt = new Date(`${input.receivedOn}T12:00:00-04:00`); // mediodía en Chile: la fecha no se corre por zona horaria
  if (receivedAt.getTime() > Date.now() + 86_400_000) throw new UserError("La fecha de recepción no puede ser futura.", "receivedOn");
  return db.transaction(async (tx) => {
    const [found] = await tx.select({ orderId: s.payments.orderId }).from(s.payments).where(eq(s.payments.id, paymentId));
    if (!found) throw new UserError("El pago no existe.");
    // Primero el pedido (como todo flujo de pago): dos confirmaciones simultáneas se ordenan aquí, antes de escribir nada.
    await lockOrder(tx, found.orderId);
    const p = (await tx.select().from(s.payments).where(eq(s.payments.id, paymentId)))[0]!;
    if (!getProvider(p.provider)?.capabilities.manualConfirmation)
      throw new UserError("Este pago no es una transferencia: solo lo confirma la verificación del proveedor.");
    const [ev] = await tx
      .insert(s.paymentEvents)
      .values({
        provider: p.provider,
        source: "admin",
        eventId: input.commandId,
        paymentId: p.id,
        reference: input.bankReference,
        payload: { monto: input.amount, fecha: input.receivedOn, referenciaBancaria: input.bankReference, nota: input.note },
        status: "PROCESSED",
        tries: 1,
        processedAt: new Date(),
      })
      .onConflictDoNothing({ target: [s.paymentEvents.provider, s.paymentEvents.eventId] })
      .returning();
    if (!ev) return { outcome: "unchanged" as Outcome, payment: p, duplicate: true }; // el mismo envío otra vez
    if (MONEY.includes(p.status)) throw new UserError("Este pago ya fue registrado.");
    if (input.bankReference) {
      const [used] = await tx
        .select({ reference: s.payments.reference })
        .from(s.payments)
        .where(and(eq(s.payments.provider, p.provider), eq(s.payments.environment, p.environment), eq(s.payments.account, p.account), eq(s.payments.providerReference, input.bankReference)));
      if (used) throw new UserError(`Esa operación bancaria ya se aplicó al pago ${used.reference}.`, "bankReference");
    }
    const out = await applyResult(
      tx,
      p.id,
      { status: "PAID", amount: input.amount, currency: p.currency, environment: p.environment, account: p.account, externalId: input.bankReference, receivedAt, raw: { comprobadoEnCuenta: true, nota: input.note } },
      { userId: adminId, source: "admin" },
    );
    // Otro administrador lo confirmó mientras tanto: este comando no aplica nada (y su registro se revierte).
    if (out.outcome === "unchanged" || out.outcome === "ignored") throw new UserError(out.reason ?? "Este pago ya fue registrado.");
    await audit(tx, {
      userId: adminId,
      action: "payment.confirm_transfer",
      entityType: "payment",
      entityId: p.id,
      before: { status: p.status },
      after: { status: out.payment.status, monto: input.amount, fecha: input.receivedOn, referenciaBancaria: input.bankReference, nota: input.note },
    });
    return { ...out, duplicate: false };
  });
}

export const incidentSchema = z.object({ note: field.text(500) });

/** Cierra una incidencia: el dinero se devolvió (o regularizó) fuera del sistema. No hay reembolsos automáticos. */
export async function resolveIncident(adminId: string, paymentId: string, note: string) {
  return db.transaction(async (tx) => {
    const [ref] = await tx.select({ orderId: s.payments.orderId }).from(s.payments).where(eq(s.payments.id, paymentId));
    if (!ref) throw new UserError("El pago no existe.");
    const order = await lockOrder(tx, ref.orderId);
    const [p] = await tx.select().from(s.payments).where(eq(s.payments.id, paymentId)).for("no key update");
    if (p!.status !== "REVIEW") throw new UserError("Este pago no tiene una incidencia abierta.");
    const [row] = await tx
      .update(s.payments)
      .set({ status: "REFUNDED", incident: `${p!.incident ?? ""} Resuelto: ${note}`.trim() })
      .where(eq(s.payments.id, p!.id))
      .returning();
    const [left] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.payments).where(and(eq(s.payments.orderId, order.id), eq(s.payments.status, "REVIEW")));
    if (left!.n === 0 && order.paymentStatus === "REVIEW") await setOrderPaymentStatus(tx, order, "REFUNDED");
    await audit(tx, { userId: adminId, action: "payment.resolve", entityType: "payment", entityId: p!.id, before: { status: "REVIEW" }, after: { status: "REFUNDED", nota: note } });
    return row!;
  });
}

// ───────────── Panel: configuración (no secreta) ─────────────

export async function saveTransferSettings(adminId: string, data: TransferSettings) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.paymentMethods).where(eq(s.paymentMethods.provider, "transferencia"));
    await tx
      .insert(s.paymentMethods)
      .values({ provider: "transferencia", settings: data })
      .onConflictDoUpdate({ target: s.paymentMethods.provider, set: { settings: data } });
    await audit(tx, { userId: adminId, action: "payment.settings", entityType: "payment_method", entityId: "transferencia", before: before?.settings ?? null, after: data });
  });
}

/** Encender/apagar un método implementado. Un pendiente o de pruebas no se habilita desde el panel. */
export async function setMethodEnabled(adminId: string, providerId: string, enabled: boolean) {
  const p = getProvider(providerId);
  if (!p?.implemented || p.testOnly) throw new UserError("Este método no se puede habilitar desde el panel: su integración está pendiente o es solo de pruebas.");
  return db.transaction(async (tx) => {
    await tx.insert(s.paymentMethods).values({ provider: p.id, enabled }).onConflictDoUpdate({ target: s.paymentMethods.provider, set: { enabled } });
    await audit(tx, { userId: adminId, action: "payment.method", entityType: "payment_method", entityId: p.id, after: { enabled } });
  });
}

// ───────────── Consultas ─────────────

/** Lo que ve el cliente de sus intentos: sin cuenta interna, referencias externas, respuestas del proveedor ni notas. */
export async function customerPayments(orderId: string) {
  const rows = await db.select().from(s.payments).where(eq(s.payments.orderId, orderId)).orderBy(asc(s.payments.attempt));
  return rows.map((p) => ({
    id: p.id,
    attempt: p.attempt,
    provider: p.provider,
    label: getProvider(p.provider)?.label ?? p.provider,
    status: p.status,
    amount: p.amount,
    action: p.checkout,
    expiresAt: p.expiresAt,
    receivedAt: p.receivedAt,
  }));
}

export async function orderPayments(orderId: string) {
  return db.select().from(s.payments).where(eq(s.payments.orderId, orderId)).orderBy(asc(s.payments.attempt));
}

export const PAYMENTS_PAGE_SIZE = 50;

export async function listPayments(f: { q?: string; provider?: string; status?: PaymentStatus; page?: number }) {
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(or(ilike(s.orders.orderNumber, like), ilike(s.payments.reference, like), ilike(s.payments.providerReference, like), ilike(s.orders.email, like))!);
  }
  if (f.provider) where.push(eq(s.payments.provider, f.provider));
  if (f.status) where.push(eq(s.payments.status, f.status));
  const page = f.page ?? 1;
  const rows = await db
    .select({
      payment: s.payments,
      orderNumber: s.orders.orderNumber,
      customerName: s.orders.customerName,
      orderStatus: s.orders.status,
      total: sql<number>`count(*) OVER ()::int`,
    })
    .from(s.payments)
    .innerJoin(s.orders, eq(s.orders.id, s.payments.orderId))
    .where(and(...where))
    .orderBy(desc(s.payments.createdAt), desc(s.payments.id))
    .limit(PAYMENTS_PAGE_SIZE)
    .offset((page - 1) * PAYMENTS_PAGE_SIZE);
  return { items: rows, total: rows[0]?.total ?? 0 };
}

/** Para el panel: transferencias por comprobar e incidencias abiertas. */
export async function paymentStats() {
  const [r] = await db
    .select({
      toConfirm: sql<number>`count(*) FILTER (WHERE ${s.payments.status} = 'PENDING' AND ${s.payments.provider} = 'transferencia')::int`,
      review: sql<number>`count(*) FILTER (WHERE ${s.payments.status} = 'REVIEW')::int`,
      uncertain: sql<number>`count(*) FILTER (WHERE ${s.payments.status} = 'UNCERTAIN')::int`,
    })
    .from(s.payments);
  return r!;
}

export async function getPayment(id: string) {
  const [row] = await db
    .select({ payment: s.payments, order: s.orders, verifiedBy: s.users.email })
    .from(s.payments)
    .innerJoin(s.orders, eq(s.orders.id, s.payments.orderId))
    .leftJoin(s.users, eq(s.users.id, s.payments.verifiedBy))
    .where(eq(s.payments.id, id));
  if (!row) return null;
  const events = await db.select().from(s.paymentEvents).where(eq(s.paymentEvents.paymentId, id)).orderBy(desc(s.paymentEvents.createdAt));
  return { ...row, events };
}
