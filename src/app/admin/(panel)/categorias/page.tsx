import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listCategoryTree } from "@/modules/categories/admin";

export const metadata: Metadata = { title: "Categorías" };

export default async function CategoriesPage() {
  await requireStaffPage("catalog:write");
  const tree = await listCategoryTree();
  return (
    <>
      <PageHeader title="Categorías">
        <ButtonLink href="/admin/categorias/nueva">Nueva categoría</ButtonLink>
      </PageHeader>
      <Table head={["Nombre", "Dirección", "Productos", "Orden", "Estado"]} empty="Aún no hay categorías.">
        {tree.map((c) => (
          <tr key={c.id}>
            <td style={{ paddingLeft: `${0.75 + c.depth * 1.5}rem` }}>
              {c.depth > 0 && <span aria-hidden className="mr-1 text-muted">└</span>}
              <Link href={`/admin/categorias/${c.id}`} className={`hover:text-leaf hover:underline ${c.depth === 0 ? "font-bold" : "font-medium"}`}>
                {c.name}
              </Link>
            </td>
            <td className="font-mono text-xs text-muted">/categoria/{c.slug}</td>
            <td>
              {c.products > 0 ? (
                <Link href={`/admin/productos?categoria=${c.id}`} className="hover:underline">
                  {c.products}
                </Link>
              ) : (
                0
              )}
            </td>
            <td>{c.sortOrder}</td>
            <td>{c.active ? <Badge tone="ok">Activa</Badge> : <Badge tone="off">Inactiva</Badge>}</td>
          </tr>
        ))}
      </Table>
      <p className="mt-3 text-sm text-muted">Una categoría inactiva oculta también todas sus subcategorías y sus productos en la tienda.</p>
    </>
  );
}
