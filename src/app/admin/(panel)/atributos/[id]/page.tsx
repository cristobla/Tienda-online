import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminForm, Check, DangerButton, Select, Submit, Text, TextArea } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { loadAttributeDefinitions } from "@/modules/catalog/queries";
import { deleteAttributeAction, saveAttributeAction } from "../actions";
import { SCOPE_LABEL, TYPE_LABEL } from "../labels";

export const metadata: Metadata = { title: "Atributo" };

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

/** /admin/atributos/nuevo crea; con un id, edita. */
export default async function AttributePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("catalog:write");
  const { id } = await params;
  const d = id === "nuevo" ? null : (await loadAttributeDefinitions()).find((x) => x.id === id);
  if (d === undefined) notFound();

  return (
    <>
      <PageHeader title={d ? d.label : "Nuevo atributo"} back={{ href: "/admin/atributos", label: "Atributos" }} />
      <div className="grid max-w-2xl gap-6">
        <Section title="Definición">
          <AdminForm action={saveAttributeAction.bind(null, d?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Text name="label" label="Nombre visible" initial={d?.label} required maxLength={60} hint="Ej.: Tipo de piel" />
              {d ? (
                <div>
                  <p className="mb-1 text-sm font-semibold">Código</p>
                  <p className="py-2 font-mono text-sm">{d.code}</p>
                  <p className="text-xs text-muted">No se puede cambiar: los productos guardan sus valores con este código.</p>
                </div>
              ) : (
                <Text name="code" label="Código" required maxLength={40} pattern="[a-z][a-z0-9_]+" hint="Minúsculas y _ (ej.: tipo_piel). No se puede cambiar después." />
              )}
              <Select name="type" label="Tipo" initial={d?.type ?? "TEXT"} options={opts(TYPE_LABEL)} />
              <Select name="scope" label="Se completa en" initial={d?.scope ?? "PRODUCT"} options={opts(SCOPE_LABEL)} hint="«Cada variante» si cambia por formato (talla, metros por rollo)." />
              <Text name="unit" label="Unidad" initial={d?.unit} maxLength={10} hint="Opcional, para números (ej.: m)." />
              <Text name="sortOrder" label="Orden" type="number" min={0} initial={d?.sortOrder ?? 0} required />
            </div>
            <TextArea name="options" label="Opciones (una por línea)" initial={d?.options?.join("\n")} rows={4} hint="Solo para el tipo «Lista de opciones»." />
            <Check name="filterable" label="Usar como filtro en el catálogo" initial={d?.filterable} />
            <Submit>{d ? "Guardar" : "Crear atributo"}</Submit>
          </AdminForm>
        </Section>
        {d && (
          <Section title="Eliminar">
            <p className="mb-3 text-sm text-muted">Los valores ya cargados en productos dejan de mostrarse y de usarse como filtro.</p>
            <DangerButton action={deleteAttributeAction.bind(null, d.id)} confirm={`¿Eliminar el atributo «${d.label}»?`}>
              Eliminar atributo
            </DangerButton>
          </Section>
        )}
      </div>
    </>
  );
}
