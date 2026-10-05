import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listAllBrands } from "@/modules/brands/admin";

export const metadata: Metadata = { title: "Marcas" };

export default async function BrandsPage() {
  await requireStaffPage("catalog:write");
  const rows = await listAllBrands();
  return (
    <>
      <PageHeader title="Marcas">
        <ButtonLink href="/admin/marcas/nueva">Nueva marca</ButtonLink>
      </PageHeader>
      <Table head={["Nombre", "Dirección", "Productos", "Estado"]} empty="Aún no hay marcas.">
        {rows.map(({ brand: b, products }) => (
          <tr key={b.id}>
            <td>
              <Link href={`/admin/marcas/${b.id}`} className="font-semibold hover:text-leaf hover:underline">
                {b.name}
              </Link>
            </td>
            <td className="font-mono text-xs text-muted">/marca/{b.slug}</td>
            <td>
              {products > 0 ? (
                <Link href={`/admin/productos?marca=${b.id}`} className="hover:underline">
                  {products}
                </Link>
              ) : (
                0
              )}
            </td>
            <td>{b.active ? <Badge tone="ok">Activa</Badge> : <Badge tone="off">Inactiva</Badge>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
