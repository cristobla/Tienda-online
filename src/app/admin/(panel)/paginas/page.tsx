import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatDateTime } from "@/modules/chile";
import { listInfoPages } from "@/modules/settings";

export const metadata: Metadata = { title: "Páginas informativas" };

export default async function InfoPagesPage() {
  await requireStaffPage("settings:manage");
  const pages = await listInfoPages();

  return (
    <>
      <PageHeader title="Páginas informativas">
        <ButtonLink href="/admin/tienda" variant="plain">
          Datos de la tienda
        </ButtonLink>
      </PageHeader>
      <p className="-mt-2 mb-6 max-w-2xl text-sm text-muted">
        Son las páginas enlazadas en el pie de la tienda. Mientras una no tenga texto, la tienda muestra «Contenido pendiente» y no la ofrece a los buscadores.
      </p>
      <Table head={["Página", "Estado", "Última edición", ""]}>
        {pages.map((p) => (
          <tr key={p.slug}>
            <td className="min-w-48">
              <Link href={`/admin/paginas/${p.slug}`} className="font-semibold hover:text-leaf hover:underline">
                {p.title}
              </Link>
            </td>
            <td>
              <Badge tone={p.filled ? "ok" : "warn"}>{p.filled ? "Publicada" : "Pendiente"}</Badge>
            </td>
            <td className="whitespace-nowrap text-muted">{p.updatedAt ? formatDateTime(p.updatedAt) : "—"}</td>
            <td className="whitespace-nowrap text-right">
              <Link href={`/info/${p.slug}`} target="_blank" className="text-leaf hover:underline">
                Ver en la tienda
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
