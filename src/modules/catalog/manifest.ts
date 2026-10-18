/**
 * Carga de productos desde un manifiesto JSON (lo arma Codex mirando las fotos y buscando precios online):
 * una entrada por foto con nombre, marca, categoría, formato, precio de referencia y su fuente. Crea cada producto
 * con los mismos servicios del panel (variante por defecto, stock como movimiento, auditoría) y le asocia su foto.
 * Varias entradas del mismo producto (otra foto) se agrupan por SKU: un producto con todas sus fotos.
 * Idempotente: un SKU que ya existe se salta.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { slugify } from "@/lib/slug";
import { createBrand } from "@/modules/brands/admin";
import { createProduct } from "./admin";
import { attachPhotoBySku } from "./photos";

export const manifestItem = z.object({
  archivo: z.string().min(1).max(200),
  nombre: z.string().trim().min(2).max(200),
  marca: z.string().trim().max(80).nullable(),
  /** Nombre exacto de una categoría de la tienda ("Higiene personal > Cuidado capilar" o solo la hoja). */
  categoria: z.string().trim().max(200).nullable(),
  /** Lo que se ve en la variante: "500 ml", "20 g", "Pack 4 rollos". */
  formato: z.string().trim().min(1).max(100),
  contenido: z.number().positive().max(1_000_000).nullable(),
  unidad: z.enum(s.contentUnit.enumValues),
  unidades: z.number().int().min(1).max(10_000).default(1),
  /** Precio de venta encontrado online (CLP, IVA incluido) y dónde. */
  precio_referencia: z.number().int().min(100).max(10_000_000),
  fuente: z.string().trim().min(3).max(500),
  codigo_barras: z
    .string()
    .regex(/^(\d{8}|\d{12,14})$/)
    .nullable(),
  descripcion: z.string().trim().max(2000).nullable(),
  /** Supuestos a confirmar por el dueño (formato o precio estimado); se informan al cargar. */
  revisar: z.string().trim().max(500).nullable().optional(),
});
export type ManifestItem = z.infer<typeof manifestItem>;
export const manifestSchema = z.array(manifestItem).min(1).max(2000);

/** Precio de la tienda: `descuento` bajo la referencia, redondeado hacia abajo a $10 (precios chilenos terminan en 0). */
export const priceFrom = (ref: number, descuento: number) => Math.max(10, Math.floor((ref * (1 - descuento)) / 10) * 10);

/**
 * SKU: el código de barras si lo hay; si no, uno legible derivado de marca + nombre + formato. Si hay que acortarlo,
 * lleva un sufijo con el hash del texto completo: dos variantes con el mismo comienzo no chocan.
 */
export function skuFor(i: ManifestItem) {
  if (i.codigo_barras) return i.codigo_barras;
  const full = slugify(`${i.marca ?? ""} ${i.nombre} ${i.formato}`).toUpperCase();
  if (full.length <= 40) return `P-${full}`;
  return `P-${full.slice(0, 33).replace(/-+$/, "")}-${createHash("sha256").update(full).digest("hex").slice(0, 6).toUpperCase()}`;
}

const norm = (v: string) => slugify(v).replace(/-/g, "");

export type LoadResult = { archivo: string; sku: string; estado: "creado" | "existente" | "error"; detalle: string; revisar?: string | null };

export async function loadManifest(
  userId: string,
  items: ManifestItem[],
  photosDir: string,
  opts: { descuento: number; stock: number; publicar: boolean },
): Promise<LoadResult[]> {
  const cats = await db
    .select({ id: s.categories.id, name: s.categories.name, parent: s.categories.parentId })
    .from(s.categories)
    .where(eq(s.categories.active, true));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const fullName = (c: (typeof cats)[number]) => (c.parent && byId.get(c.parent) ? `${byId.get(c.parent)!.name} > ${c.name}` : c.name);
  // Se acepta la ruta completa o solo el nombre de la hoja.
  const findCategory = (n: string) => cats.find((c) => norm(fullName(c)) === norm(n)) ?? cats.find((c) => norm(c.name) === norm(n.split(">").at(-1)!));
  const brandIds = new Map((await db.select().from(s.brands)).map((b) => [norm(b.name), b.id]));

  // Un producto por SKU con todas sus fotos (en el orden del manifiesto; la primera queda como principal).
  const groups = new Map<string, { i: ManifestItem; files: string[] }>();
  for (const it of items) {
    const g = groups.get(skuFor(it));
    if (g) g.files.includes(it.archivo) || g.files.push(it.archivo);
    else groups.set(skuFor(it), { i: it, files: [it.archivo] });
  }

  const out: LoadResult[] = [];
  for (const [sku, { i, files }] of groups) {
    try {
      // Ya cargado: mismo SKU, o mismo producto y formato (aunque su SKU se haya generado distinto).
      const [same] = await db
        .select({ sku: s.productVariants.sku })
        .from(s.productVariants)
        .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
        .where(and(eq(s.products.name, i.nombre), eq(s.productVariants.name, i.formato)))
        .limit(1);
      if (same || (await db.$count(s.productVariants, eq(s.productVariants.sku, sku)))) {
        out.push({ archivo: i.archivo, sku: same?.sku ?? sku, estado: "existente", detalle: "Ya estaba cargado: no se tocó." });
        continue;
      }
      let brandId: string | null = null;
      if (i.marca) {
        brandId = brandIds.get(norm(i.marca)) ?? null;
        if (!brandId) {
          brandId = (await createBrand(userId, { name: i.marca, slug: null, description: null, active: true })).id;
          brandIds.set(norm(i.marca), brandId);
        }
      }
      const cat = i.categoria ? findCategory(i.categoria) : undefined;
      const price = priceFrom(i.precio_referencia, opts.descuento);
      const product = await createProduct(userId, {
        product: {
          name: i.nombre,
          slug: null,
          shortDescription: null,
          description: i.descripcion,
          brandId,
          categoryId: cat?.id ?? null,
          active: opts.publicar && !!cat,
          featured: false,
          metaTitle: null,
          metaDescription: null,
        },
        attributes: {},
        variant: {
          sku,
          barcode: i.codigo_barras,
          name: i.formato,
          price,
          compareAtPrice: null,
          costPrice: null,
          netContent: i.contenido === null ? null : String(i.contenido),
          contentUnit: i.unidad,
          unitsPerPack: i.unidades,
          minimumStock: 0,
          sortOrder: 0,
          active: true,
        },
        variantAttributes: {},
        initialStock: opts.stock,
      });
      const fotos: string[] = [];
      for (const f of files)
        try {
          const bytes = await readFile(path.join(photosDir, path.basename(f)));
          const r = await attachPhotoBySku(userId, new File([bytes], `${sku}${path.extname(f)}`), "agregar");
          if (r.status !== "added") fotos.push(`${f}: ${r.note ?? r.status}`);
        } catch (e) {
          fotos.push(`${f} no cargada (${e instanceof Error ? e.message : String(e)})`);
        }
      const foto = fotos.length ? fotos.join("; ") : files.length === 1 ? "con foto" : `con ${files.length} fotos`;
      out.push({
        archivo: i.archivo,
        sku,
        estado: "creado",
        detalle: `${i.nombre} · $${price} (ref. $${i.precio_referencia}) · ${cat ? fullName(cat) : "SIN CATEGORÍA (borrador)"} · ${foto} · ${product.active ? "publicado" : "borrador"}`,
        revisar: i.revisar ?? null,
      });
    } catch (e) {
      out.push({ archivo: i.archivo, sku, estado: "error", detalle: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
