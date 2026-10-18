import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { productsWithoutPhotos } from "@/modules/catalog/photos";
import { BulkUpload } from "./bulk-upload";

export const metadata: Metadata = { title: "Subir fotos por SKU" };

export default async function BulkPhotosPage() {
  await requireStaffPage("catalog:write");
  const missing = await productsWithoutPhotos();

  return (
    <>
      <PageHeader title="Subir fotos por SKU" back={{ href: "/admin/productos", label: "Productos" }} />
      <div className="grid max-w-5xl gap-6">
        <Section title="Cómo nombrar los archivos">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              El nombre del archivo es el <strong>SKU</strong> o el <strong>código de barras</strong>: <code className="font-mono">7801234567890.jpg</code> o{" "}
              <code className="font-mono">DET-500.jpg</code> (mayúsculas y minúsculas da igual).
            </li>
            <li>
              Más fotos del mismo producto: <code className="font-mono">DET-500-2.jpg</code>, <code className="font-mono">DET-500-3.jpg</code> (también{" "}
              <code className="font-mono">_2</code> o <code className="font-mono">(2)</code>). La que no lleva número queda como principal.
            </li>
            <li>Si el producto tiene varios formatos, la foto queda en el formato de ese SKU.</li>
            <li>
              JPG, PNG, WebP o AVIF, hasta 15 MB. Las grandes se reducen a 2000 px y se les quitan los datos del celular (como la ubicación). Ideal: cuadradas,
              fondo blanco, 1200 px o más.
            </li>
            <li>Puedes repetir la carga: con «Solo si aún no tiene fotos» no se duplica nada.</li>
          </ul>
        </Section>

        <Section title="Subir">
          <BulkUpload />
          <noscript>
            <p className="text-sm text-oferta">Esta carga necesita JavaScript. Sin él, sube las fotos desde la ficha de cada producto.</p>
          </noscript>
        </Section>

        <Section title={`Productos sin foto (${missing.total})`}>
          {missing.total === 0 ? (
            <p className="text-sm text-muted">Todos los productos tienen al menos una foto.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Google Shopping y el catálogo de Instagram/Facebook solo muestran productos con foto.</p>
              <Table head={["SKU", "Producto", "Estado"]}>
                {missing.items.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap font-mono text-xs">{p.sku ?? "—"}</td>
                    <td>
                      <Link href={`/admin/productos/${p.id}`} className="text-leaf hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.active ? <Badge tone="warn">Publicado sin foto</Badge> : <Badge tone="off">Borrador</Badge>}</td>
                  </tr>
                ))}
              </Table>
              {missing.total > missing.items.length && <p className="mt-2 text-xs text-muted">Se muestran los primeros {missing.items.length}.</p>}
            </>
          )}
        </Section>
      </div>
    </>
  );
}
