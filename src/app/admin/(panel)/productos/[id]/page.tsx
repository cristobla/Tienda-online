import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AttributeFields, ProductFields } from "@/components/admin/catalog-fields";
import { AdminForm, DangerButton, Select, Submit, Text } from "@/components/admin/form";
import { Badge, ButtonLink, PageHeader, Section, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listAllBrands } from "@/modules/brands/admin";
import { getAdminProduct } from "@/modules/catalog/admin";
import { loadAttributeDefinitions } from "@/modules/catalog/queries";
import { listCategoryTree } from "@/modules/categories/admin";
import { formatCLP } from "@/modules/chile";
import { deleteImageAction, deleteProductAction, updateImageAction, updateProductAction, uploadImagesAction } from "../actions";
import { UploadForm } from "./upload-form";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ creado?: string }> };

async function load(id: string) {
  return z.uuid().safeParse(id).success ? getAdminProduct(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await load((await params).id))?.product.name ?? "Producto" };
}

export default async function EditProductPage({ params, searchParams }: Props) {
  await requireStaffPage("catalog:write");
  const data = await load((await params).id);
  if (!data) notFound();
  const { product, variants, images } = data;
  const [categories, brands, defs] = await Promise.all([listCategoryTree(), listAllBrands(), loadAttributeDefinitions()]);

  return (
    <>
      <PageHeader title={product.name} back={{ href: "/admin/productos", label: "Productos" }}>
        {product.active && <ButtonLink href={`/producto/${product.slug}`} variant="plain">Ver en la tienda ↗</ButtonLink>}
        <ButtonLink href={`/admin/auditoria?tipo=product&id=${product.id}`} variant="plain">Historial</ButtonLink>
      </PageHeader>
      {(await searchParams).creado && (
        <p role="status" className="mb-6 rounded-md border border-leaf/40 bg-white px-4 py-3 text-sm font-medium text-leaf-dark">
          Producto creado. Agrega fotos y, si corresponde, más formatos.
        </p>
      )}

      <div className="grid max-w-5xl gap-6">
        <Section title="Datos del producto">
          <AdminForm action={updateProductAction.bind(null, product.id)}>
            <ProductFields product={product} categories={categories} brands={brands.map((b) => b.brand)} />
            <AttributeFields defs={defs} scope="PRODUCT" values={product.attributes} />
            <Submit />
          </AdminForm>
        </Section>

        <section id="variantes" className="scroll-mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Variantes</h2>
            <ButtonLink href={`/admin/productos/${product.id}/variantes/nueva`} variant="plain">
              Agregar variante
            </ButtonLink>
          </div>
          <Table head={["Presentación", "SKU", "Precio", "Bodega", "Reservado", "Disponible", "Estado"]}>
            {variants.map((v) => {
              const available = v.stockOnHand - v.stockReserved;
              return (
                <tr key={v.id}>
                  <td>
                    <Link href={`/admin/productos/${product.id}/variantes/${v.id}`} className="font-semibold hover:text-leaf hover:underline">
                      {v.name}
                    </Link>
                    {v.isDefault && <span className="ml-2 text-xs text-muted">principal</span>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{v.sku}</td>
                  <td className="whitespace-nowrap">
                    {formatCLP(v.price)}
                    {v.compareAtPrice && <s className="ml-1 text-xs text-muted">{formatCLP(v.compareAtPrice)}</s>}
                  </td>
                  <td>{v.stockOnHand}</td>
                  <td>{v.stockReserved}</td>
                  <td>
                    {available <= 0 ? <Badge tone="bad">0</Badge> : available <= v.minimumStock ? <Badge tone="warn">{available}</Badge> : available}
                  </td>
                  <td>{v.active ? <Badge tone="ok">A la venta</Badge> : <Badge tone="off">Pausada</Badge>}</td>
                </tr>
              );
            })}
          </Table>
        </section>

        <Section title="Imágenes">
          {images.length > 0 && (
            <ul className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <li key={img.id} className="rounded-md border border-line p-3">
                  <div className="relative mb-3 aspect-square overflow-hidden rounded-sm bg-mist">
                    <Image src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 20vw, 50vw" className="object-contain" />
                  </div>
                  <AdminForm action={updateImageAction.bind(null, img.id)} className="space-y-3">
                    <Text name="alt" label="Texto alternativo" initial={img.alt} maxLength={200} hint="Describe la foto (accesibilidad y SEO)." />
                    <div className="grid grid-cols-2 gap-2">
                      <Select name="variantId" label="Variante" initial={img.variantId} empty="Todas" options={variants.map((v) => ({ value: v.id, label: v.name }))} />
                      <Text name="sortOrder" label="Orden" type="number" min={0} initial={img.sortOrder} required />
                    </div>
                    <Submit variant="plain">Guardar</Submit>
                  </AdminForm>
                  <div className="mt-2">
                    <DangerButton action={deleteImageAction.bind(null, img.id)} confirm="¿Eliminar esta imagen?">
                      Eliminar
                    </DangerButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <UploadForm action={uploadImagesAction.bind(null, product.id)} />
        </Section>

        <Section title="Eliminar producto">
          <p className="mb-3 text-sm text-muted">
            Solo es posible si nunca tuvo stock ni ventas. Para sacarlo de la tienda sin perder historial, desmarca «Visible en la tienda».
          </p>
          <DangerButton action={deleteProductAction.bind(null, product.id)} confirm={`¿Eliminar «${product.name}» definitivamente?`}>
            Eliminar producto
          </DangerButton>
        </Section>
      </div>
    </>
  );
}
