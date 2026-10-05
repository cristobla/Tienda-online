import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Submit, TextArea } from "@/components/admin/form";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { getOrder, manualTransitions, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/modules/orders";
import { changeStatusAction } from "../actions";
import { ORDER_TONE, PAYMENT_TONE } from "../labels";

export const metadata: Metadata = { title: "Pedido" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("orders:read");
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getOrder(id) : null;
  if (!data) notFound();
  const { order: o, items, history, reservations, hasAccount } = data;
  const transitions = can(user.role, "orders:manage") ? manualTransitions(o) : [];
  const active = reservations.filter((r) => r.status === "ACTIVE");
  const stock = active.length
    ? `Reservado hasta ${formatDateTime(new Date(Math.min(...active.map((r) => r.expiresAt.getTime()))))}` // la hora ya termina en "m."
    : reservations.some((r) => r.status === "CONSUMED")
      ? "Descontado del stock al confirmarse el pago."
      : reservations.length
        ? "Reserva liberada: el stock volvió a estar disponible."
        : "Sin reservas.";
  const address = o.shippingAddress;

  return (
    <>
      <PageHeader title={`Pedido ${o.orderNumber}`} back={{ href: "/admin/pedidos", label: "Pedidos" }} />
      <p className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        Creado el {formatDateTime(o.createdAt)}
        <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
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
                  <dt className="text-muted">Descuento</dt>
                  <dd>−{formatCLP(o.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Despacho</dt>
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
                    {h.fromStatus ? `${ORDER_STATUS_LABELS[h.fromStatus]} → ` : "Creado: "}
                    <span className="font-semibold">{ORDER_STATUS_LABELS[h.toStatus]}</span>
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
          <Section title="Cliente">
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
                <dt className="text-muted">Despacho</dt>
                <dd>
                  {address
                    ? `${address.street} ${address.number}${address.apartment ? `, ${address.apartment}` : ""}, ${address.commune}, ${address.region}`
                    : "Sin dirección registrada."}
                  {address?.notes && <span className="mt-1 block text-muted">{address.notes}</span>}
                </dd>
              </div>
              <p className="pt-1 text-xs text-muted">{hasAccount ? "Cliente con cuenta." : "Compra como invitado."}</p>
            </dl>
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
                      <Submit>Marcar como {ORDER_STATUS_LABELS[to].toLowerCase()}</Submit>
                    </AdminForm>
                  ),
                )}
              </div>
            </Section>
          )}
          {o.status !== "CANCELLED" && o.status !== "REFUNDED" && (
            <p className="text-xs text-muted">Cobros, anulación de pedidos pagados y reembolsos se registran solo con la confirmación del proveedor de pagos.</p>
          )}
        </div>
      </div>
    </>
  );
}
