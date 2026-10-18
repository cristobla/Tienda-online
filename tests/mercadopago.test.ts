import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderTimeoutError } from "@/modules/payments/contract";
import { collectorOf, mercadoPago, validSignature } from "@/modules/payments/mercadopago";

/**
 * Adaptador de Mercado Pago contra la API simulada con `fetch`. Las respuestas siguen la forma de la documentación
 * oficial (preferencias, búsqueda de pagos, reembolsos); NO son grabaciones del sandbox: antes de cargar credenciales de
 * producción hay que probar contra el sandbox real (docs/PAGOS.md §9).
 */

const TOKEN = "TEST-1234567890123456-101818-0123456789abcdef0123456789abcdef-987654321";
const SECRET = "secreto-del-webhook-de-prueba";
const PREF = "987654321-0f8d2a6e-1b2c-4d3e-8f90-123456789abc";
const mp = mercadoPago(() => ({ accessToken: TOKEN, webhookSecret: SECRET }));
const ctx = { environment: "test", account: "987654321", settings: {} };
const attempt = (over: Partial<Parameters<NonNullable<typeof mp.verify>>[0]> = {}) => ({
  reference: "ORD-001234-1",
  orderNumber: "ORD-001234",
  amount: 15990,
  currency: "CLP",
  externalId: null,
  expiresAt: new Date("2026-10-18T15:30:00Z"),
  ...over,
});
const payment = (over: Record<string, unknown> = {}) => ({
  id: 1311772470,
  status: "approved",
  status_detail: "accredited",
  external_reference: "ORD-001234-1",
  transaction_amount: 15990,
  currency_id: "CLP",
  collector_id: 987654321,
  live_mode: false,
  date_approved: "2026-10-18T11:05:00.000-03:00",
  payment_method_id: "visa",
  payment_type_id: "credit_card",
  ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Respuestas en orden; guarda cada llamada (URL, método, cabeceras, cuerpo). */
function api(...responses: (Response | Error)[]) {
  const calls: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = responses.shift();
    if (!r) throw new Error("llamada inesperada a la API");
    if (r instanceof Error) throw r;
    return r;
  });
  return calls;
}

const sign = (dataId: string | null, requestId: string, ts = "1760799900") =>
  `ts=${ts},v1=${createHmac("sha256", SECRET)
    .update(`${dataId ? `id:${dataId.toLowerCase()};` : ""}request-id:${requestId};ts:${ts};`)
    .digest("hex")}`;
const notification = (dataId: string, opts: { signature?: string; type?: string } = {}) =>
  new Request(`https://tienda.example/api/payments/mercadopago/webhook?data.id=${dataId}&type=${opts.type ?? "payment"}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "req-1", "x-signature": opts.signature ?? sign(dataId, "req-1") },
    body: JSON.stringify({ id: 12345, type: opts.type ?? "payment", action: "payment.updated", data: { id: dataId }, live_mode: false }),
  });

afterEach(() => vi.restoreAllMocks());

describe("Mercado Pago: configuración", () => {
  it("sin credenciales no está lista; en producción rechaza credenciales de prueba", () => {
    expect(mercadoPago(() => null).configure({}, "local")).toMatchObject({ ok: false });
    expect(mp.configure({}, "production")).toMatchObject({ ok: false, reason: expect.stringContaining("prueba") });
    expect(mp.configure({}, "integration")).toEqual({ ok: true, ctx: { environment: "integration", account: "987654321", settings: {} } });
    expect(collectorOf("APP_USR-123-456-abc-55555")).toBe("55555");
    expect(mp.implemented).toBe(true);
  });
});

describe("Mercado Pago: inicio (preferencia de Checkout Pro)", () => {
  it("crea la preferencia en CLP con la referencia del intento y redirige al checkout", async () => {
    const calls = api(json({ id: PREF, init_point: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=x", sandbox_init_point: "https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=x" }, 201));
    const r = await mp.start(attempt(), ctx);
    expect(r).toMatchObject({ action: { kind: "redirect", method: "GET", url: "https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=x" }, externalId: PREF });
    const [c] = calls;
    expect(c).toMatchObject({ url: "https://api.mercadopago.com/checkout/preferences", method: "POST" });
    expect(c!.headers).toMatchObject({ Authorization: `Bearer ${TOKEN}`, "X-Idempotency-Key": "pref-ORD-001234-1" });
    expect(c!.body).toMatchObject({
      items: [{ quantity: 1, unit_price: 15990, currency_id: "CLP" }],
      external_reference: "ORD-001234-1",
      back_urls: { success: "http://localhost:3000/api/payments/mercadopago/return" },
      binary_mode: true,
      payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
      expires: true,
      expiration_date_to: "2026-10-18T15:30:00.000Z",
    });
    // Sin HTTPS no se pide el retorno automático (Mercado Pago lo exige con https).
    expect(c!.body).not.toHaveProperty("auto_return");
  });

  it("reintento del mismo intento: la misma preferencia, sin crear otra", async () => {
    const calls = api(json({ id: PREF, init_point: "https://www.mercadopago.cl/checkout/v1/redirect?pref_id=x", sandbox_init_point: "https://sandbox.mercadopago.cl/x" }));
    await mp.start(attempt({ externalId: PREF }), ctx);
    expect(calls).toMatchObject([{ url: `https://api.mercadopago.com/checkout/preferences/${PREF}`, method: "GET" }]);
  });

  it("no redirige a un sitio que no sea Mercado Pago; sin respuesta falla el intento (no queda incierto)", async () => {
    api(json({ id: PREF, init_point: "https://evil.example/pagar", sandbox_init_point: "https://evil.example/pagar" }, 201));
    await expect(mp.start(attempt(), ctx)).rejects.toThrow("URL de pago");
    api(new TypeError("fetch failed"));
    const e = await mp.start(attempt(), ctx).catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ProviderTimeoutError);
    await expect(mp.start(attempt({ currency: "USD" }), ctx)).rejects.toThrow("CLP");
  });
});

describe("Mercado Pago: consulta del pago real", () => {
  it("un pago aprobado entre varios intentos decide PAID, con monto, moneda, cuenta y fecha", async () => {
    const calls = api(json({ results: [payment({ id: 2, status: "rejected" }), payment(), payment({ id: 3, external_reference: "OTRO-1" })] }));
    const r = await mp.verify!(attempt({ externalId: PREF }), ctx);
    expect(calls[0]!.url).toBe("https://api.mercadopago.com/v1/payments/search?external_reference=ORD-001234-1&sort=date_created&criteria=desc");
    expect(r).toMatchObject({ status: "PAID", amount: 15990, currency: "CLP", account: "987654321", environment: "test", externalId: PREF });
    expect(r.receivedAt).toEqual(new Date("2026-10-18T14:05:00.000Z"));
    expect(r.raw).toMatchObject({ pago: 1311772470, estado: "approved", pagos: 2 }); // el de otra referencia no cuenta
  });

  it("mapea los demás estados y no confunde ambientes", async () => {
    api(json({ results: [] }));
    expect((await mp.verify!(attempt(), ctx)).status).toBe("PENDING");
    api(json({ results: [payment({ status: "rejected" })] }));
    expect((await mp.verify!(attempt(), ctx)).status).toBe("FAILED");
    api(json({ results: [payment({ status: "refunded" })] }));
    expect((await mp.verify!(attempt(), ctx)).status).toBe("CANCELLED");
    api(json({ results: [payment({ status: "in_process" })] }));
    expect((await mp.verify!(attempt(), ctx)).status).toBe("PENDING");
    // Un pago con dinero real en un ambiente de pruebas no se toma como de este ambiente (applyResult lo ignora).
    api(json({ results: [payment({ live_mode: true })] }));
    expect((await mp.verify!(attempt(), ctx)).environment).toBe("mercadopago-real");
  });

  it("sin respuesta, 429 o 5xx = incierto; 4xx = error", async () => {
    api(new TypeError("fetch failed"));
    await expect(mp.verify!(attempt(), ctx)).rejects.toBeInstanceOf(ProviderTimeoutError);
    api(json({ message: "busy" }, 503));
    await expect(mp.verify!(attempt(), ctx)).rejects.toBeInstanceOf(ProviderTimeoutError);
    api(json({ message: "invalid token" }, 401));
    const e = await mp.verify!(attempt(), ctx).catch((x) => x);
    expect(e).not.toBeInstanceOf(ProviderTimeoutError);
    expect(e.message).toContain("401");
  });
});

describe("Mercado Pago: retorno y notificaciones", () => {
  it("el retorno solo acepta un preference_id con su forma (no adivinable)", async () => {
    const ok = await mp.parseReturn!(new Request(`https://t.example/api/payments/mercadopago/return?preference_id=${PREF}&status=approved&payment_id=1`));
    expect(ok).toEqual({ externalId: PREF, payload: { preference_id: PREF, payment_id: "1", status: "approved" } });
    await expect(mp.parseReturn!(new Request("https://t.example/r?external_reference=ORD-001234-1&status=approved"))).rejects.toThrow();
  });

  it("valida la firma x-signature (HMAC-SHA256) en tiempo constante", () => {
    expect(validSignature(SECRET, sign("123", "req-1"), "req-1", "123")).toBe(true);
    expect(validSignature(SECRET, sign("abc", "req-1"), "req-1", "ABC")).toBe(true); // data.id alfanumérico va en minúsculas
    expect(validSignature(SECRET, sign("123", "req-1"), "req-2", "123")).toBe(false);
    expect(validSignature("otra-clave-cualquiera", sign("123", "req-1"), "req-1", "123")).toBe(false);
    expect(validSignature(SECRET, "ts=1,v1=zz", "req-1", "123")).toBe(false);
    expect(validSignature(SECRET, null, "req-1", "123")).toBe(false);
  });

  it("notificación firmada de un pago: consulta la API para saber a qué intento pertenece", async () => {
    const calls = api(json(payment()));
    const r = await mp.parseWebhook!(notification("1311772470"), ctx);
    expect(calls).toMatchObject([{ url: "https://api.mercadopago.com/v1/payments/1311772470", method: "GET" }]);
    expect(r).toMatchObject({ eventId: "payment:12345", externalId: "1311772470", reference: "ORD-001234-1" });
  });

  it("firma inválida: se rechaza sin consultar nada; otros temas se guardan sin intento", async () => {
    const calls = api();
    await expect(mp.parseWebhook!(notification("1311772470", { signature: sign("999", "req-1") }), ctx)).rejects.toThrow("Firma");
    expect(calls).toHaveLength(0);
    const other = await mp.parseWebhook!(notification("555", { type: "merchant_order", signature: sign("555", "req-1") }), ctx);
    expect(other).toMatchObject({ externalId: "merchant_order:555" });
    expect(other.reference).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe("Mercado Pago: reembolso", () => {
  it("reembolso total del pago aprobado, con clave de idempotencia", async () => {
    const calls = api(json({ results: [payment()] }), json({ id: 77, payment_id: 1311772470, amount: 15990, status: "approved" }, 201));
    const r = await mp.refund!(attempt({ externalId: PREF }), ctx, "refund-ORD-001234-1");
    expect(r).toMatchObject({ status: "REFUNDED", externalId: "77" });
    expect(calls[1]).toMatchObject({ url: "https://api.mercadopago.com/v1/payments/1311772470/refunds", method: "POST", body: {} });
    expect(calls[1]!.headers).toMatchObject({ "X-Idempotency-Key": "refund-ORD-001234-1" });
  });

  it("ya devuelto: no vuelve a pedirlo; en proceso: PENDING; sin pago aprobado: error", async () => {
    let calls = api(json({ results: [payment({ status: "refunded" })] }));
    expect(await mp.refund!(attempt(), ctx, "k")).toMatchObject({ status: "REFUNDED" });
    expect(calls).toHaveLength(1);
    api(json({ results: [payment()] }), json({ id: 78, status: "in_process" }, 201));
    expect(await mp.refund!(attempt(), ctx, "k")).toMatchObject({ status: "PENDING" });
    calls = api(json({ results: [payment({ status: "rejected" })] }));
    await expect(mp.refund!(attempt(), ctx, "k")).rejects.toThrow("aprobado");
    api(json({ results: [payment()] }), new TypeError("fetch failed"));
    await expect(mp.refund!(attempt(), ctx, "k")).rejects.toBeInstanceOf(ProviderTimeoutError);
  });
});
