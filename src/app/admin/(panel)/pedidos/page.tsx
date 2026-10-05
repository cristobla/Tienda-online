import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Badge, PageHeader, Pagination, Table } from "@/components/admin/ui";
import { hrefWith, type SP } from "@/components/store/catalog-view";
import { orderStatus } from "@/db/schema";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { listOrders, ORDER_STATUS_LABELS, ORDERS_PAGE_SIZE, PAYMENT_STATUS_LABELS } from "@/modules/orders";
import { ORDER_TONE, PAYMENT_TONE } from "./labels";

export const metadata: Metadata = { title: "Pedidos" };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const params = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional()).catch(undefined),
  estado: z.preprocess(one, z.enum(orderStatus.enumValues).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const select = "rounded-md border border-line bg-white px-3 py-2 text-sm";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage("orders:read");
  const sp = await searchParams;
  const p = params.parse(sp);
  const { items, total } = await listOrders({ q: p.q || undefined, status: p.estado, page: p.pagina });

  return (
    <>
      <PageHeader title="Pedidos" />

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={p.q} placeholder="Número de pedido, cliente o email" className={`${select} w-full`} />
        </label>
        <select name="estado" defaultValue={p.estado ?? ""} aria-label="Estado" className={select}>
          <option value="">Todos los estados</option>
          {orderStatus.enumValues.map((st) => (
            <option key={st} value={st}>
              {ORDER_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <p className="mb-2 text-sm text-muted">{total === 1 ? "1 pedido" : `${total} pedidos`}</p>
      <Table head={["Pedido", "Fecha", "Cliente", "Productos", "Total", "Estado", "Pago"]} empty="No hay pedidos con esos filtros.">
        {items.map((o) => (
          <tr key={o.id}>
            <td className="whitespace-nowrap">
              <Link href={`/admin/pedidos/${o.id}`} className="font-mono font-semibold hover:text-leaf hover:underline">
                {o.orderNumber}
              </Link>
            </td>
            <td className="whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</td>
            <td className="min-w-48">
              {o.customerName}
              <span className="block text-xs text-muted">{o.email}</span>
            </td>
            <td>{o.items}</td>
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
      <Pagination page={p.pagina} hasNext={p.pagina * ORDERS_PAGE_SIZE < total} href={(n) => hrefWith("/admin/pedidos", sp, { pagina: String(n) })} />
    </>
  );
}
