import type { Metadata } from "next";
import { AdminForm, Submit } from "@/components/admin/form";
import { AttributeFields, ProductFields, VariantFields } from "@/components/admin/catalog-fields";
import { ButtonLink, PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listAllBrands } from "@/modules/brands/admin";
import { loadAttributeDefinitions } from "@/modules/catalog/queries";
import { listCategoryTree } from "@/modules/categories/admin";
import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProductPage() {
  await requireStaffPage("catalog:write");
  const [categories, brands, defs] = await Promise.all([listCategoryTree(), listAllBrands(), loadAttributeDefinitions()]);

  if (!categories.length)
    return (
      <>
        <PageHeader title="Nuevo producto" back={{ href: "/admin/productos", label: "Productos" }} />
        <p className="mb-4">Primero crea al menos una categoría.</p>
        <ButtonLink href="/admin/categorias/nueva">Nueva categoría</ButtonLink>
      </>
    );

  return (
    <>
      <PageHeader title="Nuevo producto" back={{ href: "/admin/productos", label: "Productos" }} />
      <AdminForm action={createProductAction} className="max-w-4xl space-y-6">
        <Section title="Producto">
          <div className="space-y-5">
            <ProductFields categories={categories} brands={brands.map((b) => b.brand)} />
            <AttributeFields defs={defs} scope="PRODUCT" />
          </div>
        </Section>
        <Section title="Primera variante">
          <p className="-mt-2 mb-4 text-sm text-muted">
            Lo que se vende: precio, SKU y stock. Si el producto tiene un solo formato, esta es la única. Podrás agregar más formatos después.
          </p>
          <div className="space-y-5">
            <VariantFields withInitialStock />
            <AttributeFields defs={defs} scope="VARIANT" prefix="v." />
          </div>
        </Section>
        <Submit>Crear producto</Submit>
      </AdminForm>
    </>
  );
}
