import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Submit } from "@/components/admin/form";
import { Icon } from "@/components/icons";
import { TrackPurchase } from "@/components/store/analytics";
import { AutoRefresh } from "@/components/store/auto-refresh";
import type { PaymentAction } from "@/db/schema";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { mapsLink, storeAddressLine } from "@/lib/site";
import { getOrder, isSold, statusLabel } from "@/modules/orders";
import { beginAttempt, checkoutMethods, customerPayments, getProvider } from "@/modules/payments";
import { getSettings } from "@/modules/settings";
import { startPaymentAction } from "./actions";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false, follow: false } };

/**
 * Pedido y pago para el cliente. Se accede por enlace secreto (el id es un UUID v4, no adivinable): es lo único que
 * autoriza ver el pedido o iniciar su pago; el número de pedido no basta. "Pago confirmado" solo aparece cuando el
 * servidor lo verificó (nunca por un parámetro de la URL ni porque el cliente diga que pagó).
 * ponytail: cuando existan cuentas de cliente, exigir además la sesión del dueño para pedidos asociados a una cuenta.
 */
export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getOrder(id) : null;
  if (!data) notFound();
  const { order: o, items, reservations } = data;
  const active = reservations.filter((r) => r.status === "ACTIVE");
  const until = active.length ? new Date(Math.min(...active.map((r) => r.expiresAt.getTime()))) : null;
  const pending = o.status === "PENDING_PAYMENT";
  const live = pending && !!until && until.getTime() > Date.now();

  let payments = await customerPayments(o.id);
  // Un intento quedó sin acción (p. ej. el servidor se reinició justo después de crearlo): se completa ahora.
  const last = payments.at(-1);
  if (pending && last?.status === "PENDING" && !last.action) {
    await beginAttempt(last.id);
    payments = await customerPayments(o.id);
  }
  const current = payments.at(-1);
  // Con un resultado por verificar no se ofrece pagar de nuevo (podría cobrarse dos veces).
  const verifying = current?.status === "UNCERTAIN" || current?.status === "AUTHORIZED";
  const methods = live && !verifying ? await checkoutMethods() : [];
  const waiting = pending && (current?.status === "PENDING" || current?.status === "UNCERTAIN" || current?.status === "AUTHORIZED");
  const paid = isSold(o.status);
  const cancelled = o.status === "CANCELLED" || o.status === "REFUNDED";
  // Anulado o devuelto después de pagar: el dinero se devuelve aparte (REVIEW = pendiente, REFUNDED = hecho).
  const reversed = cancelled && !!o.paidAt;
  const a = o.shippingAddress;
  const pickup = o.fulfillment === "PICKUP";
  const settings = await getSettings();
  const st = pickup ? settings : null;

  return (
    <div className="mx-auto max-w-3xl">
      {paid && (
        <TrackPurchase
          orderNumber={o.orderNumber}
          value={o.total}
          items={items.map((i) => ({ sku: i.sku, name: i.productName, price: i.unitPrice, quantity: i.quantity }))}
        />
      )}
      <div className={`relative overflow-hidden rounded-[1.75rem] px-6 py-10 text-center ${cancelled ? "bg-paper ring-1 ring-line" : "bg-leaf-soft"}`}>
        {!cancelled && <div aria-hidden className="ondas absolute inset-0 [--ondas-x:50%] [--ondas-y:22%]" />}
        <span className={`relative mx-auto grid size-16 animate-pop place-items-center rounded-full bg-white ring-1 ring-line ${cancelled ? "text-muted" : "text-leaf"}`}>
          <Icon name={cancelled ? "alert" : "check"} className="size-8" />
        </span>
        <h1 className="rotulo relative mt-5 text-display">
          {o.status === "REFUNDED" ? "Este pedido fue devuelto" : cancelled ? "Este pedido fue cancelado" : paid ? "¡Pago confirmado!" : "¡Recibimos tu pedido!"}
        </h1>
        <p className="relative mt-3">
          Pedido <strong className="font-mono">{o.orderNumber}</strong> · {statusLabel(o.status, o.fulfillment)}
        </p>
        {paid && o.paidAt && (
          <p className="relative mt-2 text-sm text-muted">
            Pago verificado el {formatDateTime(o.paidAt)}
            {o.paymentMethod && <> · {getProvider(o.paymentMethod)?.label ?? o.paymentMethod}</>}. {pickup ? "Te avisaremos cuando esté listo para retirar." : "Te avisaremos cuando despachemos tu pedido."}
          </p>
        )}
        {reversed && (
          <p className="relative mx-auto mt-3 max-w-md text-sm font-medium">
            {o.paymentStatus === "REFUNDED" ? "Ya te devolvimos el dinero de este pedido." : "Te devolveremos el dinero que pagaste y te contactaremos para coordinarlo."}
          </p>
        )}
        {o.paymentStatus === "REVIEW" && !reversed && (
          <p className="relative mx-auto mt-3 max-w-md text-sm font-medium text-oferta">
            Recibimos un pago que no pudimos aplicar automáticamente (monto distinto o fuera de plazo). Lo estamos revisando y te contactaremos.
          </p>
        )}
        {o.status === "DELIVERED" && settings.reviewUrl ? (
          <p className="relative mt-5">
            <a href={settings.reviewUrl} target="_blank" rel="noopener" className="btn-buy px-6 py-3">
              ¿Te gustó? Déjanos una reseña en Google
            </a>
          </p>
        ) : (
          <p className="relative mt-3 text-sm text-muted">Guarda este enlace para revisar el estado de tu pedido.</p>
        )}
      </div>

      {pending && o.paymentStatus !== "REVIEW" && (
        <section aria-labelledby="pago" className="mt-8 rounded-[1.5rem] bg-white p-6 ring-1 ring-line">
          <h2 id="pago" className="rotulo text-title">
            Pago
          </h2>
          {current?.status === "PENDING" && current.action && <PaymentActionView action={current.action} />}
          {current && (current.status === "UNCERTAIN" || current.status === "AUTHORIZED") && (
            <p className="mt-3 text-sm">
              Estamos verificando tu pago con {current.label}. <strong>No vuelvas a pagar</strong>: esta página se actualiza sola.
            </p>
          )}
          {current && ["FAILED", "CANCELLED", "EXPIRED"].includes(current.status) && (
            <p role="alert" className="mt-3 text-sm font-medium text-oferta">
              El pago con {current.label} no se completó.
            </p>
          )}
          {live && until && (
            <p className="mt-4 text-sm text-muted">
              Tienes hasta el <strong>{formatDateTime(until)}</strong> para pagar. Si no recibimos el pago a tiempo, el pedido se cancela y los productos vuelven a
              estar disponibles.
            </p>
          )}
          {!live && <p className="mt-3 text-sm text-muted">La reserva de este pedido venció; se cancelará en unos instantes.</p>}

          {methods.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold">{current?.status === "PENDING" ? "¿Prefieres otro medio de pago?" : "Elige cómo pagar"}</p>
              <div className="flex flex-wrap gap-3">
                {methods
                  .filter((m) => !(current?.status === "PENDING" && current.provider === m.id))
                  .map((m) => (
                    <AdminForm key={m.id} action={startPaymentAction.bind(null, o.id, m.id)} className="space-y-2">
                      <Submit variant="line" pendingText="Preparando…">
                        {m.label}
                      </Submit>
                    </AdminForm>
                  ))}
              </div>
            </div>
          )}
          {waiting && <AutoRefresh />}
        </section>
      )}

      <section aria-labelledby="detalle" className="mt-8">
        <h2 id="detalle" className="rotulo mb-4 text-title">
          Detalle
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] bg-white text-sm ring-1 ring-line">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 px-5 py-3.5">
              <span className="min-w-0">
                <span className="block font-medium">{i.productName}</span>
                <span className="text-muted">
                  {i.variantName} · {i.quantity} × {formatCLP(i.unitPrice)}
                </span>
              </span>
              <span className="whitespace-nowrap font-semibold">{formatCLP(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="ml-auto mt-3 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatCLP(o.subtotal)}</dd>
          </div>
          {o.discountTotal > 0 && (
            <div className="flex justify-between text-leaf-dark">
              <dt>Descuento{o.couponCode && ` (${o.couponCode})`}</dt>
              <dd>−{formatCLP(o.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-muted">{pickup ? "Retiro en el local" : "Despacho"}</dt>
            <dd>{o.shippingTotal ? formatCLP(o.shippingTotal) : "Gratis"}</dd>
          </div>
          <div className="flex items-end justify-between border-t border-dashed border-ink/25 pt-3 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="rotulo text-3xl leading-none">{formatCLP(o.total)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-right text-xs text-muted">IVA incluido. Este resumen no es una boleta ni un comprobante de pago.</p>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-[1.5rem] bg-paper p-6 text-sm ring-1 ring-line">
          <h2 className="etiqueta mb-3 text-leaf-dark">{pickup ? "Retiro en el local" : "Despacho"}</h2>
          {st ? (
            <p>
              {storeAddressLine(st) ?? st.name}
              {st.hours && <span className="block text-muted">{st.hours}</span>}
              {mapsLink(st) && (
                <a href={mapsLink(st)!} target="_blank" rel="noopener" className="mt-2 inline-block font-medium text-leaf-dark underline-offset-2 hover:underline">
                  Cómo llegar
                </a>
              )}
              <span className="mt-2 block text-muted">Trae tu número de pedido. Te avisamos por correo cuando esté listo.</span>
            </p>
          ) : a ? (
            <p>
              {a.recipientName}
              <br />
              {a.street} {a.number}
              {a.apartment && `, ${a.apartment}`}
              <br />
              {a.commune}, {a.region}
              {a.notes && <span className="mt-1 block text-muted">{a.notes}</span>}
            </p>
          ) : (
            <p className="text-muted">Sin dirección registrada.</p>
          )}
        </section>
        <section className="rounded-[1.5rem] bg-paper p-6 text-sm ring-1 ring-line">
          <h2 className="etiqueta mb-3 text-leaf-dark">Contacto</h2>
          <p className="break-all">{o.email}</p>
          {o.phone && <p>{o.phone}</p>}
        </section>
      </div>

      <p className="mt-10 text-center">
        <Link href="/productos" className="btn-line px-6 py-3">
          Seguir comprando
        </Link>
      </p>
    </div>
  );
}

/** La acción que el proveedor entregó al emitir el intento: instrucciones, ir a la pasarela (GET o POST) o esperar. */
function PaymentActionView({ action }: { action: PaymentAction }) {
  if (action.kind === "wait") return <p className="mt-3 text-sm">{action.message}</p>;
  // GET: un enlace (con sus campos en la URL), no un formulario: la CSP solo permite enviar formularios a la tienda.
  if (action.kind === "redirect" && action.method === "GET") {
    const url = new URL(action.url);
    for (const [k, v] of Object.entries(action.fields)) url.searchParams.set(k, v);
    return (
      <p className="mt-4">
        <a href={url.toString()} className="btn-buy px-7 py-3 text-lg">
          Ir a pagar
        </a>
      </p>
    );
  }
  if (action.kind === "redirect")
    return (
      <form action={action.url} method={action.method} className="mt-4">
        {Object.entries(action.fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button className="btn-buy px-7 py-3 text-lg">Ir a pagar</button>
      </form>
    );
  return (
    <div className="mt-3">
      {action.example && (
        <p role="alert" className="mb-4 rounded-2xl border border-oferta/40 bg-oferta/5 px-4 py-2.5 text-sm font-semibold text-oferta">
          DATOS DE EJEMPLO (entorno de pruebas): no transfieras a esta cuenta.
        </p>
      )}
      <h3 className="font-semibold">{action.title}</h3>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {action.lines.map((l) => (
          <div key={l.label} className="contents">
            <dt className="text-muted">{l.label}</dt>
            <dd className="break-all font-medium">{l.value}</dd>
          </div>
        ))}
      </dl>
      {action.note && <p className="mt-3 text-sm text-muted">{action.note}</p>}
    </div>
  );
}
