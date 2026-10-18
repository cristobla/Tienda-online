import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Check, Submit, TextArea } from "@/components/admin/form";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { getOrder, manualTransitions, PAYMENT_STATUS_LABELS, isSold, statusLabel } from "@/modules/orders";
import { EMAIL_LABELS, orderEmails } from "@/modules/mail";
import { getProvider, orderPayments } from "@/modules/payments";
import { changeStatusAction, reverseOrderAction } from "../actions";
import { ORDER_TONE, PAYMENT_TONE } from "../labels";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("orders:read");
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getOrder(id) : null;
  if (!data) notFound();
  const { order: o, items, history, reservations, hasAccount, returnedUnits } = data;
  const [payments, emails] = await Promise.all([orderPayments(o.id), orderEmails(o.id)]);
  const transitions = can(user.role, "orders:manage") ? manualTransitions(o) : [];
  const reversible = can(user.role, "payments:manage") && isSold(o.status);
  const shipped = o.status === "SHIPPED" || o.status === "DELIVERED";
  // Pagos que se reembolsan solos por la API del proveedor (los demás, p. ej. transferencias, se devuelven a mano).
  const autoRefund = payments.filter((p) => p.status === "PAID" && getProvider(p.provider)?.implemented && getProvider(p.provider)?.capabilities.refund);
  const active = reservations.filter((r) => r.status === "ACTIVE");
  const stock = active.length
    ? `Reservado hasta ${formatDateTime(new Date(Math.min(...active.map((r) => r.expiresAt.getTime()))))}` // la hora ya termina en "m."
    : returnedUnits > 0
      ? `Vendido y devuelto al stock al ${o.status === "REFUNDED" ? "registrar la devolución" : "anular el pedido"} (${returnedUnits} ${returnedUnits === 1 ? "unidad" : "unidades"}).`
      : reservations.some((r) => r.status === "CONSUMED")
        ? o.status === "REFUNDED"
          ? "Vendido; los productos devueltos no volvieron al stock."
          : "Descontado del stock al confirmarse el pago."
        : reservations.length
        ? "Reserva liberada: el stock volvió a estar disponible."
        : "Sin reservas.";
  const address = o.shippingAddress;
  const pickup = o.fulfillment === "PICKUP";
  const label = (st: typeof o.status) => statusLabel(st, o.fulfillment);

  return (
    <>
      <PageHeader title={`Pedido ${o.orderNumber}`} back={{ href: "/admin/pedidos", label: "Pedidos" }} />
      <p className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        Creado el {formatDateTime(o.createdAt)}
        <Badge tone={ORDER_TONE[o.status]}>{label(o.status)}</Badge>
        {pickup && <Badge tone="off">Retiro en el local</Badge>}
        <Badge tone={PAYMENT_TONE[o.paymentStatus]}>Pago: {PAYMENT_STATUS_LABELS[o.paymentStatus]}</Badge>
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="grid min-w-0 gap-6">
          <section>
            <h2 className="mb-3 text-lg font-bold">Productos</h2>
            <Table head={["Producto", "SKU", "Precio", "Cantidad", "Total"]}>
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="min-w-48">
                    <span className="font-semibold">{i.productName}</span>
                    <span className="block text-xs text-muted">{i.variantName}</span>
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{i.sku}</td>
                  <td className="whitespace-nowrap">{formatCLP(i.unitPrice)}</td>
                  <td>{i.quantity}</td>
                  <td className="whitespace-nowrap font-semibold">{formatCLP(i.lineTotal)}</td>
                </tr>
              ))}
            </Table>
            <dl className="ml-auto mt-3 max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>{formatCLP(o.subtotal)}</dd>
              </div>
              {o.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted">Descuento{o.couponCode && ` (cupón ${o.couponCode})`}</dt>
                  <dd>−{formatCLP(o.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">{pickup ? "Retiro en el local" : "Despacho"}</dt>
                <dd>{formatCLP(o.shippingTotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base">
                <dt className="font-bold">Total</dt>
                <dd className="font-extrabold">{formatCLP(o.total)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-right text-xs text-muted">IVA incluido. Nombres y precios copiados al momento del pedido.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold">Historial</h2>
            <ol className="divide-y divide-line rounded-md border border-line bg-white text-sm">
              {history.map(({ entry: h, email }) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3">
                  <span>
                    {h.fromStatus ? `${label(h.fromStatus)} → ` : "Creado: "}
                    <span className="font-semibold">{label(h.toStatus)}</span>
                    {h.note && <span className="block text-muted">{h.note}</span>}
                  </span>
                  <span className="text-muted">
                    {formatDateTime(h.createdAt)} · {email ?? (h.fromStatus ? "Sistema" : "Cliente")}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid gap-6">
          <Section
            title="Cliente"
            actions={
              can(user.role, "customers:read") && (
                <Link href={`/admin/clientes/${o.customerId}`} className="text-sm font-medium text-leaf hover:underline">
                  Ver ficha
                </Link>
              )
            }
          >
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Nombre</dt>
                <dd className="font-medium">{o.customerName}</dd>
              </div>
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="break-all">{o.email}</dd>
              </div>
              {o.phone && (
                <div>
                  <dt className="text-muted">Teléfono</dt>
                  <dd>{o.phone}</dd>
                </div>
              )}
              {o.rut && (
                <div>
                  <dt className="text-muted">RUT</dt>
                  <dd>{o.rut}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted">Entrega</dt>
                <dd>
                  {pickup
                    ? "Retira en el local (sin despacho)."
                    : address
                    ? `${address.street} ${address.number}${address.apartment ? `, ${address.apartment}` : ""}, ${address.commune}, ${address.region}`
                    : "Sin dirección registrada."}
                  {address?.notes && <span className="mt-1 block text-muted">{address.notes}</span>}
                </dd>
              </div>
              <p className="pt-1 text-xs text-muted">{hasAccount ? "Cliente con cuenta." : "Compra como invitado."}</p>
            </dl>
          </Section>

          <Section title="Pagos">
            {payments.length ? (
              <ul className="space-y-2 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/admin/pagos/${p.id}`} className="font-mono text-leaf hover:underline">
                      {p.reference}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-muted">{getProvider(p.provider)?.label ?? p.provider}</span>
                      <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_STATUS_LABELS[p.status]}</Badge>
                    </span>
                    {p.incident && <span className="w-full text-xs text-oferta">{p.incident}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin intentos de pago.</p>
            )}
          </Section>

          <Section title="Correos">
            {emails.length ? (
              <ul className="space-y-2 text-sm">
                {emails.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{EMAIL_LABELS[m.kind] ?? m.kind}</span>
                    <Badge tone={m.status === "SENT" ? "ok" : m.status === "PENDING" ? "warn" : m.status === "FAILED" ? "bad" : "off"}>
                      {m.status === "SENT" && m.sentAt ? `Enviado ${formatDateTime(m.sentAt)}` : { PENDING: "En cola", FAILED: "Falló", SKIPPED: "No enviado", SENT: "Enviado" }[m.status]}
                    </Badge>
                    {m.lastError && m.status !== "SENT" && <span className="w-full text-xs text-muted">{m.lastError}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin correos.</p>
            )}
          </Section>

          <Section title="Stock">
            <p className="text-sm">{stock}</p>
          </Section>

          {transitions.length > 0 && (
            <Section title="Cambiar estado">
              <div className="space-y-6">
                {transitions.map((to) =>
                  to === "CANCELLED" ? (
                    <AdminForm key={to} action={changeStatusAction.bind(null, o.id, to)} className="space-y-3">
                      <TextArea name="note" label="Motivo de la cancelación" rows={2} maxLength={500} required hint="Se libera el stock reservado. Queda en el historial." />
                      <Submit variant="danger">Cancelar pedido</Submit>
                    </AdminForm>
                  ) : (
                    <AdminForm key={to} action={changeStatusAction.bind(null, o.id, to)} className="space-y-3">
                      <TextArea name="note" label="Nota (opcional)" rows={2} maxLength={500} />
                      <Submit>Marcar como {label(to).toLowerCase()}</Submit>
                    </AdminForm>
                  ),
                )}
              </div>
            </Section>
          )}
          {reversible && (
            <Section title={shipped ? "Registrar devolución" : "Anular pedido pagado"}>
              <AdminForm
                action={reverseOrderAction.bind(null, o.id)}
                confirm={
                  shipped
                    ? `¿Registrar la devolución del pedido ${o.orderNumber}${autoRefund.length ? " y reembolsar el pago" : ""}? No se puede deshacer.`
                    : `¿Anular el pedido ${o.orderNumber}${autoRefund.length ? " y reembolsar el pago" : ""}? Los productos vuelven al stock. No se puede deshacer.`
                }
                className="space-y-3"
              >
                <p className="text-sm text-muted">
                  {shipped ? "El cliente devolvió los productos." : "Los productos no han salido: vuelven al stock disponible."}{" "}
                  {autoRefund.length
                    ? `El dinero se devuelve solo por ${getProvider(autoRefund[0]!.provider)!.label}, por el mismo medio con que pagó el cliente.`
                    : "El pago queda «En revisión» hasta que devuelvas el dinero (p. ej. por transferencia) y lo registres en el pago."}
                </p>
                <TextArea name="note" label="Motivo" rows={2} maxLength={500} required />
                {shipped && <Check name="restock" label="Volvieron en buen estado: reingresarlos al stock" hint="Si no, quedan fuera del inventario (por ejemplo, dañados)." />}
                <Submit variant="danger">{shipped ? "Registrar devolución" : "Anular pedido"}</Submit>
              </AdminForm>
            </Section>
          )}
          {o.status !== "CANCELLED" && o.status !== "REFUNDED" && (
            <p className="text-xs text-muted">
              El pago se registra en Pagos (transferencia comprobada en la cuenta o verificación del proveedor), nunca cambiando el estado a mano. La devolución del
              dinero de un pedido anulado o devuelto se registra en su pago, cuando se hace.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
