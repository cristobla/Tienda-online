import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { getOrder, ORDER_STATUS_LABELS } from "@/modules/orders";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false, follow: false } };

/**
 * Comprobante del pedido para el cliente.
 * ponytail: se accede por enlace secreto (el id es un UUID v4, no adivinable); cuando existan cuentas de cliente,
 * exigir además la sesión del dueño para pedidos asociados a una cuenta.
 */
export default async function CustomerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getOrder(id) : null;
  if (!data) notFound();
  const { order: o, items, reservations } = data;
  const active = reservations.filter((r) => r.status === "ACTIVE");
  const until = active.length ? new Date(Math.min(...active.map((r) => r.expiresAt.getTime()))) : null;
  const pending = o.status === "PENDING_PAYMENT";
  const a = o.shippingAddress;

  return (
    <div className="mx-auto max-w-3xl">
      <div className={`rounded-md border p-6 text-center ${o.status === "CANCELLED" ? "border-line bg-paper" : "border-leaf/30 bg-leaf-soft"}`}>
        <span className={`mx-auto grid size-14 place-items-center rounded-full bg-white ${o.status === "CANCELLED" ? "text-muted" : "text-leaf"}`}>
          <Icon name={o.status === "CANCELLED" ? "alert" : "check"} className="size-7" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">{o.status === "CANCELLED" ? "Este pedido fue cancelado" : "¡Recibimos tu pedido!"}</h1>
        <p className="mt-2">
          Pedido <strong className="font-mono">{o.orderNumber}</strong> · {ORDER_STATUS_LABELS[o.status]}
        </p>
        {pending && until && (
          <p className="mx-auto mt-3 max-w-md text-sm text-muted">
            Reservamos tus productos hasta el {formatDateTime(until)}; si el pago no se completa a tiempo, el pedido se cancela automáticamente.
          </p>
        )}
        <p className="mt-3 text-sm text-muted">Guarda este enlace para revisar el estado de tu pedido.</p>
      </div>

      <section aria-labelledby="detalle" className="mt-8">
        <h2 id="detalle" className="mb-3 text-lg font-bold">
          Detalle
        </h2>
        <ul className="divide-y divide-line rounded-md border border-line bg-white text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4 px-4 py-3">
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
          <div className="flex justify-between">
            <dt className="text-muted">Despacho</dt>
            <dd>{o.shippingTotal ? formatCLP(o.shippingTotal) : "Gratis"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-base">
            <dt className="font-bold">Total</dt>
            <dd className="font-extrabold">{formatCLP(o.total)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-right text-xs text-muted">IVA incluido</p>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-md border border-line bg-white p-5 text-sm">
          <h2 className="mb-2 font-bold">Despacho</h2>
          {a ? (
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
        <section className="rounded-md border border-line bg-white p-5 text-sm">
          <h2 className="mb-2 font-bold">Contacto</h2>
          <p className="break-all">{o.email}</p>
          {o.phone && <p>{o.phone}</p>}
        </section>
      </div>

      <p className="mt-8 text-center">
        <Link href="/productos" className="font-semibold text-leaf hover:underline">
          Seguir comprando
        </Link>
      </p>
    </div>
  );
}
