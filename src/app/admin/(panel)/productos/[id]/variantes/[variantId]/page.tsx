import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AttributeFields, VariantFields } from "@/components/admin/catalog-fields";
import { AdminForm, DangerButton, Submit } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { getAdminProduct } from "@/modules/catalog/admin";
import { loadAttributeDefinitions } from "@/modules/catalog/queries";
import { createVariantAction, deleteVariantAction, setDefaultVariantAction, updateVariantAction } from "../../../actions";

export const metadata: Metadata = { title: "Variante" };

/** /admin/productos/[id]/variantes/nueva crea; con un id, edita. */
export default async function VariantPage({ params }: { params: Promise<{ id: string; variantId: string }> }) {
  await requireStaffPage("catalog:write");
  const { id, variantId } = await params;
  const data = z.uuid().safeParse(id).success ? await getAdminProduct(id) : null;
  if (!data) notFound();
  const isNew = variantId === "nueva";
  const variant = isNew ? undefined : data.variants.find((v) => v.id === variantId);
  if (!isNew && !variant) notFound();
  const defs = await loadAttributeDefinitions();
  const back = { href: `/admin/productos/${id}#variantes`, label: data.product.name };

  return (
    <>
      <PageHeader title={variant ? variant.name : "Nueva variante"} back={back} />
      <div className="grid max-w-4xl gap-6">
        <Section title={variant ? `SKU ${variant.sku}` : "Datos de la variante"}>
          <AdminForm action={variant ? updateVariantAction.bind(null, variant.id) : createVariantAction.bind(null, id)}>
            <VariantFields variant={variant} withInitialStock={isNew} />
            <AttributeFields defs={defs} scope="VARIANT" values={variant?.attributes} prefix="v." />
            <Submit>{variant ? "Guardar" : "Crear variante"}</Submit>
          </AdminForm>
        </Section>

        {variant && (
          <Section title="Más acciones">
            <div className="flex flex-wrap items-start gap-6">
              {variant.isDefault ? (
                <p className="text-sm text-muted">Es la variante principal del producto.</p>
              ) : (
                <AdminForm action={setDefaultVariantAction.bind(null, variant.id)} className="space-y-2">
                  <Submit variant="plain">Marcar como principal</Submit>
                </AdminForm>
              )}
              {!variant.isDefault && (
                <DangerButton action={deleteVariantAction.bind(null, id, variant.id)} confirm={`¿Eliminar la variante «${variant.name}»?`}>
                  Eliminar variante
                </DangerButton>
              )}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
