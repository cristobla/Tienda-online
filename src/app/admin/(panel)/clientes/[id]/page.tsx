import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge, PageHeader, Section, StatCard, Table } from "@/components/admin/ui";
import { formatPhone, whatsappUrl } from "@/lib/site";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatCLP, formatDateTime, formatRut } from "@/modules/chile";
import { getCustomer } from "@/modules/customers";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/modules/orders";
import { ORDER_TONE, PAYMENT_TONE } from "../../pedidos/labels";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("customers:read");
  const { id } = await params;
  const c = z.uuid().safeParse(id).success ? await getCustomer(id) : null;
  if (!c) notFound();

  return (
    <>
      <PageHeader title={c.name} back={{ href: "/admin/clientes", label: "Clientes" }} />
      <p className="-mt-4 mb-6 text-sm text-muted">Cliente desde el {formatDateTime(c.stats.first)}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pedidos" value={c.stats.orders} icon="cart" />
        <StatCard label="Pagados" value={c.stats.paid} icon="check" />
        <StatCard label="Total gastado" value={formatCLP(c.stats.spent)} icon="trend" />
        <StatCard label="Ticket promedio" value={formatCLP(c.stats.average)} icon="tag" />
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-bold">Pedidos</h2>
          <Table head={["Pedido", "Fecha", "Total", "Estado", "Pago"]}>
            {c.orders.map((o) => (
              <tr key={o.id}>
                <td className="whitespace-nowrap">
                  <Link href={`/admin/pedidos/${o.id}`} className="font-mono font-semibold hover:text-leaf hover:underline">
                    {o.orderNumber}
                  </Link>
                </td>
                <td className="whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</td>
                <td className="whitespace-nowrap font-semibold">{formatCLP(o.total)}</td>
                <td>
                  <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                </td>
                <td>
                  <Badge tone={PAYMENT_TONE[o.paymentStatus]}>{PAYMENT_STATUS_LABELS[o.paymentStatus]}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </section>

        <div className="grid gap-6">
          <Section title="Contacto">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="break-all">
                  <a href={`mailto:${c.email}`} className="text-leaf hover:underline">
                    {c.email}
                  </a>
                </dd>
              </div>
              {c.phones.length > 0 && (
                <div>
                  <dt className="text-muted">Teléfono</dt>
                  {c.phones.map((p) => (
                    <dd key={p} className="flex flex-wrap gap-x-3">
                      <a href={`tel:${p}`} className="hover:underline">
                        {formatPhone(p)}
                      </a>
                      {p.startsWith("+569") && (
                        <a href={whatsappUrl(p)} target="_blank" rel="noopener" className="text-leaf hover:underline">
                          WhatsApp
                        </a>
                      )}
                    </dd>
                  ))}
                </div>
              )}
              {c.ruts.length > 0 && (
                <div>
                  <dt className="text-muted">RUT</dt>
                  {c.ruts.map((r) => (
                    <dd key={r}>{formatRut(r)}</dd>
                  ))}
                </div>
              )}
              {c.names.length > 1 && (
                <div>
                  <dt className="text-muted">También compró como</dt>
                  {c.names.slice(1).map((n) => (
                    <dd key={n}>{n}</dd>
                  ))}
                </div>
              )}
            </dl>
          </Section>
          <Section title="Direcciones de despacho">
            {c.addresses.length ? (
              <ul className="space-y-2 text-sm">
                {c.addresses.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin direcciones.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
