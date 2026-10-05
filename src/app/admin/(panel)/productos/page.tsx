import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { z } from "zod";
import { Badge, ButtonLink, PageHeader, Pagination, Table } from "@/components/admin/ui";
import { hrefWith, type SP } from "@/components/store/catalog-view";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { listAllBrands } from "@/modules/brands/admin";
import { ADMIN_PAGE_SIZE, listAdminProducts } from "@/modules/catalog/admin";
import { listCategoryTree } from "@/modules/categories/admin";
import { formatCLP } from "@/modules/chile";

export const metadata: Metadata = { title: "Productos" };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const params = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional()).catch(undefined),
  categoria: z.preprocess(one, z.uuid().optional()).catch(undefined),
  marca: z.preprocess(one, z.uuid().optional()).catch(undefined),
  estado: z.preprocess(one, z.enum(["activos", "inactivos"]).optional()).catch(undefined),
  stock: z.preprocess(one, z.enum(["agotado", "bajo"]).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const select = "rounded-md border border-line bg-white px-3 py-2 text-sm";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaffPage("catalog:read");
  const canWrite = can(user.role, "catalog:write");
  const sp = await searchParams;
  const p = params.parse(sp);
  const [{ items, total }, categories, brands] = await Promise.all([
    listAdminProducts({ q: p.q || undefined, categoryId: p.categoria, brandId: p.marca, status: p.estado, stock: p.stock, page: p.pagina }),
    listCategoryTree(),
    listAllBrands(),
  ]);

  return (
    <>
      <PageHeader title="Productos">{canWrite && <ButtonLink href="/admin/productos/nuevo">Nuevo producto</ButtonLink>}</PageHeader>

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={p.q} placeholder="Nombre, SKU o código de barras" className={`${select} w-full`} />
        </label>
        <select name="categoria" defaultValue={p.categoria ?? ""} aria-label="Categoría" className={select}>
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {"  ".repeat(c.depth) + c.name}
            </option>
          ))}
        </select>
        <select name="marca" defaultValue={p.marca ?? ""} aria-label="Marca" className={select}>
          <option value="">Todas las marcas</option>
          {brands.map(({ brand }) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={p.estado ?? ""} aria-label="Estado" className={select}>
          <option value="">Activos e inactivos</option>
          <option value="activos">Solo activos</option>
          <option value="inactivos">Solo inactivos</option>
        </select>
        <select name="stock" defaultValue={p.stock ?? ""} aria-label="Stock" className={select}>
          <option value="">Cualquier stock</option>
          <option value="agotado">Con variantes agotadas</option>
          <option value="bajo">Bajo stock mínimo</option>
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <p className="mb-2 text-sm text-muted">{total === 1 ? "1 producto" : `${total} productos`}</p>
      <Table head={["", "Producto", "Categoría", "Variantes", "Precio", "Disponible", "Estado"]} empty="No hay productos con esos filtros.">
        {items.map((r) => (
          <tr key={r.id}>
            <td className="w-12">
              <div className="relative size-10 overflow-hidden rounded-sm bg-mist">
                {r.imageUrl && <Image src={r.imageUrl} alt="" fill sizes="40px" className="object-contain" />}
              </div>
            </td>
            <td>
              {canWrite ? (
                <Link href={`/admin/productos/${r.id}`} className="font-semibold hover:text-leaf hover:underline">
                  {r.name}
                </Link>
              ) : (
                <span className="font-semibold">{r.name}</span>
              )}
              {r.brand && <span className="block text-xs text-muted">{r.brand}</span>}
            </td>
            <td className="text-muted">{r.category}</td>
            <td>{r.variants}</td>
            <td className="whitespace-nowrap">
              {r.minPrice == null ? "—" : r.minPrice === r.maxPrice ? formatCLP(r.minPrice) : `${formatCLP(r.minPrice)} – ${formatCLP(r.maxPrice!)}`}
            </td>
            <td className="whitespace-nowrap">
              {r.available}
              {r.outOfStock > 0 && (
                <>
                  {" "}
                  <Badge tone="bad">{r.outOfStock} agotada{r.outOfStock > 1 ? "s" : ""}</Badge>
                </>
              )}
              {r.low > 0 && (
                <>
                  {" "}
                  <Badge tone="warn">{r.low} bajo mínimo</Badge>
                </>
              )}
            </td>
            <td className="space-x-1 whitespace-nowrap">
              {r.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Inactivo</Badge>}
              {r.featured && <Badge tone="warn">Destacado</Badge>}
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={p.pagina} hasNext={p.pagina * ADMIN_PAGE_SIZE < total} href={(n) => hrefWith("/admin/productos", sp, { pagina: String(n) })} />
    </>
  );
}
