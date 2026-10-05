import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { loadAttributeDefinitions } from "@/modules/catalog/queries";
import { SCOPE_LABEL, TYPE_LABEL } from "./labels";

export const metadata: Metadata = { title: "Atributos" };

export default async function AttributesPage() {
  await requireStaffPage("catalog:write");
  const defs = await loadAttributeDefinitions();
  return (
    <>
      <PageHeader title="Atributos">
        <ButtonLink href="/admin/atributos/nuevo">Nuevo atributo</ButtonLink>
      </PageHeader>
      <p className="mb-4 max-w-2xl text-sm text-muted">
        Características que se completan en cada producto o variante (aroma, tipo de piel, talla, registro ISP…). Los marcados como filtro aparecen en el
        catálogo para acotar resultados.
      </p>
      <Table head={["Nombre", "Código", "Tipo", "Se completa en", "Filtro", "Orden"]} empty="Aún no hay atributos.">
        {defs.map((d) => (
          <tr key={d.id}>
            <td>
              <Link href={`/admin/atributos/${d.id}`} className="font-semibold hover:text-leaf hover:underline">
                {d.label}
              </Link>
              {d.unit && <span className="text-muted"> ({d.unit})</span>}
            </td>
            <td className="whitespace-nowrap font-mono text-xs">{d.code}</td>
            <td>
              {TYPE_LABEL[d.type]}
              {d.type === "SELECT" && <span className="block text-xs text-muted">{d.options?.join(" · ")}</span>}
            </td>
            <td>{SCOPE_LABEL[d.scope]}</td>
            <td>{d.filterable ? <Badge tone="ok">Sí</Badge> : <span className="text-muted">No</span>}</td>
            <td>{d.sortOrder}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
