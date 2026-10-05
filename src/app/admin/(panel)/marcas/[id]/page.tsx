import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Check, DangerButton, Submit, Text, TextArea } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { getBrand } from "@/modules/brands/admin";
import { deleteBrandAction, saveBrandAction } from "../actions";

export const metadata: Metadata = { title: "Marca" };

/** /admin/marcas/nueva crea; con un id, edita. */
export default async function BrandPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("catalog:write");
  const { id } = await params;
  const isNew = id === "nueva";
  const b = isNew || !z.uuid().safeParse(id).success ? null : await getBrand(id);
  if (!isNew && !b) notFound();

  return (
    <>
      <PageHeader title={b ? b.name : "Nueva marca"} back={{ href: "/admin/marcas", label: "Marcas" }} />
      <div className="grid max-w-2xl gap-6">
        <Section title="Datos">
          <AdminForm action={saveBrandAction.bind(null, b?.id ?? null)}>
            <Text name="name" label="Nombre" initial={b?.name} required maxLength={80} />
            <Text name="slug" label="Dirección (slug)" initial={b?.slug} maxLength={80} hint={b ? "Cambiarlo rompe enlaces ya compartidos." : "Vacío = se genera desde el nombre."} />
            <TextArea name="description" label="Descripción" initial={b?.description} rows={3} maxLength={1000} />
            <Check name="active" label="Activa (tiene página y aparece en filtros)" initial={b?.active ?? true} />
            <Submit>{b ? "Guardar" : "Crear marca"}</Submit>
          </AdminForm>
        </Section>
        {b && (
          <Section title="Eliminar">
            <p className="mb-3 text-sm text-muted">Solo si no tiene productos.</p>
            <DangerButton action={deleteBrandAction.bind(null, b.id)} confirm={`¿Eliminar la marca «${b.name}»?`}>
              Eliminar marca
            </DangerButton>
          </Section>
        )}
      </div>
    </>
  );
}
