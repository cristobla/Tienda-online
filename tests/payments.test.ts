import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as returnRoute } from "@/app/api/payments/[provider]/return/route";
import { POST as webhookRoute } from "@/app/api/payments/[provider]/webhook/route";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { UserError } from "@/lib/form";
import { can } from "@/modules/auth/rbac";
import { addToCart, getCart } from "@/modules/cart";
import { changeOrderStatus, expireOrders } from "@/modules/orders";
import {
  applyResult,
  checkoutMethods,
  confirmTransfer,
  customerPayments,
  methodStates,
  placeOrder,
  reconcilePayments,
  redact,
  resolveIncident,
  runPaymentJobs,
  saveTransferSettings,
  setMethodEnabled,
  simulator,
  startPayment,
  transferConfirmationSchema,
  transferSettingsSchema,
} from "@/modules/payments";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;
let communeId: number;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
  communeId = (await makeCommune("T7", 0)).communeId; // despacho $0: el total es el de los productos
});

// ───────────── Ayudas ─────────────

const contact = () => ({
  email: "cliente@test.cl",
  firstName: "Ana",
  lastName: "Pérez",
  phone: "+56912345678",
  rut: null,
  communeId,
  street: "Av. Siempre Viva",
  number: "742",
  apartment: null,
  notes: null,
});
async function cartWith(lines: [string, number][]) {
  let cart: string | null = null;
  for (const [variantId, quantity] of lines) cart = await addToCart(cart, { variantId, quantity });
  return cart!;
}
/** Checkout real: carrito → placeOrder con el total que el cliente vio. */
async function order(lines: [string, number][], provider = "transferencia") {
  const cart = await cartWith(lines);
  return placeOrder(cart, { ...contact(), expectedTotal: (await getCart(cart)).subtotal }, provider);
}
const attempts = (orderId: string) => db.select().from(s.payments).where(eq(s.payments.orderId, orderId)).orderBy(asc(s.payments.attempt));
const orderRow = async (id: string) => (await db.select().from(s.orders).where(eq(s.orders.id, id)))[0]!;
const variant = async (id: string) => (await db.select().from(s.productVariants).where(eq(s.productVariants.id, id)))[0]!;
const salesOf = (orderId: string) =>
  db
    .select()
    .from(s.inventoryMovements)
    .where(and(eq(s.inventoryMovements.type, "SALE"), eq(s.inventoryMovements.referenceId, orderId)));
const reservationsOf = (orderId: string) => db.select().from(s.stockReservations).where(eq(s.stockReservations.orderId, orderId));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
/** El admin comprobó la transferencia en la cuenta (mismo esquema que el formulario del panel). */
const confirm = (paymentId: string, over: Record<string, string> = {}) =>
  confirmTransfer(
    adminId,
    paymentId,
    transferConfirmationSchema.parse({ amount: "1000", receivedOn: today(), bankReference: "", note: "", commandId: randomUUID(), ...over }),
  );
/** Vence la reserva por reloj (sin correr el job). */
const expireByTime = (orderId: string) =>
  db.update(s.stockReservations).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(s.stockReservations.orderId, orderId));
const routeCtx = (provider: string) => ({ params: Promise.resolve({ provider }) });
const returnTo = (token: string, extra = "") => returnRoute(new Request(`http://localhost/api/payments/simulado/return?token=${token}${extra}`), routeCtx("simulado"));
const webhook = (body: unknown, type = "application/json") =>
  webhookRoute(new Request("http://localhost/api/payments/simulado/webhook", { method: "POST", headers: { "content-type": type }, body: JSON.stringify(body) }), routeCtx("simulado"));
/** Pedido pagado con el simulador: su token es la referencia del proveedor. */
async function simOrder(lines: [string, number][]) {
  const o = await order(lines, "simulado");
  const [p] = await attempts(o.id);
  return { o, p: p!, token: p!.providerReference! };
}
/** En la reconciliación de las pruebas, todo cuenta como "viejo" (sin esperar el minuto de gracia). */
const reconcileNow = () => reconcilePayments({ olderThanSeconds: -60 });
const withAppEnv = async (appEnv: string, fn: () => Promise<void>) => {
  const e = env as { APP_ENV: string };
  const prev = e.APP_ENV;
  e.APP_ENV = appEnv;
  try {
    await fn();
  } finally {
    e.APP_ENV = prev;
  }
};
const REAL_ACCOUNT = transferSettingsSchema.parse({
  bank: "Banco Prueba",
  holder: "Comercial Prueba SpA",
  rut: "76.086.428-5",
  accountType: "Cuenta corriente",
  accountNumber: "12-345-678",
  email: "pagos@test.cl",
});

// ───────────── Métodos y configuración ─────────────

describe("métodos de pago", () => {
  it("se ofrecen solo los implementados, configurados y habilitados; un pendiente no se habilita desde el panel", async () => {
    expect((await checkoutMethods()).map((m) => m.id)).toEqual(["transferencia", "simulado"]);
    const webpay = (await methodStates()).find((m) => m.id === "webpay")!;
    expect(webpay).toMatchObject({ implemented: false, configured: false, available: false });
    await expect(setMethodEnabled(adminId, "webpay", true)).rejects.toBeInstanceOf(UserError);
    await expect(setMethodEnabled(adminId, "simulado", false)).rejects.toBeInstanceOf(UserError);
    expect((await checkoutMethods()).map((m) => m.id)).not.toContain("webpay");

    await setMethodEnabled(adminId, "transferencia", false);
    expect((await checkoutMethods()).map((m) => m.id)).toEqual(["simulado"]);
    const v = await makeVariant(5);
    await expect(order([[v.id, 1]], "transferencia")).rejects.toBeInstanceOf(UserError);
    await expect(order([[v.id, 1]], "webpay")).rejects.toBeInstanceOf(UserError);
    await expect(order([[v.id, 1]], "inventado")).rejects.toBeInstanceOf(UserError);
    expect(await db.$count(s.orders)).toBe(0);
    expect(await db.$count(s.payments)).toBe(0);
    expect((await variant(v.id)).stockReserved).toBe(0);
    expect(await db.$count(s.auditLogs, eq(s.auditLogs.action, "payment.method"))).toBe(1);
  });

  it("en producción: la simulación está bloqueada (servicio y rutas) y la transferencia exige una cuenta real", async () => {
    const v = await makeVariant(5);
    const { token } = await simOrder([[v.id, 1]]); // creado en "test", antes de pasar a producción
    await withAppEnv("production", async () => {
      const states = await methodStates();
      expect(states.find((m) => m.id === "simulado")).toMatchObject({ available: false });
      expect(states.find((m) => m.id === "transferencia")).toMatchObject({ available: false, configured: false });
      expect(await checkoutMethods()).toEqual([]);
      await expect(order([[v.id, 1]], "simulado")).rejects.toBeInstanceOf(UserError);
      await expect(order([[v.id, 1]], "transferencia")).rejects.toBeInstanceOf(UserError);
      expect((await returnTo(token)).status).toBe(404);
      expect((await webhook({ id: "ev-prod", token })).status).toBe(404);
      await saveTransferSettings(adminId, REAL_ACCOUNT);
      expect((await methodStates()).find((m) => m.id === "transferencia")).toMatchObject({ available: true, example: false });
    });
    expect(await db.$count(s.orders)).toBe(1); // solo el creado antes; los rechazos no dejaron nada
  });

  it("la transferencia congela en el intento la cuenta que se le mostró al cliente", async () => {
    const v = await makeVariant(10);
    const first = await order([[v.id, 1]]);
    const [a1] = await attempts(first.id);
    expect(a1!.checkout).toMatchObject({ kind: "instructions", example: true }); // datos de ejemplo rotulados (ambiente test)
    expect(JSON.stringify(a1!.checkout)).toContain(first.orderNumber);
    expect(JSON.stringify(a1!.checkout)).toContain("$1.000");

    await saveTransferSettings(adminId, REAL_ACCOUNT);
    const second = await order([[v.id, 1]]);
    const [a2] = await attempts(second.id);
    expect(JSON.stringify(a2!.checkout)).toContain("Banco Prueba");
    expect((await attempts(first.id))[0]!.checkout).toEqual(a1!.checkout); // el pedido anterior conserva lo que recibió
    expect(a2!.account).toBe("12345678");
  });
});

// ───────────── Checkout ─────────────

describe("checkout con pago", () => {
  it("pedido, reserva e intento nacen juntos; el intento cobra el total congelado del pedido", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(10);
    const o = await order([
      [a.id, 2],
      [b.id, 1],
    ]);
    const [p] = await attempts(o.id);
    const [r] = await reservationsOf(o.id);
    expect(p).toMatchObject({ attempt: 1, reference: `${o.orderNumber}-1`, provider: "transferencia", status: "PENDING", amount: o.total, currency: "CLP" });
    expect(p!.expiresAt!.getTime()).toBe(r!.expiresAt.getTime()); // el plazo del pago es el de la reserva
    expect((await variant(a.id)).stockReserved).toBe(2);
    expect(await salesOf(o.id)).toEqual([]); // reservar no es vender
  });

  it("un total manipulado no crea pedido, reserva ni intento", async () => {
    const v = await makeVariant(10);
    const cart = await cartWith([[v.id, 1]]);
    await expect(placeOrder(cart, { ...contact(), expectedTotal: 1 }, "transferencia")).rejects.toBeInstanceOf(UserError);
    expect(await db.$count(s.orders)).toBe(0);
    expect(await db.$count(s.payments)).toBe(0);
    expect((await getCart(cart)).lines).toHaveLength(1); // el carrito sigue intacto
  });

  it("doble envío del checkout: un pedido, una reserva y un intento", async () => {
    const v = await makeVariant(10);
    const cart = await cartWith([[v.id, 3]]);
    const input = { ...contact(), expectedTotal: (await getCart(cart)).subtotal };
    const r = await Promise.allSettled([placeOrder(cart, input, "transferencia"), placeOrder(cart, input, "transferencia")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.$count(s.orders)).toBe(1);
    expect(await db.$count(s.payments)).toBe(1);
    expect((await variant(v.id)).stockReserved).toBe(3);
  });

  it("reintento: el mismo intento si sigue abierto; tras un rechazo, otro intento sin reservar de nuevo ni extender el plazo", async () => {
    const v = await makeVariant(10);
    const { o, p, token } = await simOrder([[v.id, 2]]);
    expect(await startPayment(o.id, "simulado")).toBe(p.id); // doble clic / recarga
    expect(simulator.decide(token, "FAILED")).toBe(true);
    await returnTo(token);
    expect((await attempts(o.id))[0]!.status).toBe("FAILED");
    expect((await reservationsOf(o.id))[0]!.status).toBe("ACTIVE"); // un rechazo no libera la reserva

    const id2 = await startPayment(o.id, "simulado");
    const [, p2] = await attempts(o.id);
    expect(p2).toMatchObject({ id: id2, attempt: 2, status: "PENDING", amount: o.total });
    expect(p2!.expiresAt!.getTime()).toBe(p.expiresAt!.getTime());
    expect(await reservationsOf(o.id)).toHaveLength(1);
    expect((await variant(v.id)).stockReserved).toBe(2);
  });

  it("el cliente solo ve datos seguros de sus intentos; un pedido inexistente no admite pagos", async () => {
    const v = await makeVariant(5);
    const { o } = await simOrder([[v.id, 1]]);
    const [view] = await customerPayments(o.id);
    expect(Object.keys(view!).sort()).toEqual(["action", "amount", "attempt", "expiresAt", "id", "label", "provider", "receivedAt", "status"]);
    await expect(startPayment(randomUUID(), "transferencia")).rejects.toBeInstanceOf(UserError);
  });
});

// ───────────── Transferencia en el panel ─────────────

describe("transferencia: confirmación administrativa", () => {
  it("con el monto exacto: pedido pagado, reserva convertida en venta una vez y auditoría", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(4);
    const o = await order([
      [a.id, 2],
      [b.id, 1],
    ]);
    const [p] = await attempts(o.id);
    const r = await confirm(p!.id, { amount: String(o.total), bankReference: "op 991", note: "Banco Estado" });
    expect(r.outcome).toBe("confirmed");
    expect(await orderRow(o.id)).toMatchObject({ status: "PAID", paymentStatus: "PAID", paymentMethod: "transferencia" });
    expect((await attempts(o.id))[0]).toMatchObject({ status: "PAID", receivedAmount: o.total, verifiedBy: adminId, providerReference: "OP991" });
    expect(await variant(a.id)).toMatchObject({ stockOnHand: 8, stockReserved: 0 });
    expect(await variant(b.id)).toMatchObject({ stockOnHand: 3, stockReserved: 0 });
    expect(await salesOf(o.id)).toHaveLength(2);
    expect((await reservationsOf(o.id)).map((x) => x.status)).toEqual(["CONSUMED", "CONSUMED"]);
    const actions = (await db.select({ a: s.auditLogs.action }).from(s.auditLogs)).map((x) => x.a);
    expect(actions).toEqual(expect.arrayContaining(["payment.result", "payment.confirm_transfer"]));
  });

  it("un monto distinto queda como incidencia: no confirma el pedido ni cambia su total; resolverla no inventa un pago", async () => {
    const v = await makeVariant(5);
    const o = await order([[v.id, 2]]);
    const [p] = await attempts(o.id);
    expect((await confirm(p!.id, { amount: "1999" })).outcome).toBe("review");
    expect((await attempts(o.id))[0]).toMatchObject({ status: "REVIEW", receivedAmount: 1999 });
    expect((await attempts(o.id))[0]!.incident).toMatch(/distinto/);
    expect(await orderRow(o.id)).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "REVIEW", total: 2000 });
    expect(await salesOf(o.id)).toEqual([]);
    await expect(startPayment(o.id, "transferencia")).rejects.toBeInstanceOf(UserError); // no se invita a pagar de nuevo

    await resolveIncident(adminId, p!.id, "Devuelto por transferencia el mismo día.");
    expect((await attempts(o.id))[0]!.status).toBe("REFUNDED");
    expect((await orderRow(o.id)).paymentStatus).toBe("REFUNDED");
    await expireByTime(o.id);
    await expireOrders();
    expect(await orderRow(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" }); // vencer no borra el resumen
  });

  it("la misma operación bancaria no se aplica a dos pedidos", async () => {
    const v = await makeVariant(10);
    const o1 = await order([[v.id, 1]]);
    const o2 = await order([[v.id, 1]]);
    await confirm((await attempts(o1.id))[0]!.id, { bankReference: "OP-123" });
    const e = await confirm((await attempts(o2.id))[0]!.id, { bankReference: " op-123 " }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(UserError);
    expect((e as UserError).field).toBe("bankReference");
    expect((await orderRow(o2.id)).status).toBe("PENDING_PAYMENT");
    expect(await salesOf(o2.id)).toEqual([]);
  });

  it("doble clic del mismo formulario y dos administradores a la vez: una sola venta", async () => {
    const v = await makeVariant(10);
    const o = await order([[v.id, 3]]);
    const [p] = await attempts(o.id);
    const commandId = randomUUID();
    const input = transferConfirmationSchema.parse({ amount: "3000", receivedOn: today(), bankReference: "", note: "", commandId });
    expect((await confirmTransfer(adminId, p!.id, input)).duplicate).toBe(false);
    expect((await confirmTransfer(adminId, p!.id, input)).duplicate).toBe(true);

    const o2 = await order([[v.id, 2]]);
    const [p2] = await attempts(o2.id);
    const r = await Promise.allSettled([confirm(p2!.id, { amount: "2000" }), confirm(p2!.id, { amount: "2000" })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(UserError);
    expect(await salesOf(o.id)).toHaveLength(1);
    expect(await salesOf(o2.id)).toHaveLength(1);
    expect(await variant(v.id)).toMatchObject({ stockOnHand: 5, stockReserved: 0 });
  });

  it("solo con el permiso específico, y solo para transferencias (no se confirma a mano un pago de pasarela)", async () => {
    expect(can("ADMIN", "payments:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "payments:manage")).toBe(true);
    expect(can("SALES", "payments:manage")).toBe(false);
    expect(can("WAREHOUSE", "payments:manage")).toBe(false);
    const v = await makeVariant(5);
    const { o, p } = await simOrder([[v.id, 1]]);
    await expect(confirm(p.id)).rejects.toThrow(/no es una transferencia/);
    expect((await orderRow(o.id)).status).toBe("PENDING_PAYMENT");
  });

  it("cancelar el pedido anula su solicitud sin declarar dinero devuelto; si el dinero llega igual, queda en revisión", async () => {
    const v = await makeVariant(5);
    const o = await order([[v.id, 1]]);
    await changeOrderStatus(adminId, o.id, { to: "CANCELLED", note: "El cliente desistió" });
    const [p] = await attempts(o.id);
    expect(p).toMatchObject({ status: "CANCELLED", receivedAmount: null });
    expect((await orderRow(o.id)).paymentStatus).toBe("CANCELLED");

    expect((await confirm(p!.id)).outcome).toBe("review");
    expect((await attempts(o.id))[0]!.incident).toMatch(/cancelado/);
    expect(await orderRow(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REVIEW" }); // no se reabre
    expect(await salesOf(o.id)).toEqual([]);
  });

  it("rollback técnico: si falla confirmar el pedido no queda pago, evento, venta ni auditoría", async () => {
    const v = await makeVariant(5);
    const o = await order([[v.id, 1]]);
    const [p] = await attempts(o.id);
    await db.execute(sql`CREATE FUNCTION falla_pago() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falla simulada'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER falla_pago BEFORE UPDATE ON orders FOR EACH ROW WHEN (NEW.status = 'PAID') EXECUTE FUNCTION falla_pago()`);
    try {
      await expect(confirm(p!.id)).rejects.toThrow();
    } finally {
      await db.execute(sql`DROP TRIGGER falla_pago ON orders; DROP FUNCTION falla_pago()`);
    }
    expect((await attempts(o.id))[0]).toMatchObject({ status: "PENDING", receivedAmount: null });
    expect(await db.$count(s.paymentEvents)).toBe(0);
    expect(await salesOf(o.id)).toEqual([]);
    expect(await variant(v.id)).toMatchObject({ stockOnHand: 5, stockReserved: 1 });
    expect(await db.$count(s.auditLogs, sql`${s.auditLogs.action} LIKE 'payment.%'`)).toBe(0);
  });
});

// ───────────── Vencimiento y pagos tardíos ─────────────

describe("vencimiento y pagos tardíos", () => {
  it("si la reserva venció aunque el job no corrió, la confirmación no la usa: reserva de nuevo y vende una vez", async () => {
    const v = await makeVariant(5);
    const o = await order([[v.id, 2]]);
    await expireByTime(o.id);
    expect((await confirm((await attempts(o.id))[0]!.id, { amount: "2000" })).outcome).toBe("late_confirmed");
    expect((await orderRow(o.id)).status).toBe("PAID");
    expect((await reservationsOf(o.id)).map((r) => r.status).sort()).toEqual(["CONSUMED", "RELEASED"]);
    expect(await salesOf(o.id)).toHaveLength(1);
    expect(await variant(v.id)).toMatchObject({ stockOnHand: 3, stockReserved: 0 });
    const notes = await db.select({ note: s.orderStatusHistory.note }).from(s.orderStatusHistory).where(eq(s.orderStatusHistory.orderId, o.id));
    expect(notes.some((n) => /después del vencimiento/.test(n.note ?? ""))).toBe(true);
  });

  it("pago tardío sobre un pedido vencido por el job: con stock se recupera; sin stock queda en revisión, sin sobreventa", async () => {
    const v = await makeVariant(5);
    const o1 = await order([[v.id, 2]]);
    await expireByTime(o1.id);
    expect(await expireOrders()).toBe(1);
    expect(await orderRow(o1.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "EXPIRED" });
    expect((await attempts(o1.id))[0]!.status).toBe("EXPIRED"); // el job cierra el intento pendiente
    expect((await confirm((await attempts(o1.id))[0]!.id, { amount: "2000" })).outcome).toBe("late_confirmed");
    expect(await orderRow(o1.id)).toMatchObject({ status: "PAID", paymentStatus: "PAID", cancelledAt: null });

    const last = await makeVariant(1);
    const o2 = await order([[last.id, 1]]);
    await expireByTime(o2.id);
    await expireOrders();
    const other = await order([[last.id, 1]]); // otro cliente se llevó la última unidad
    const r = await confirm((await attempts(o2.id))[0]!.id);
    expect(r.outcome).toBe("review");
    expect((await attempts(o2.id))[0]).toMatchObject({ status: "REVIEW", receivedAmount: 1000 }); // el dinero queda registrado
    expect(await orderRow(o2.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REVIEW" });
    expect(await salesOf(o2.id)).toEqual([]);
    expect(await variant(last.id)).toMatchObject({ stockOnHand: 1, stockReserved: 1 });
    expect((await reservationsOf(other.id))[0]!.status).toBe("ACTIVE");
  });

  it("confirmación y vencimiento simultáneos nunca consumen y liberan la misma reserva", async () => {
    const v = await makeVariant(10);
    const o = await order([[v.id, 4]]);
    const [p] = await attempts(o.id);
    await expireByTime(o.id);
    await Promise.allSettled([expireOrders(), confirm(p!.id, { amount: "4000" })]);
    expect((await orderRow(o.id)).status).toBe("PAID");
    expect(await salesOf(o.id)).toHaveLength(1);
    expect(await variant(v.id)).toMatchObject({ stockOnHand: 6, stockReserved: 0 });
    expect((await reservationsOf(o.id)).filter((r) => r.status === "ACTIVE")).toEqual([]);
  });

  it("el fallo de un intento no libera la reserva que usa otro intento vigente", async () => {
    const v = await makeVariant(5);
    const { o, token } = await simOrder([[v.id, 1]]);
    simulator.decide(token, "FAILED");
    await returnTo(token);
    await startPayment(o.id, "transferencia");
    const [p1, p2] = await attempts(o.id);
    expect([p1!.status, p2!.status]).toEqual(["FAILED", "PENDING"]);
    expect((await reservationsOf(o.id))[0]!.status).toBe("ACTIVE");
    expect((await confirm(p2!.id)).outcome).toBe("confirmed");
    expect((await orderRow(o.id)).status).toBe("PAID");
  });
});

// ───────────── Pasarela simulada: retorno, webhook, eventos ─────────────

describe("pasarela simulada (contrato de retorno, webhook y reconciliación)", () => {
  it("el retorno solo aprueba con la consulta al proveedor: un 'approved' en la URL o un token falso no aprueban", async () => {
    const v = await makeVariant(5);
    const { o, token } = await simOrder([[v.id, 1]]);
    const forged = await returnTo(token, "&status=approved&TBK_TOKEN=x");
    expect(forged.status).toBe(303);
    expect(forged.headers.get("location")).toBe(new URL(`/pedido/${o.id}`, env.APP_URL).toString());
    expect((await orderRow(o.id)).status).toBe("PENDING_PAYMENT");

    const unknown = await returnTo(`sim_${"0".repeat(32)}`);
    expect(unknown.headers.get("location")).toBe(new URL("/", env.APP_URL).toString()); // no revela pedidos
    expect((await returnTo("../../admin")).status).toBe(400);
    expect((await db.select().from(s.paymentEvents).where(eq(s.paymentEvents.reference, `sim_${"0".repeat(32)}`)))[0]!.status).toBe("IGNORED");

    simulator.decide(token, "PAID");
    await returnTo(token);
    expect(await orderRow(o.id)).toMatchObject({ status: "PAID", paymentMethod: "simulado" });
  });

  it("webhook duplicado o fuera de orden: un solo efecto, y un pago verificado no retrocede", async () => {
    const v = await makeVariant(5);
    const { o, p, token } = await simOrder([[v.id, 2]]);
    simulator.decide(token, "PAID");
    expect((await webhook({ id: "ev-1", token })).status).toBe(200);
    expect((await webhook({ id: "ev-1", token })).status).toBe(200);
    expect(await db.$count(s.paymentEvents, eq(s.paymentEvents.eventId, "ev-1"))).toBe(1);
    expect((await orderRow(o.id)).status).toBe("PAID");
    expect(await salesOf(o.id)).toHaveLength(1);

    const stale = await db.transaction((tx) => applyResult(tx, p.id, { status: "FAILED", raw: {} }, { userId: null, source: "webhook" }));
    expect(stale.outcome).toBe("ignored");
    expect((await attempts(o.id))[0]!.status).toBe("PAID");
    expect((await webhook({ id: "ev-2", token }, "text/plain")).status).toBe(415);
    expect((await webhook({ id: "ev-3", token: "otro" })).status).toBe(400);
  });

  it("timeout del proveedor: resultado incierto (no rechazo, sin cobrar de nuevo) y la reconciliación lo resuelve una vez", async () => {
    const v = await makeVariant(5);
    const { o, p, token } = await simOrder([[v.id, 1]]);
    simulator.decide(token, "PAID");
    simulator.timeouts(token, 1);
    await returnTo(token);
    expect((await attempts(o.id))[0]!.status).toBe("UNCERTAIN");
    expect((await db.select().from(s.paymentEvents))[0]).toMatchObject({ status: "FAILED", tries: 1 });
    expect(await startPayment(o.id, "simulado")).toBe(p.id); // con un resultado incierto no se abre otro cobro

    await reconcileNow();
    expect((await orderRow(o.id)).status).toBe("PAID");
    expect((await db.select().from(s.paymentEvents))[0]).toMatchObject({ status: "PROCESSED", tries: 2 });
    await reconcileNow();
    expect(await salesOf(o.id)).toHaveLength(1);
  });

  it("falla entre la verificación y la escritura local: el evento queda recuperable y luego se aplica una vez", async () => {
    const v = await makeVariant(5);
    const { o, token } = await simOrder([[v.id, 1]]);
    simulator.decide(token, "PAID");
    await db.execute(sql`CREATE FUNCTION falla_pago() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'falla simulada'; END $$ LANGUAGE plpgsql`);
    await db.execute(sql`CREATE TRIGGER falla_pago BEFORE UPDATE ON payments FOR EACH ROW WHEN (NEW.status = 'PAID') EXECUTE FUNCTION falla_pago()`);
    try {
      expect((await webhook({ id: "ev-x", token })).status).toBe(500); // el proveedor reenviará
    } finally {
      await db.execute(sql`DROP TRIGGER falla_pago ON payments; DROP FUNCTION falla_pago()`);
    }
    expect((await db.select().from(s.paymentEvents))[0]).toMatchObject({ status: "FAILED", processedAt: null });
    expect((await orderRow(o.id)).status).toBe("PENDING_PAYMENT");
    expect(await salesOf(o.id)).toEqual([]);

    expect((await webhook({ id: "ev-x", token })).status).toBe(200); // el reenvío no queda bloqueado por la deduplicación
    expect((await orderRow(o.id)).status).toBe("PAID");
    await reconcileNow();
    expect(await salesOf(o.id)).toHaveLength(1);
  });

  it("reinicio antes de procesar: un evento solo recibido se procesa en el job", async () => {
    const v = await makeVariant(5);
    const { o, p, token } = await simOrder([[v.id, 1]]);
    simulator.decide(token, "PAID");
    await db.insert(s.paymentEvents).values({ provider: "simulado", source: "webhook", eventId: "ev-r", paymentId: p.id, reference: token, payload: {} });
    const r = await runPaymentJobs({ olderThanSeconds: -60 });
    expect(r.events).toBe(1);
    expect((await db.select().from(s.paymentEvents))[0]!.status).toBe("PROCESSED");
    expect((await orderRow(o.id)).status).toBe("PAID");
  });

  it("dos intentos aprobados: ambos trazables, un solo pedido pagado y una sola venta", async () => {
    const v = await makeVariant(5);
    const { o, token } = await simOrder([[v.id, 1]]);
    await startPayment(o.id, "transferencia"); // cambia de método: el intento simulado queda anulado localmente
    simulator.decide(token, "PAID"); // …pero el cliente igual pagó en la pasarela
    await returnTo(token);
    const [p1, p2] = await attempts(o.id);
    expect(p1).toMatchObject({ status: "PAID", receivedAmount: 1000 });
    expect((await orderRow(o.id)).status).toBe("PAID");

    expect((await confirm(p2!.id)).outcome).toBe("review");
    expect((await attempts(o.id))[1]).toMatchObject({ status: "REVIEW", receivedAmount: 1000 });
    expect((await attempts(o.id))[1]!.incident).toMatch(/duplicado/);
    expect(await orderRow(o.id)).toMatchObject({ status: "PAID", paymentStatus: "PAID" });
    expect(await salesOf(o.id)).toHaveLength(1);
  });

  it("secretos y datos de tarjeta no se guardan ni se muestran", async () => {
    expect(redact({ token: "abc", nested: { api_key: "k", card_number: "4111", cvv: "1", ok: 1 }, list: [{ secret: "s" }] })).toEqual({
      token: "[redactado]",
      nested: { api_key: "[redactado]", card_number: "[redactado]", cvv: "[redactado]", ok: 1 },
      list: [{ secret: "[redactado]" }],
    });
    const v = await makeVariant(5);
    const { token } = await simOrder([[v.id, 1]]);
    await webhook({ id: "ev-s", token });
    const [ev] = await db.select().from(s.paymentEvents);
    expect(ev!.payload).toEqual({ id: "ev-s", token: "[redactado]" });
  });
});
