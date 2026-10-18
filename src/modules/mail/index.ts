/**
 * Correos al cliente y avisos a la tienda (cola durable). Encolar va en la transacción del hecho que se avisa; enviar lo hace el job
 * (`npm run jobs`) con reintentos. Texto plano (sin HTML que sanitizar), armado al enviar con los datos vigentes.
 * Proveedor: Resend por HTTP si hay RESEND_API_KEY; en local/test, la consola. Otro proveedor = otra función `Deliver`.
 */
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db, type Transaction, type Tx } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { mapsLink, storeAddressLine } from "@/lib/site";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { isSold } from "@/modules/orders/status";
import { getProvider } from "@/modules/payments/providers";
import { readSettings } from "@/modules/settings";

/** order.*: al cliente. store.*: al encargado de la tienda (correo de avisos en «Datos de la tienda»). */
export type EmailKind = "order.received" | "order.paid" | "order.shipped" | "store.order_new" | "store.order_paid";

export const EMAIL_LABELS: Record<string, string> = {
  "order.received": "Pedido recibido",
  "order.paid": "Pago confirmado",
  "order.shipped": "Pedido despachado",
  "store.order_new": "Aviso a la tienda: pedido nuevo",
  "store.order_paid": "Aviso a la tienda: pedido pagado",
};

/** Encola un aviso del pedido (al cliente, o a `to`). Idempotente: el mismo aviso del mismo pedido existe una sola vez. */
export async function enqueueEmail(tx: Transaction, kind: EmailKind, order: { id: string; email: string }, to = order.email) {
  await tx
    .insert(s.emailOutbox)
    .values({ key: `${kind}:${order.id}`, kind, orderId: order.id, to })
    .onConflictDoNothing({ target: s.emailOutbox.key });
}

/** Aviso a la tienda, si hay un correo de avisos configurado. Va en la misma transacción que el hecho. */
export async function notifyStore(tx: Transaction, kind: "store.order_new" | "store.order_paid", order: { id: string; email: string }) {
  const { orderNotifyEmail } = await readSettings(tx);
  if (orderNotifyEmail) await enqueueEmail(tx, kind, order, orderNotifyEmail);
}

type Message = { id: string; to: string; subject: string; text: string };
export type Deliver = (m: Message) => Promise<void>;

/** Resend por HTTP (sin SDK). La clave de idempotencia evita un duplicado si el proceso cae justo después de enviar. */
const resend: Deliver = async (m) => {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": m.id },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`El proveedor de correo respondió ${r.status}.`);
};
const toConsole: Deliver = async (m) => console.log(`[correo local] Para: ${m.to} · ${m.subject}`);

/** Sin proveedor fuera de local/test: los correos esperan en la cola (no se dan por enviados). */
export const defaultDeliver = (): Deliver | null => (env.RESEND_API_KEY ? resend : env.APP_ENV === "local" || env.APP_ENV === "test" ? toConsole : null);


/** Asunto y texto del aviso con los datos actuales del pedido; null si el aviso ya no corresponde (p. ej. el pedido se canceló). */
export async function renderEmail(tx: Tx, kind: string, orderId: string): Promise<{ subject: string; text: string } | null> {
  const [o] = await tx.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!o) return null;
  const link = new URL(`/pedido/${o.id}`, env.APP_URL).toString();
  const a = o.shippingAddress;
  const st = await readSettings(tx);
  const pickup = o.fulfillment === "PICKUP";
  const place = [storeAddressLine(st), st.hours, mapsLink(st)].filter(Boolean).join(" · ");
  const footer = ["", `Revisa tu pedido en: ${link}`, "", "Este correo no es una boleta ni un comprobante de pago.", st.name].join("\n");

  if (kind === "store.order_new" || kind === "store.order_paid") {
    const isNew = kind === "store.order_new";
    // Un pedido que se canceló antes de enviar el aviso ya no necesita atención.
    if (isNew ? o.status === "CANCELLED" : !isSold(o.status)) return null;
    const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id)).orderBy(asc(s.orderItems.productName));
    const [p] = await tx.select({ provider: s.payments.provider }).from(s.payments).where(eq(s.payments.orderId, o.id)).orderBy(desc(s.payments.attempt)).limit(1);
    const method = o.paymentMethod ?? p?.provider;
    return {
      subject: isNew ? `Nuevo pedido ${o.orderNumber} · ${formatCLP(o.total)}` : `Pedido ${o.orderNumber} pagado: listo para preparar`,
      text: [
        isNew ? `Llegó un pedido nuevo a ${st.name}.` : `Se confirmó el pago del pedido ${o.orderNumber}: ya puedes prepararlo.`,
        "",
        `Pedido: ${o.orderNumber} (${formatDateTime(o.createdAt)})`,
        `Cliente: ${o.customerName} · ${o.email}${o.phone ? ` · ${o.phone}` : ""}`,
        `Total: ${formatCLP(o.total)} (${pickup ? "retiro en el local" : `despacho ${o.shippingTotal ? formatCLP(o.shippingTotal) : "gratis"}`})`,
        method ? `Medio de pago: ${getProvider(method)?.label ?? method}` : null,
        o.couponCode ? `Cupón: ${o.couponCode} (−${formatCLP(o.discountTotal)})` : null,
        "",
        ...items.map((i) => `- ${i.quantity} × ${i.productName} (${i.variantName}, SKU ${i.sku}): ${formatCLP(i.lineTotal)}`),
        a ? `\nDespacho a: ${a.street} ${a.number}${a.apartment ? `, ${a.apartment}` : ""}, ${a.commune}, ${a.region}${a.notes ? ` (${a.notes})` : ""}` : null,
        "",
        `Ver en el panel: ${new URL(`/admin/pedidos/${o.id}`, env.APP_URL).toString()}`,
      ]
        .filter((l) => typeof l === "string")
        .join("\n"),
    };
  }

  if (kind === "order.received") {
    if (o.status !== "PENDING_PAYMENT") return null;
    const items = await tx.select().from(s.orderItems).where(eq(s.orderItems.orderId, o.id)).orderBy(asc(s.orderItems.productName));
    const [p] = await tx.select().from(s.payments).where(eq(s.payments.orderId, o.id)).orderBy(desc(s.payments.attempt)).limit(1);
    const action = p?.status === "PENDING" ? p.checkout : null;
    const pay =
      action?.kind === "instructions"
        ? [
            "",
            action.example ? "DATOS DE EJEMPLO (entorno de pruebas): no transfieras a esta cuenta." : null,
            `${action.title}:`,
            ...action.lines.map((l) => `  ${l.label}: ${l.value}`),
            p?.expiresAt && `Plazo para pagar: ${formatDateTime(p.expiresAt)}. Si no recibimos el pago a tiempo, el pedido se cancela y los productos vuelven a estar disponibles.`,
          ]
        : ["", "Para pagar, entra al enlace de tu pedido."];
    return {
      subject: `Recibimos tu pedido ${o.orderNumber}`,
      text: [
        `Hola ${o.customerName}:`,
        "",
        `Recibimos tu pedido ${o.orderNumber} por ${formatCLP(o.total)} (IVA incluido).`,
        "",
        ...items.map((i) => `- ${i.quantity} × ${i.productName} (${i.variantName}): ${formatCLP(i.lineTotal)}`),
        o.discountTotal ? `Descuento${o.couponCode ? ` (cupón ${o.couponCode})` : ""}: −${formatCLP(o.discountTotal)}` : null,
        pickup ? `Retiro en el local: ${place || st.name}` : `Despacho: ${o.shippingTotal ? formatCLP(o.shippingTotal) : "gratis"}`,
        a ? `Dirección: ${a.street} ${a.number}${a.apartment ? `, ${a.apartment}` : ""}, ${a.commune}, ${a.region}` : null,
        ...pay,
        footer,
      ]
        .filter((l) => typeof l === "string")
        .join("\n"),
    };
  }
  if (kind === "order.paid") {
    if (!isSold(o.status)) return null;
    return {
      subject: `Pago confirmado: pedido ${o.orderNumber}`,
      text: [`Hola ${o.customerName}:`, "", `Confirmamos el pago de tu pedido ${o.orderNumber} por ${formatCLP(o.total)}.`, pickup ? "Lo estamos preparando y te avisaremos cuando esté listo para retirar." : "Lo estamos preparando y te avisaremos cuando lo despachemos.", footer].join("\n"),
    };
  }
  if (kind === "order.shipped") {
    if (o.status !== "SHIPPED" && o.status !== "DELIVERED") return null;
    if (pickup)
      return {
        subject: `Tu pedido ${o.orderNumber} está listo para retirar`,
        text: [`Hola ${o.customerName}:`, "", `Tu pedido ${o.orderNumber} está listo. Puedes retirarlo en ${place || st.name}.`, "Trae tu número de pedido.", footer].join("\n"),
      };
    return {
      subject: `Tu pedido ${o.orderNumber} va en camino`,
      text: [`Hola ${o.customerName}:`, "", `Despachamos tu pedido ${o.orderNumber}${a ? ` a ${a.commune}, ${a.region}` : ""}.`, footer].join("\n"),
    };
  }
  return null;
}

const MAX_TRIES = 5;

/**
 * Envía la cola (job). Cada correo se toma con FOR UPDATE SKIP LOCKED: dos procesos a la vez no envían el mismo.
 * Un aviso con más de 3 días en cola no se manda tarde. Sin proveedor configurado, los correos esperan.
 */
export async function sendPendingEmails({ limit = 20, deliver = defaultDeliver() }: { limit?: number; deliver?: Deliver | null } = {}) {
  await db
    .update(s.emailOutbox)
    .set({ status: "SKIPPED", lastError: "Más de 3 días en cola: no se envió." })
    .where(and(eq(s.emailOutbox.status, "PENDING"), lt(s.emailOutbox.createdAt, sql`now() - interval '3 days'`)));
  if (!deliver) {
    const waiting = await db.$count(s.emailOutbox, eq(s.emailOutbox.status, "PENDING"));
    if (waiting) console.warn(`Correos: ${waiting} en cola sin proveedor configurado (RESEND_API_KEY).`);
    return { sent: 0, failed: 0, waiting };
  }
  const due = await db
    .select({ id: s.emailOutbox.id })
    .from(s.emailOutbox)
    .where(and(eq(s.emailOutbox.status, "PENDING"), lt(s.emailOutbox.tries, MAX_TRIES)))
    .orderBy(asc(s.emailOutbox.createdAt))
    .limit(limit);
  let sent = 0;
  let failed = 0;
  for (const { id } of due)
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(s.emailOutbox)
        .where(and(eq(s.emailOutbox.id, id), eq(s.emailOutbox.status, "PENDING")))
        .for("update", { skipLocked: true });
      if (!row) return; // otro proceso lo está enviando o ya salió
      const msg = row.orderId ? await renderEmail(tx, row.kind, row.orderId) : null;
      if (!msg) {
        await tx.update(s.emailOutbox).set({ status: "SKIPPED", lastError: "El pedido cambió: el aviso ya no corresponde." }).where(eq(s.emailOutbox.id, id));
        return;
      }
      try {
        await deliver({ id: row.id, to: row.to, ...msg });
        await tx.update(s.emailOutbox).set({ status: "SENT", sentAt: new Date(), tries: row.tries + 1, lastError: null }).where(eq(s.emailOutbox.id, id));
        sent++;
      } catch (e) {
        const tries = row.tries + 1;
        const lastError = e instanceof Error ? e.message.slice(0, 300) : "Error al enviar.";
        await tx.update(s.emailOutbox).set({ tries, lastError, status: tries >= MAX_TRIES ? "FAILED" : "PENDING" }).where(eq(s.emailOutbox.id, id));
        failed++;
      }
    });
  return { sent, failed, waiting: 0 };
}

export function orderEmails(orderId: string) {
  return db.select().from(s.emailOutbox).where(eq(s.emailOutbox.orderId, orderId)).orderBy(asc(s.emailOutbox.createdAt));
}
