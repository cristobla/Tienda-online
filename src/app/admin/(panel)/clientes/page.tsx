import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeader, Pagination, Table } from "@/components/admin/ui";
import { hrefWith, type SP } from "@/components/store/catalog-view";
import { formatPhone } from "@/lib/site";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatCLP, formatDateTime, formatRut } from "@/modules/chile";
import { CUSTOMER_SORTS, CUSTOMERS_PAGE_SIZE, type CustomerSort, listCustomers } from "@/modules/customers";

export const metadata: Metadata = { title: "Clientes" };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const params = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional()).catch(undefined),
  orden: z.preprocess(one, z.enum(Object.keys(CUSTOMER_SORTS) as [CustomerSort, ...CustomerSort[]]).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const field = "rounded-md border border-line bg-white px-3 py-2 text-sm";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage("customers:read");
  const sp = await searchParams;
  const p = params.parse(sp);
  const { items, total } = await listCustomers({ q: p.q || undefined, sort: p.orden, page: p.pagina });

  return (
    <>
      <PageHeader title="Clientes" />
      <p className="-mt-2 mb-4 max-w-2xl text-sm text-muted">
        Se compra como invitado: cada cliente es un email, con todos sus pedidos. El gasto cuenta solo los pedidos pagados (sin anulados ni devueltos).
      </p>

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={p.q} placeholder="Nombre, email, teléfono o RUT" className={`${field} w-full`} />
        </label>
        <select name="orden" defaultValue={p.orden ?? "recientes"} aria-label="Ordenar" className={field}>
          {Object.entries(CUSTOMER_SORTS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Buscar</button>
      </form>

      <p className="mb-2 text-sm text-muted">{total === 1 ? "1 cliente" : `${total} clientes`}</p>
      <Table head={["Cliente", "Teléfono", "RUT", "Pedidos", "Gastado", "Último pedido"]} empty={p.q ? "No hay clientes que coincidan." : "Todavía no hay clientes."}>
        {items.map((c) => (
          <tr key={c.email}>
            <td className="min-w-56">
              <Link href={`/admin/clientes/${c.customerId}`} className="font-semibold hover:text-leaf hover:underline">
                {c.name}
              </Link>
              <span className="block break-all text-xs text-muted">{c.email}</span>
            </td>
            <td className="whitespace-nowrap">{c.phone ? formatPhone(c.phone) : "—"}</td>
            <td className="whitespace-nowrap">{c.rut ? formatRut(c.rut) : "—"}</td>
            <td className="whitespace-nowrap">
              {c.paidOrders} <span className="text-muted">de {c.orders}</span>
            </td>
            <td className="whitespace-nowrap font-semibold">{formatCLP(c.spent)}</td>
            <td className="whitespace-nowrap text-muted">{formatDateTime(c.lastOrder)}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={p.pagina} hasNext={p.pagina * CUSTOMERS_PAGE_SIZE < total} href={(n) => hrefWith("/admin/clientes", sp, { pagina: String(n) })} />
    </>
  );
}
