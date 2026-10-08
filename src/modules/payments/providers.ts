/**
 * Contrato de proveedores de pago y registro. Un adaptador habla con SU proveedor y normaliza lo que responde;
 * nunca escribe el pedido, el pago ni el stock: eso lo hace el servicio (./index.ts) con las reglas del dominio.
 * Agregar un proveedor = su adaptador aquí + configuración + verificación + pruebas (ver docs/PAGOS.md).
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { PaymentAction } from "@/db/schema";
import { type AppEnv, env } from "@/lib/env";
import { field } from "@/lib/form";
import { formatCLP, formatRut, normalizeRut } from "@/modules/chile";

export type ProviderId = "transferencia" | "simulado" | "webpay" | "mercadopago" | "khipu";

/** El intento tal como el servicio lo persistió ANTES de llamar al proveedor. */
export type AttemptInfo = {
  reference: string;
  orderNumber: string;
  amount: number;
  currency: string;
  externalId: string | null;
  expiresAt: Date | null;
};

/** Contexto ya resuelto del proveedor: ambiente, cuenta/comercio receptor y su configuración. */
export type ProviderContext = { environment: string; account: string; settings: unknown; example?: boolean };

/** Resultado de una consulta autorizada al proveedor, normalizado. Nunca sale de datos que trajo el navegador. */
export type ProviderResult = {
  status: "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED";
  amount?: number;
  currency?: string;
  environment?: string;
  account?: string;
  externalId?: string | null;
  receivedAt?: Date;
  /** Lo que respondió el proveedor (se guarda sin secretos): explica la transición. */
  raw: unknown;
};

/** Sin respuesta confiable (timeout, red): resultado INCIERTO. No es un rechazo y no se reintenta un cobro a ciegas. */
export class ProviderTimeoutError extends Error {}

export type Capabilities = {
  /** Consulta servidor a servidor del estado real. */
  verify: boolean;
  /** El comprador vuelve desde el proveedor a /api/payments/[id]/return. */
  browserReturn: boolean;
  /** El proveedor notifica a /api/payments/[id]/webhook. */
  webhook: boolean;
  /** Un usuario autorizado comprueba la recepción (transferencia). */
  manualConfirmation: boolean;
  refund: boolean;
  remoteCancel: boolean;
};

export interface PaymentProvider {
  id: ProviderId;
  label: string;
  description: string;
  /** Hay código real. Un pendiente no se vuelve operativo con un interruptor ni con credenciales. */
  implemented: boolean;
  /** Solo pruebas: nunca disponible fuera de APP_ENV local/test. */
  testOnly?: boolean;
  capabilities: Capabilities;
  /** Minutos que se reserva el stock de un pedido pagado con este método. */
  reservationMinutes(): number;
  /** Configuración efectiva (de la base: datos no secretos; del entorno: credenciales) o por qué no está lista. */
  configure(settings: unknown, appEnv: AppEnv): { ok: true; ctx: ProviderContext } | { ok: false; reason: string };
  /** Inicia el intento ya persistido. Repetible con la misma referencia. */
  start(a: AttemptInfo, ctx: ProviderContext): Promise<{ action: PaymentAction; externalId?: string | null; raw?: unknown }>;
  /** Estado real del intento. Lanza ProviderTimeoutError si no hay respuesta confiable. */
  verify?(a: AttemptInfo, ctx: ProviderContext): Promise<ProviderResult>;
  /** Del retorno del navegador saca SOLO lo que identifica el intento (un valor no adivinable); no decide el resultado. */
  parseReturn?(req: Request): Promise<{ externalId: string; payload: unknown }>;
  /** Valida autenticidad y forma de una notificación según el protocolo del proveedor; extrae su id y el intento. */
  parseWebhook?(req: Request, ctx: ProviderContext): Promise<{ eventId: string | null; externalId: string; payload: unknown }>;
}

const testEnv = (appEnv: AppEnv) => appEnv === "local" || appEnv === "test";

// ───────────── Transferencia bancaria ─────────────

export const ACCOUNT_TYPES = ["Cuenta corriente", "Cuenta vista", "Cuenta RUT", "Cuenta de ahorro"] as const;

/** Datos de RECEPCIÓN (no son credenciales): se muestran al cliente. */
export const transferSettingsSchema = z.object({
  bank: field.text(80),
  holder: field.text(120),
  rut: field.text(20).transform((v, ctx) => normalizeRut(v) ?? (ctx.addIssue({ code: "custom", message: "RUT inválido" }), z.NEVER)),
  accountType: z.enum(ACCOUNT_TYPES, "Elige el tipo de cuenta"),
  accountNumber: field.text(30).regex(/^[0-9-]{4,30}$/, "Solo números y guiones"),
  email: z.string().trim().toLowerCase().max(200).pipe(z.email("Email inválido")),
});
export type TransferSettings = z.infer<typeof transferSettingsSchema>;

/** Solo en local/test, y siempre rotulados: nunca se presentan como una cuenta real. */
const EXAMPLE_TRANSFER: TransferSettings = {
  bank: "Banco de Ejemplo",
  holder: "Tienda de Prueba SpA",
  rut: "11111111-1",
  accountType: "Cuenta corriente",
  accountNumber: "00-000-00000-00",
  email: "pagos@ejemplo.invalid",
};

const transferencia: PaymentProvider = {
  id: "transferencia",
  label: "Transferencia bancaria",
  description: "Transfiere desde tu banco; confirmamos el pago al verlo en nuestra cuenta.",
  implemented: true,
  capabilities: { verify: false, browserReturn: false, webhook: false, manualConfirmation: true, refund: false, remoteCancel: false },
  reservationMinutes: () => env.TRANSFER_RESERVATION_MINUTES ?? env.RESERVATION_TTL_MINUTES,
  configure(settings, appEnv) {
    const s = transferSettingsSchema.safeParse(settings);
    if (s.success) return { ok: true, ctx: { environment: appEnv, account: s.data.accountNumber.replace(/\D/g, ""), settings: s.data } };
    if (testEnv(appEnv)) return { ok: true, ctx: { environment: appEnv, account: "EJEMPLO", settings: EXAMPLE_TRANSFER, example: true } };
    return { ok: false, reason: "Faltan los datos de la cuenta de recepción (banco, titular, RUT, tipo, número y email)." };
  },
  async start(a, ctx) {
    const s = ctx.settings as TransferSettings;
    return {
      action: {
        kind: "instructions",
        title: "Datos para la transferencia",
        example: ctx.example,
        lines: [
          { label: "Banco", value: s.bank },
          { label: "Titular", value: s.holder },
          { label: "RUT", value: formatRut(s.rut) },
          { label: "Tipo de cuenta", value: s.accountType },
          { label: "N.º de cuenta", value: s.accountNumber },
          { label: "Email para el comprobante", value: s.email },
          { label: "Monto exacto", value: formatCLP(a.amount) },
          { label: "Comentario / referencia", value: a.orderNumber },
        ],
        note: "Transfiere el monto exacto e indica el número de pedido en el comentario. Confirmamos el pago cuando lo vemos en nuestra cuenta; estas instrucciones no son un comprobante de pago ni una boleta.",
      },
    };
  },
};

// ───────────── Simulado (solo local/test) ─────────────

type SimState = { status: "PENDING" | "PAID" | "FAILED" | "CANCELLED"; amount: number; reference: string; orderNumber: string; paidAmount?: number; timeouts?: number };
/** "Lado del proveedor" del simulador: en memoria del proceso (como una pasarela externa, se pierde si el servidor se reinicia). */
const sim = ((globalThis as { __simuladorPagos?: Map<string, SimState> }).__simuladorPagos ??= new Map());
const SIM_TOKEN = /^sim_[0-9a-f]{32}$/;

/** Lo que haría el comprador en la página de la pasarela (lo usan /pago/simulado y las pruebas). */
export const simulator = {
  get: (token: string) => sim.get(token),
  /** Decide el resultado como lo haría la pasarela. `paidAmount` simula cobrar otro monto. */
  decide(token: string, status: "PAID" | "FAILED" | "CANCELLED", paidAmount?: number) {
    const s = sim.get(token);
    if (!s || s.status !== "PENDING") return false;
    Object.assign(s, { status, paidAmount });
    return true;
  },
  /** Las próximas `n` consultas no responden (timeout). */
  timeouts(token: string, n: number) {
    const s = sim.get(token);
    if (s) s.timeouts = n;
  },
};

const simulado: PaymentProvider = {
  id: "simulado",
  label: "Pago simulado (solo pruebas)",
  description: "Pasarela de mentira para probar el flujo en local. Nunca mueve dinero.",
  implemented: true,
  testOnly: true,
  capabilities: { verify: true, browserReturn: true, webhook: true, manualConfirmation: false, refund: false, remoteCancel: false },
  reservationMinutes: () => env.RESERVATION_TTL_MINUTES,
  configure(_settings, appEnv) {
    if (!testEnv(appEnv)) return { ok: false, reason: "Solo existe con APP_ENV local o test." };
    if (env.PAYMENT_SIMULATION !== "on") return { ok: false, reason: "Requiere PAYMENT_SIMULATION=on." };
    return { ok: true, ctx: { environment: appEnv, account: "SIMULADOR", settings: {} } };
  },
  async start(a) {
    const token = a.externalId ?? `sim_${randomBytes(16).toString("hex")}`;
    if (!sim.has(token)) sim.set(token, { status: "PENDING", amount: a.amount, reference: a.reference, orderNumber: a.orderNumber });
    return { action: { kind: "redirect", method: "GET", url: new URL(`/pago/simulado/${token}`, env.APP_URL).toString(), fields: {} }, externalId: token };
  },
  async verify(a, ctx) {
    const s = a.externalId ? sim.get(a.externalId) : undefined;
    // El estado vive en la memoria del servidor: otro proceso (npm run jobs) o un reinicio no lo ven → sin respuesta, no rechazo.
    if (!s) throw new ProviderTimeoutError("El simulador no tiene esa transacción en este proceso.");
    if (s.timeouts) {
      s.timeouts--;
      throw new ProviderTimeoutError("El simulador no respondió.");
    }
    return { status: s.status, amount: s.paidAmount ?? s.amount, currency: "CLP", environment: ctx.environment, account: "SIMULADOR", externalId: a.externalId, raw: { ...s } };
  },
  async parseReturn(req) {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!SIM_TOKEN.test(token)) throw new Error("Retorno inválido.");
    return { externalId: token, payload: { token } };
  },
  async parseWebhook(req) {
    const body = z.object({ id: z.string().regex(/^[\w-]{1,64}$/), token: z.string().regex(SIM_TOKEN) }).parse(await req.json());
    return { eventId: body.id, externalId: body.token, payload: body };
  },
};

// ───────────── Pendientes: deshabilitados hasta implementar su protocolo ─────────────

/**
 * Punto de extensión de una pasarela real. Mientras `implemented` sea false, el registro la muestra como
 * pendiente y el servicio y las rutas rechazan toda operación: ninguna configuración la vuelve operativa.
 */
function pending(id: ProviderId, label: string, description: string, capabilities: Capabilities): PaymentProvider {
  return {
    id,
    label,
    description,
    implemented: false,
    capabilities,
    reservationMinutes: () => env.RESERVATION_TTL_MINUTES,
    configure: () => ({ ok: false, reason: "Integración pendiente (ver docs/PAGOS.md)." }),
    start: () => Promise.reject(new Error(`${label}: integración pendiente.`)),
  };
}

export const PROVIDERS: Record<ProviderId, PaymentProvider> = {
  transferencia,
  simulado,
  // Webpay Plus: crear transacción → redirección POST con token_ws → retorno → commit/consulta server-side. Sin webhook.
  webpay: pending("webpay", "Webpay Plus", "Tarjetas de débito y crédito (Transbank).", {
    verify: true,
    browserReturn: true,
    webhook: false,
    manualConfirmation: false,
    refund: true,
    remoteCancel: false,
  }),
  // Mercado Pago (Checkout Pro): preferencia → redirección → notificación firmada + consulta del pago real.
  mercadopago: pending("mercadopago", "Mercado Pago", "Tarjetas y saldo Mercado Pago.", {
    verify: true,
    browserReturn: true,
    webhook: true,
    manualConfirmation: false,
    refund: true,
    remoteCancel: false,
  }),
  // Khipu: cobro → redirección → notificación + consulta del pago.
  khipu: pending("khipu", "Khipu", "Transferencia simplificada desde el banco del cliente.", {
    verify: true,
    browserReturn: true,
    webhook: true,
    manualConfirmation: false,
    refund: false,
    remoteCancel: false,
  }),
};

export const getProvider = (id: string): PaymentProvider | null => (Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id as ProviderId] : null);
