/**
 * Mercado Pago Checkout Pro (Chile, CLP). Flujo:
 *   start   → crea una preferencia (external_reference = referencia del intento) y redirige al checkout de Mercado Pago.
 *   retorno → el comprador vuelve a /api/payments/mercadopago/return con `preference_id` (no adivinable): solo identifica.
 *   webhook → notificación firmada (x-signature) a /api/payments/mercadopago/webhook con el id del pago.
 *   verify  → en ambos casos se CONSULTA la API (pagos de esa external_reference) y solo eso decide el resultado.
 *   refund  → reembolso total del pago aprobado, con clave de idempotencia.
 * Documentación: https://www.mercadopago.cl/developers/es/docs/checkout-pro/overview
 * Credenciales solo del entorno del servidor (src/lib/env.ts); nunca en la base ni en el navegador.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { type PaymentProvider, type ProviderResult, ProviderTimeoutError } from "./contract";

const API = "https://api.mercadopago.com";
/** "<id de usuario>-<uuid>": así son los ids de preferencia (el retorno trae uno). */
const PREFERENCE_ID = /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_ID = /^\d{1,20}$/;

export type MercadoPagoCredentials = { accessToken: string; webhookSecret: string };

type Preference = { id: string; init_point?: string; sandbox_init_point?: string };
type MpPayment = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string | null;
  transaction_amount: number;
  currency_id: string;
  collector_id?: number;
  live_mode?: boolean;
  date_approved?: string | null;
  payment_method_id?: string;
  payment_type_id?: string;
};

/** Estados de un pago de Mercado Pago → estado normalizado del intento. */
const STATUS: Record<string, ProviderResult["status"]> = {
  approved: "PAID",
  authorized: "AUTHORIZED",
  pending: "PENDING",
  in_process: "PENDING",
  in_mediation: "PENDING",
  rejected: "FAILED",
  cancelled: "CANCELLED",
  // Devuelto o contracargado: no hay dinero que confirme el pedido (un pago ya confirmado no retrocede: ver applyResult).
  refunded: "CANCELLED",
  charged_back: "CANCELLED",
};

/** La cuenta receptora (id de usuario) es el último tramo del access token: "APP_USR-…-123456789". */
export const collectorOf = (token: string) => /-(\d+)$/.exec(token)?.[1] ?? "";

/**
 * Firma de una notificación. Cabecera `x-signature: ts=…,v1=…`: HMAC-SHA256 con la clave secreta del webhook sobre
 * "id:<data.id de la URL, en minúsculas>;request-id:<x-request-id>;ts:<ts>;" (lo que no viene se omite).
 * Comparación en tiempo constante.
 */
export function validSignature(secret: string, signature: string | null, requestId: string | null, dataId: string | null) {
  const parts = new Map((signature ?? "").split(",").map((p) => p.trim().split("=") as [string, string]));
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !/^\d+$/.test(ts) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  const manifest = `${dataId ? `id:${dataId.toLowerCase()};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  return timingSafeEqual(createHmac("sha256", secret).update(manifest).digest(), Buffer.from(v1, "hex"));
}

/** Llamada a la API. Sin respuesta, 429 o 5xx = incierto (ProviderTimeoutError); 4xx = rechazo con su motivo. */
async function call<T>(token: string, path: string, init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.idempotencyKey && { "X-Idempotency-Key": init.idempotencyKey }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new ProviderTimeoutError(`Mercado Pago no respondió (${e instanceof Error ? e.name : "red"}).`);
  }
  if (r.status === 429 || r.status >= 500) throw new ProviderTimeoutError(`Mercado Pago respondió ${r.status}.`);
  const json = (await r.json().catch(() => null)) as (T & { message?: unknown }) | null;
  if (!r.ok || json === null) throw new Error(`Mercado Pago rechazó la solicitud (${r.status}${json?.message ? `: ${String(json.message).slice(0, 200)}` : ""}).`);
  return json;
}

/** Pagos de Mercado Pago de un intento (por su external_reference), el más reciente primero. */
async function paymentsOf(token: string, reference: string) {
  const r = await call<{ results?: MpPayment[] }>(token, `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`);
  return (r.results ?? []).filter((p) => p.external_reference === reference);
}

/** El checkout tiene que ser de Mercado Pago y por HTTPS: es a donde se manda al comprador. */
const checkoutUrl = (url: string | undefined) => {
  const u = url && URL.canParse(url) ? new URL(url) : null;
  if (!u || u.protocol !== "https:" || !/(^|\.)mercadopago\.(cl|com)$/.test(u.hostname)) throw new Error("Mercado Pago no entregó una URL de pago válida.");
  return u.toString();
};

/** Adaptador. `credentials` se lee en cada uso (el registro usa el entorno; las pruebas, credenciales de mentira). */
export function mercadoPago(credentials: () => MercadoPagoCredentials | null): PaymentProvider {
  const token = () => {
    const c = credentials();
    if (!c) throw new Error("Mercado Pago no está configurado.");
    return c.accessToken;
  };
  return {
    id: "mercadopago",
    label: "Mercado Pago",
    description: "Tarjetas de débito y crédito, o el saldo de tu cuenta Mercado Pago.",
    implemented: true,
    capabilities: { verify: true, browserReturn: true, webhook: true, manualConfirmation: false, refund: true, remoteCancel: false },
    reservationMinutes: () => env.RESERVATION_TTL_MINUTES,

    configure(_settings, appEnv) {
      const c = credentials();
      if (!c) return { ok: false, reason: "Faltan MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET en el entorno del servidor." };
      if (appEnv === "production" && c.accessToken.startsWith("TEST-")) return { ok: false, reason: "En producción no se usan credenciales de prueba de Mercado Pago." };
      return { ok: true, ctx: { environment: appEnv, account: collectorOf(c.accessToken), settings: {} } };
    },

    async start(a) {
      if (a.currency !== "CLP") throw new Error("Mercado Pago (Chile) solo cobra en CLP.");
      const t = token();
      const back = new URL("/api/payments/mercadopago/return", env.APP_URL).toString();
      let pref: Preference;
      try {
        pref = a.externalId
          ? // Mismo intento (reintento del cliente): la misma preferencia, no otra.
            await call<Preference>(t, `/checkout/preferences/${encodeURIComponent(a.externalId)}`)
          : await call<Preference>(t, "/checkout/preferences", {
              method: "POST",
              idempotencyKey: `pref-${a.reference}`,
              body: {
                items: [{ id: a.orderNumber, title: `Pedido ${a.orderNumber}`, quantity: 1, unit_price: a.amount, currency_id: "CLP" }],
                external_reference: a.reference,
                back_urls: { success: back, pending: back, failure: back },
                // Volver solo al aprobar exige URLs https (en local, el comprador vuelve con el botón de Mercado Pago).
                ...(back.startsWith("https://") && { auto_return: "approved" }),
                // Aprobado o rechazado al instante; sin efectivo ni cupones (quedarían pendientes por días, más allá de la reserva).
                binary_mode: true,
                payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }] },
                ...(a.expiresAt && { expires: true, expiration_date_to: a.expiresAt.toISOString() }),
              },
            });
      } catch (e) {
        // Antes de redirigir al comprador no se ha cobrado nada: falla el intento (el cliente puede reintentar), no queda incierto.
        if (e instanceof ProviderTimeoutError) throw new Error(e.message);
        throw e;
      }
      if (!PREFERENCE_ID.test(pref.id)) throw new Error("Mercado Pago no entregó una preferencia válida.");
      const url = checkoutUrl(t.startsWith("TEST-") ? (pref.sandbox_init_point ?? pref.init_point) : pref.init_point);
      return { action: { kind: "redirect", method: "GET", url, fields: {} }, externalId: pref.id, raw: { preferencia: pref.id } };
    },

    async verify(a, ctx) {
      const list = await paymentsOf(token(), a.reference);
      const p = list.find((x) => x.status === "approved") ?? list[0];
      if (!p) return { status: "PENDING", environment: ctx.environment, externalId: a.externalId, raw: { pagos: 0 } };
      // Pago real en un ambiente de pruebas (o al revés): otro "ambiente", así applyResult lo ignora y queda a la vista.
      const live = ctx.environment === "production";
      return {
        status: STATUS[p.status] ?? "PENDING",
        amount: p.transaction_amount,
        currency: p.currency_id,
        environment: p.live_mode === undefined || p.live_mode === live ? ctx.environment : p.live_mode ? "mercadopago-real" : "mercadopago-prueba",
        account: ctx.account ? String(p.collector_id ?? "") : undefined,
        externalId: a.externalId,
        receivedAt: p.date_approved ? new Date(p.date_approved) : undefined,
        raw: { pago: p.id, estado: p.status, detalle: p.status_detail, medio: p.payment_method_id, tipo: p.payment_type_id, monto: p.transaction_amount, modoReal: p.live_mode, pagos: list.length },
      };
    },

    async parseReturn(req) {
      const q = new URL(req.url).searchParams;
      const preference = q.get("preference_id") ?? "";
      if (!PREFERENCE_ID.test(preference)) throw new Error("Retorno inválido.");
      // payment_id y status vienen del navegador: se guardan como referencia, nunca deciden nada.
      return { externalId: preference, payload: { preference_id: preference, payment_id: q.get("payment_id")?.slice(0, 30), status: q.get("status")?.slice(0, 30) } };
    },

    async parseWebhook(req) {
      const c = credentials();
      if (!c) throw new Error("Mercado Pago no está configurado.");
      const url = new URL(req.url);
      const dataIdInUrl = url.searchParams.get("data.id");
      if (!validSignature(c.webhookSecret, req.headers.get("x-signature"), req.headers.get("x-request-id"), dataIdInUrl)) throw new Error("Firma inválida.");
      const body = z
        .object({
          id: z.union([z.number(), z.string().max(40)]).optional(),
          type: z.string().max(40).optional(),
          action: z.string().max(60).optional(),
          data: z.object({ id: z.union([z.number(), z.string().max(40)]) }).optional(),
        })
        .parse(await req.json());
      const type = url.searchParams.get("type") ?? body.type ?? "";
      const dataId = dataIdInUrl ?? (body.data ? String(body.data.id) : "");
      const eventId = body.id !== undefined ? `${type}:${body.id}` : null;
      // Otros temas (órdenes, contracargos…) no identifican un intento: se guardan y quedan ignorados.
      if (type !== "payment" || !PAYMENT_ID.test(dataId)) return { eventId, externalId: `${type}:${dataId}`.slice(0, 80), payload: { tipo: type, accion: body.action, id: dataId } };
      // La notificación solo trae el id del pago: la API dice a qué intento pertenece (su external_reference).
      const p = await call<MpPayment>(c.accessToken, `/v1/payments/${dataId}`);
      return { eventId, externalId: dataId, reference: p.external_reference ?? undefined, payload: { tipo: type, accion: body.action, pago: dataId, estado: p.status } };
    },

    async refund(a, _ctx, key) {
      const t = token();
      const list = await paymentsOf(t, a.reference);
      const approved = list.find((x) => x.status === "approved");
      if (!approved) {
        // Ya devuelto (reintento después de un corte, o desde el panel de Mercado Pago): no hay nada más que hacer.
        const refunded = list.find((x) => x.status === "refunded");
        if (refunded) return { status: "REFUNDED", externalId: String(refunded.id), raw: { pago: refunded.id, estado: refunded.status } };
        throw new Error("Mercado Pago no tiene un pago aprobado de este intento para reembolsar.");
      }
      // Cuerpo vacío = reembolso total. La clave de idempotencia hace que un reintento devuelva el mismo reembolso.
      const r = await call<{ id: number; status: string; amount?: number }>(t, `/v1/payments/${approved.id}/refunds`, { method: "POST", body: {}, idempotencyKey: key });
      const raw = { pago: approved.id, reembolso: r.id, estado: r.status, monto: r.amount };
      if (r.status === "approved") return { status: "REFUNDED", externalId: String(r.id), raw };
      if (r.status === "in_process" || r.status === "pending") return { status: "PENDING", externalId: String(r.id), raw };
      throw new Error(`Mercado Pago no aprobó el reembolso (${r.status}).`);
    },
  };
}
