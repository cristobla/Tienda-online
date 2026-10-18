import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { POST as webhookRoute } from "@/app/api/payments/[provider]/webhook/route";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { can } from "@/modules/auth/rbac";
import { addToCart, getCart } from "@/modules/cart";
import { changeOrderStatus } from "@/modules/orders";
import {
  confirmTransfer,
  placeOrder,
  receiveProviderInput,
  reconcilePayments,
  refundOrder,
  refundPayment,
  resolveIncident,
  simulator,
  transferConfirmationSchema,
} from "@/modules/payments";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;
let communeId: number;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
  communeId = (await makeCommune("R7", 0)).communeId;
});

const contact = () => ({ email: "cliente@test.cl", firstName: "Ana", lastName: "Pérez", phone: "+56912345678", rut: null, communeId, street: "Calle", number: "1", apartment: null, notes: null });
async function order(lines: [string, number][], provider: string) {
  let cart: string | null = null;
  for (const [variantId, quantity] of lines) cart = await addToCart(cart, { variantId, quantity });
  return placeOrder(cart!, { ...contact(), expectedTotal: (await getCart(cart!)).subtotal }, provider);
}
const attempts = (orderId: string) => db.select().from(s.payments).where(eq(s.payments.orderId, orderId)).orderBy(asc(s.payments.attempt));
const orderRow = async (id: string) => (await db.select().from(s.orders).where(eq(s.orders.id, id)))[0]!;
const stock = async (id: string) => (await db.select().from(s.productVariants).where(eq(s.productVariants.id, id)))[0]!;
const reversals = (orderId: string) =>
  db
    .select()
    .from(s.inventoryMovements)
    .where(and(eq(s.inventoryMovements.referenceId, orderId), inArray(s.inventoryMovements.type, ["SALE_CANCELLED", "RETURN"])));
const adminEvents = (paymentId: string) =>
  db
    .select()
    .from(s.paymentEvents)
    .where(and(eq(s.paymentEvents.paymentId, paymentId), eq(s.paymentEvents.source, "admin")));

/** Pedido pagado con el simulador (la "pasarela" que reembolsa por API en las pruebas). */
async function paidSim(lines: [string, number][]) {
  const o = await order(lines, "simulado");
  const [p] = await attempts(o.id);
  simulator.decide(p!.providerReference!, "PAID");
  await receiveProviderInput("simulado", "return", { eventId: null, externalId: p!.providerReference!, payload: {} });
  expect((await orderRow(o.id)).status).toBe("PAID");
  return { o, p: p!, token: p!.providerReference! };
}
const note = { note: "El cliente se arrepintió", restock: false };

describe("refundOrder: anular un pedido pagado y devolver el dinero", () => {
  it("antes del despacho: stock de vuelta (SALE_CANCELLED), reembolso por el proveedor, todo registrado", async () => {
    const v = await makeVariant(5);
    const { o, p, token } = await paidSim([[v.id, 2]]);
    expect((await stock(v.id)).stockOnHand).toBe(3);

    const r = await refundOrder(adminId, o.id, note);
    expect(r).toMatchObject({ order: { status: "CANCELLED" }, restocked: true, refunds: [{ reference: p.reference, result: "REFUNDED" }] });
    expect((await stock(v.id)).stockOnHand).toBe(5);
    expect(await reversals(o.id)).toMatchObject([{ type: "SALE_CANCELLED", quantity: 2, reason: note.note }]);
    expect(await orderRow(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
    expect((await attempts(o.id))[0]).toMatchObject({ status: "REFUNDED", incident: expect.stringContaining("Reembolsado por") });
    expect(simulator.get(token)).toMatchObject({ status: "REFUNDED", refunds: [`refund-${p.reference}`] });
    expect(await adminEvents(p.id)).toMatchObject([{ status: "PROCESSED", reference: `refund-${p.reference}` }]);
    const actions = (await db.select({ a: s.auditLogs.action }).from(s.auditLogs)).map((x) => x.a);
    expect(actions).toEqual(expect.arrayContaining(["order.cancel_paid", "payment.refund"]));
  });

  it("después del despacho: devuelto; el stock vuelve (RETURN) solo si llegó en buen estado", async () => {
    const v = await makeVariant(5);
    for (const restock of [false, true]) {
      const { o } = await paidSim([[v.id, 1]]);
      await changeOrderStatus(adminId, o.id, { to: "PROCESSING", note: null });
      await changeOrderStatus(adminId, o.id, { to: "SHIPPED", note: null });
      const before = (await stock(v.id)).stockOnHand;
      const r = await refundOrder(adminId, o.id, { note: "Llegó roto", restock });
      expect(r.order.status).toBe("REFUNDED");
      expect((await stock(v.id)).stockOnHand).toBe(before + (restock ? 1 : 0));
      expect(await reversals(o.id)).toHaveLength(restock ? 1 : 0);
      expect(await orderRow(o.id)).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED" });
    }
  });

  it("transferencia: sin reembolso por API queda pendiente (REVIEW) hasta registrar la devolución hecha", async () => {
    const v = await makeVariant(5);
    const o = await order([[v.id, 1]], "transferencia");
    const [p] = await attempts(o.id);
    await confirmTransfer(adminId, p!.id, transferConfirmationSchema.parse({ amount: "1000", receivedOn: "2026-10-18", bankReference: "", note: "", commandId: randomUUID() }));

    const r = await refundOrder(adminId, o.id, note);
    expect(r.refunds).toEqual([{ reference: p!.reference, provider: "transferencia", result: "MANUAL", message: undefined }]);
    expect(await orderRow(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REVIEW" });
    expect((await stock(v.id)).stockOnHand).toBe(5);
    await resolveIncident(adminId, p!.id, "Transferido de vuelta, operación 123");
    expect(await orderRow(o.id)).toMatchObject({ paymentStatus: "REFUNDED" });
  });

  it("sin respuesta del proveedor: el pedido queda anulado y el pago pendiente; reintentar no devuelve dos veces", async () => {
    const v = await makeVariant(5);
    const { o, p, token } = await paidSim([[v.id, 1]]);
    simulator.timeouts(token, 1);
    const r = await refundOrder(adminId, o.id, note);
    expect(r.refunds[0]).toMatchObject({ result: "FAILED", message: expect.stringContaining("no respondió") });
    expect(await orderRow(o.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "REVIEW" });
    expect((await attempts(o.id))[0]!.status).toBe("REVIEW");
    expect(await adminEvents(p.id)).toMatchObject([{ status: "FAILED" }]);

    // La reconciliación no toma comandos del panel como si fueran notificaciones del proveedor.
    await reconcilePayments({ olderThanSeconds: -60 });
    expect(await adminEvents(p.id)).toMatchObject([{ status: "FAILED" }]);

    expect(await refundPayment(adminId, p.id)).toMatchObject({ result: "REFUNDED" });
    expect(await refundPayment(adminId, p.id)).toMatchObject({ result: "REFUNDED" }); // doble clic: nada más
    expect(simulator.get(token)!.refunds).toHaveLength(1);
    expect(await orderRow(o.id)).toMatchObject({ paymentStatus: "REFUNDED" });
  });

  it("un segundo envío no devuelve el stock dos veces; un pedido impago no se anula por aquí", async () => {
    const v = await makeVariant(5);
    const { o } = await paidSim([[v.id, 2]]);
    await refundOrder(adminId, o.id, note);
    await expect(refundOrder(adminId, o.id, note)).rejects.toBeInstanceOf(UserError);
    expect((await stock(v.id)).stockOnHand).toBe(5);
    expect(await reversals(o.id)).toHaveLength(1);

    const pending = await order([[v.id, 1]], "transferencia");
    await expect(refundOrder(adminId, pending.id, note)).rejects.toThrow("pedido pagado");
  });

  it("permisos: anular y reembolsar exige payments:manage (Administrador y Super administrador)", () => {
    expect(can("SUPER_ADMIN", "payments:manage")).toBe(true);
    expect(can("ADMIN", "payments:manage")).toBe(true);
    expect(can("SALES", "payments:manage")).toBe(false);
    expect(can("WAREHOUSE", "payments:manage")).toBe(false);
  });

  it("Mercado Pago sin credenciales no responde a notificaciones (404)", async () => {
    const res = await webhookRoute(
      new Request("http://localhost/api/payments/mercadopago/webhook?data.id=1&type=payment", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
      { params: Promise.resolve({ provider: "mercadopago" }) },
    );
    expect(res.status).toBe(404);
  });
});
