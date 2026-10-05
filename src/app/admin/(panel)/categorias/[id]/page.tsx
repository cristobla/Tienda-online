import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Check, DangerButton, Select, Submit, Text, TextArea } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listCategoryTree } from "@/modules/categories/admin";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export const metadata: Metadata = { title: "Categoría" };

/** /admin/categorias/nueva crea; con un id, edita. */
export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("catalog:write");
  const { id } = await params;
  const isNew = id === "nueva";
  if (!isNew && !z.uuid().safeParse(id).success) notFound();
  const tree = await listCategoryTree();
  const index = tree.findIndex((c) => c.id === id);
  const c = tree[index];
  if (!isNew && !c) notFound();

  // El árbol viene en orden de recorrido: las descendientes son las filas siguientes con mayor profundidad.
  let end = index + 1;
  while (c && end < tree.length && tree[end]!.depth > c.depth) end++;
  const parents = c ? [...tree.slice(0, index), ...tree.slice(end)] : tree;

  return (
    <>
      <PageHeader title={c ? c.name : "Nueva categoría"} back={{ href: "/admin/categorias", label: "Categorías" }} />
      <div className="grid max-w-3xl gap-6">
        <Section title="Datos">
          <AdminForm action={saveCategoryAction.bind(null, c?.id ?? null)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Text name="name" label="Nombre" initial={c?.name} required maxLength={80} />
              <Select name="parentId" label="Dentro de" initial={c?.parentId} empty="— Categoría principal —" options={parents.map((p) => ({ value: p.id, label: p.path }))} />
              <Text name="slug" label="Dirección (slug)" initial={c?.slug} maxLength={80} hint={c ? "Cambiarlo rompe enlaces ya compartidos." : "Vacío = se genera desde el nombre."} />
              <Text name="sortOrder" label="Orden" type="number" min={0} initial={c?.sortOrder ?? 0} required hint="Menor = aparece primero." />
            </div>
            <TextArea name="description" label="Descripción" initial={c?.description} rows={3} maxLength={2000} />
            <Check name="active" label="Visible en la tienda" initial={c?.active ?? true} />
            <details className="rounded-md border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold">SEO</summary>
              <div className="mt-4 space-y-4">
                <Text name="metaTitle" label="Título para buscadores" initial={c?.metaTitle} maxLength={70} />
                <TextArea name="metaDescription" label="Descripción para buscadores" initial={c?.metaDescription} rows={2} maxLength={170} />
              </div>
            </details>
            <Submit>{c ? "Guardar" : "Crear categoría"}</Submit>
          </AdminForm>
        </Section>
        {c && (
          <Section title="Eliminar">
            <p className="mb-3 text-sm text-muted">Solo si no tiene productos ni subcategorías.</p>
            <DangerButton action={deleteCategoryAction.bind(null, c.id)} confirm={`¿Eliminar la categoría «${c.name}»?`}>
              Eliminar categoría
            </DangerButton>
          </Section>
        )}
      </div>
    </>
  );
}
