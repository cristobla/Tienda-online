import Link from "next/link";
import type * as s from "@/db/schema";
import { ATTR_FIELD, type AttributeDef } from "@/modules/catalog/attributes";
import type { AdminCategory } from "@/modules/categories/admin";
import { Check, Select, Text, TextArea } from "./form";

/** Grupos de campos del catálogo, compartidos entre "nuevo" y "editar". */

const grid = "grid gap-4 sm:grid-cols-2";

export function ProductFields({
  product,
  categories,
  brands,
}: {
  product?: typeof s.products.$inferSelect;
  categories: AdminCategory[];
  brands: (typeof s.brands.$inferSelect)[];
}) {
  return (
    <>
      <div className={grid}>
        <Text name="name" label="Nombre" initial={product?.name} required maxLength={200} className="sm:col-span-2" />
        <Select
          name="categoryId"
          label="Categoría"
          initial={product?.categoryId}
          empty="Sin categoría (borrador)"
          hint="Obligatoria para publicar."
          options={categories.map((c) => ({ value: c.id, label: c.path + (c.active ? "" : " (inactiva)") }))}
        />
        <Select
          name="brandId"
          label="Marca"
          initial={product?.brandId}
          empty="Sin marca"
          options={brands.map((b) => ({ value: b.id, label: b.name + (b.active ? "" : " (inactiva)") }))}
        />
      </div>
      <TextArea name="shortDescription" label="Descripción corta" initial={product?.shortDescription} rows={2} maxLength={300} hint="Aparece bajo el nombre y en buscadores." />
      <TextArea
        name="description"
        label="Descripción"
        initial={product?.description}
        rows={8}
        maxLength={10_000}
        hint="Admite formato básico: **negrita**, *cursiva*, listas con «- » o «1. » y títulos con «## »."
      />
      <div className="flex flex-wrap gap-6">
        <Check name="active" label="Visible en la tienda" initial={product?.active ?? true} />
        <Check name="featured" label="Destacado en el inicio" initial={product?.featured} />
      </div>
      <details className="rounded-md border border-line p-4">
        <summary className="cursor-pointer text-sm font-semibold">SEO y dirección web</summary>
        <div className="mt-4 space-y-4">
          <Text
            name="slug"
            label="Dirección (slug)"
            initial={product?.slug}
            maxLength={200}
            hint={product ? "Cambiarlo rompe los enlaces ya compartidos o indexados." : "Vacío = se genera desde el nombre."}
          />
          <Text name="metaTitle" label="Título para buscadores" initial={product?.metaTitle} maxLength={70} hint="Vacío = nombre del producto. Máx. 70." />
          <TextArea name="metaDescription" label="Descripción para buscadores" initial={product?.metaDescription} rows={2} maxLength={170} hint="Vacío = descripción corta. Máx. 170." />
        </div>
      </details>
    </>
  );
}

const UNITS: { value: (typeof s.contentUnit.enumValues)[number]; label: string }[] = [
  { value: "UNIT", label: "Unidad (sin medida)" },
  { value: "ML", label: "ml" },
  { value: "L", label: "L" },
  { value: "G", label: "g" },
  { value: "KG", label: "kg" },
  { value: "CM", label: "cm" },
  { value: "M", label: "m" },
];

/** Campos de variante con prefijo "v." (en "nuevo producto" conviven con los del producto). */
export function VariantFields({ variant, withInitialStock }: { variant?: typeof s.productVariants.$inferSelect; withInitialStock?: boolean }) {
  return (
    <>
      <div className={grid}>
        <Text name="v.name" label="Presentación" initial={variant?.name} required maxLength={100} hint="Ej.: 500 ml, Pack 6 × 90 g, Talla M." />
        <Text name="v.sku" label="SKU" initial={variant?.sku} required maxLength={64} hint="Código comercial tal cual (se conservan ceros y espacios internos)." />
        <Text name="v.barcode" label="Código de barras" initial={variant?.barcode} inputMode="numeric" maxLength={14} hint="EAN-13 u otro GTIN. Opcional." />
        <Text name="v.sortOrder" label="Orden" type="number" min={0} initial={variant?.sortOrder ?? 0} required />
      </div>
      <fieldset className={`${grid} lg:grid-cols-3`}>
        <legend className="mb-2 text-sm font-bold">Precios (CLP, IVA incluido)</legend>
        <Text name="v.price" label="Precio" type="number" min={0} step={1} inputMode="numeric" initial={variant?.price} required />
        <Text name="v.compareAtPrice" label="Precio anterior" type="number" min={1} step={1} inputMode="numeric" initial={variant?.compareAtPrice} hint="Solo si está en oferta (mayor al precio)." />
        <Text name="v.costPrice" label="Costo" type="number" min={0} step={1} inputMode="numeric" initial={variant?.costPrice} hint="Interno, no se muestra." />
      </fieldset>
      <fieldset className={`${grid} lg:grid-cols-3`}>
        <legend className="mb-2 text-sm font-bold">Contenido</legend>
        <Text name="v.netContent" label="Contenido neto de 1 unidad" initial={variant?.netContent} inputMode="decimal" hint="Ej.: 500 (ml) o 1,5 (L)." />
        <Select name="v.contentUnit" label="Unidad" initial={variant?.contentUnit ?? "UNIT"} options={UNITS} />
        <Text name="v.unitsPerPack" label="Unidades por pack" type="number" min={1} step={1} initial={variant?.unitsPerPack ?? 1} required hint="1 si no es pack." />
      </fieldset>
      <fieldset className={grid}>
        <legend className="mb-2 text-sm font-bold">Stock</legend>
        {withInitialStock ? (
          <Text name="v.initialStock" label="Stock inicial" type="number" min={0} step={1} initial={0} required hint="Queda registrado como movimiento de inventario." />
        ) : (
          variant && (
            <div className="text-sm">
              <p className="mb-1 font-semibold">Stock actual</p>
              <p>
                {variant.stockOnHand} en bodega · {variant.stockReserved} reservado · <strong>{variant.stockOnHand - variant.stockReserved} disponible</strong>
              </p>
              <p className="mt-1 text-xs text-muted">
                Se modifica con movimientos de inventario (ingresos, ventas, ajustes).{" "}
                <Link href={`/admin/inventario/${variant.id}`} className="font-medium text-leaf hover:underline">
                  Ver movimientos y ajustar
                </Link>
              </p>
            </div>
          )
        )}
        <Text name="v.minimumStock" label="Stock mínimo" type="number" min={0} step={1} initial={variant?.minimumStock ?? 0} required hint="Bajo esto aparece en «Reponer pronto»." />
      </fieldset>
      <Check name="v.active" label="Variante a la venta" initial={variant?.active ?? true} />
    </>
  );
}

/** Un campo por definición de atributo del alcance indicado. Vacío = sin valor. */
export function AttributeFields({
  defs,
  scope,
  values = {},
  prefix = "",
}: {
  defs: AttributeDef[];
  scope: "PRODUCT" | "VARIANT";
  values?: s.Attributes;
  prefix?: string;
}) {
  const mine = defs.filter((d) => d.scope === scope);
  if (!mine.length) return null;
  return (
    <fieldset className={grid}>
      <legend className="mb-2 text-sm font-bold">Características</legend>
      {mine.map((d) => {
        const name = prefix + ATTR_FIELD + d.code;
        const label = d.unit ? `${d.label} (${d.unit})` : d.label;
        const initial = values[d.code] === undefined ? null : String(values[d.code]);
        if (d.type === "BOOLEAN")
          return (
            <Select key={d.id} name={name} label={label} initial={initial} empty="—" options={[{ value: "true", label: "Sí" }, { value: "false", label: "No" }]} />
          );
        if (d.type === "SELECT")
          return <Select key={d.id} name={name} label={label} initial={initial} empty="—" options={(d.options ?? []).map((o) => ({ value: o, label: o }))} />;
        return <Text key={d.id} name={name} label={label} initial={initial} inputMode={d.type === "NUMBER" ? "decimal" : undefined} maxLength={200} />;
      })}
    </fieldset>
  );
}
