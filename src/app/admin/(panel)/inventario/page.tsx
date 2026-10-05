import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Badge, PageHeader, Pagination, Table } from "@/components/admin/ui";
import { hrefWith, type SP } from "@/components/store/catalog-view";
import { requireStaffPage } from "@/modules/auth/guard";
import { INVENTORY_PAGE_SIZE, listInventory } from "@/modules/inventory";

export const metadata: Metadata = { title: "Inventario" };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const params = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional()).catch(undefined),
  stock: z.preprocess(one, z.enum(["agotado", "bajo"]).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const select = "rounded-md border border-line bg-white px-3 py-2 text-sm";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage("inventory:read");
  const sp = await searchParams;
  const p = params.parse(sp);
  const { items, total } = await listInventory({ q: p.q || undefined, stock: p.stock, page: p.pagina });

  return (
    <>
      <PageHeader title="Inventario" />

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={p.q} placeholder="Producto, SKU o código de barras" className={`${select} w-full`} />
        </label>
        <select name="stock" defaultValue={p.stock ?? ""} aria-label="Stock" className={select}>
          <option value="">Cualquier stock</option>
          <option value="agotado">Agotadas</option>
          <option value="bajo">Bajo stock mínimo</option>
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <p className="mb-2 text-sm text-muted">{total === 1 ? "1 variante" : `${total} variantes`}</p>
      <Table head={["Producto", "SKU", "Bodega", "Reservado", "Disponible", "Mínimo", "Estado"]} empty="No hay variantes con esos filtros.">
        {items.map((v) => (
          <tr key={v.id}>
            <td>
              <Link href={`/admin/inventario/${v.id}`} className="font-semibold hover:text-leaf hover:underline">
                {v.product}
              </Link>
              <span className="block text-xs text-muted">{v.name}</span>
            </td>
            <td className="whitespace-nowrap font-mono text-xs">{v.sku}</td>
            <td>{v.onHand}</td>
            <td>{v.reserved}</td>
            <td>{v.available <= 0 ? <Badge tone="bad">0</Badge> : v.available <= v.minimum ? <Badge tone="warn">{v.available}</Badge> : v.available}</td>
            <td>{v.minimum}</td>
            <td>{v.active && v.productActive ? <Badge tone="ok">A la venta</Badge> : <Badge tone="off">Pausada</Badge>}</td>
          </tr>
        ))}
      </Table>
      <Pagination page={p.pagina} hasNext={p.pagina * INVENTORY_PAGE_SIZE < total} href={(n) => hrefWith("/admin/inventario", sp, { pagina: String(n) })} />
    </>
  );
}
