/**
 * Contrato de los proveedores de pago. Un adaptador habla con SU proveedor y normaliza lo que responde; nunca escribe
 * el pedido, el pago ni el stock: eso lo hace el servicio (./index.ts) con las reglas del dominio (docs/PAGOS.md).
 */
import type { PaymentAction } from "@/db/schema";
import type { AppEnv } from "@/lib/env";

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

/** Contexto ya resuelto del proveedor: ambiente, cuenta/comercio receptor y su configuración NO secreta. */
export type ProviderContext = { environment: string; account: string; settings: unknown; example?: boolean };

/** Resultado de una consulta autorizada al proveedor, normalizado. Nunca sale de datos que trajo el navegador. */
export type ProviderResult = {
  /** REVERSED: el proveedor devolvió el dinero o el cliente lo desconoció (contracargo), fuera de la tienda. */
  status: "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "EXPIRED" | "REVERSED";
  amount?: number;
  currency?: string;
  environment?: string;
  account?: string;
  externalId?: string | null;
  receivedAt?: Date;
  /** Lo que respondió el proveedor (se guarda sin secretos): explica la transición. */
  raw: unknown;
};

/** Resultado de pedir un reembolso: hecho, o aceptado y en proceso (se cierra cuando el proveedor lo confirme). */
export type RefundResult = { status: "REFUNDED" | "PENDING"; externalId: string | null; raw: unknown };

/** Sin respuesta confiable (timeout, red, error 5xx): resultado INCIERTO. No es un rechazo y no se repite a ciegas. */
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
  /** Reembolso por la API del proveedor (refund()). Sin esto, el dinero se devuelve a mano y se registra en el panel. */
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
  /**
   * Valida autenticidad y forma de una notificación según el protocolo del proveedor; extrae su id y el intento:
   * `externalId` (el valor guardado al iniciar) o `reference` (la referencia interna, si el proveedor solo la conoce así).
   * Lanza ProviderTimeoutError si para identificarla necesitó consultar al proveedor y este no respondió.
   */
  parseWebhook?(req: Request, ctx: ProviderContext): Promise<{ eventId: string | null; externalId: string; reference?: string; payload: unknown }>;
  /** Devuelve TODO lo cobrado en el intento. Idempotente con `key`: repetirla no reembolsa dos veces. */
  refund?(a: AttemptInfo, ctx: ProviderContext, key: string): Promise<RefundResult>;
}
