/**
 * Lectura del catálogo público: listado con búsqueda, filtros, orden y paginación; facetas; ficha de producto.
 * Solo se muestra lo vendible: producto activo, en categoría visible y con al menos una variante activa.
 */
import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import * as s from "@/db/schema";
import { listBrands } from "@/modules/brands/queries";
import { loadCategories, pathTo } from "@/modules/categories/queries";
import { type CatalogParams, PAGE_SIZE, type Sort } from "./params";

type AttrDef = typeof s.attributeDefinitions.$inferSelect;
type AttrValue = string | number | boolean;

/** Qué se está mirando: categoría (o todo lo visible), marca y texto buscado. Las facetas se calculan sobre esto. */
export type Scope = { categoryIds: string[]; brandId?: string; q?: string };
/** Lo que el cliente va acotando dentro del alcance. */
export type Filters = {
  brandIds?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  featured?: boolean;
  attrs?: { def: AttrDef; values: AttrValue[] }[];
};

export const loadAttributeDefinitions = cache(() =>
  db.select().from(s.attributeDefinitions).orderBy(asc(s.attributeDefinitions.sortOrder)),
);

/** Traduce parámetros de URL (slugs, textos) a filtros tipados. Lo desconocido se descarta. */
export async function resolveFilters(p: CatalogParams): Promise<Filters> {
  const [brands, defs] = await Promise.all([listBrands(), loadAttributeDefinitions()]);
  const attrs = defs
    .filter((d) => d.filterable && p.attrs[d.code]?.length)
    .map((def) => ({ def, values: p.attrs[def.code]!.map((v) => castAttr(def, v)) }));
  return {
    brandIds: brands.filter((b) => p.brandSlugs.includes(b.slug)).map((b) => b.id),
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    inStock: p.inStock,
    attrs,
  };
}

function castAttr(def: AttrDef, v: string): AttrValue {
  if (def.type === "BOOLEAN") return v === "true";
  if (def.type === "NUMBER" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

const uuids = (ids: string[]) => sql`${sql.param(ids)}::uuid[]`;

// Variante más barata de cada producto (la que se muestra en la grilla) + agregados de todas sus variantes activas.
const cheapestVariant = sql`
  SELECT DISTINCT ON (x.product_id)
    x.product_id, x.id AS variant_id, x.name AS variant_name, x.price, x.compare_at_price, x.net_content, x.content_unit, x.units_per_pack,
    count(*) OVER w AS variant_count,
    max(x.price) OVER w AS max_price,
    bool_or(x.stock_on_hand > x.stock_reserved) OVER w AS in_stock
  FROM product_variants x
  WHERE x.active
  WINDOW w AS (PARTITION BY x.product_id)
  ORDER BY x.product_id, x.price, x.sort_order`;

// Mismas expresiones que los índices de drizzle/0001_busqueda.sql.
const productTsv = sql`to_tsvector('spanish', f_unaccent(p.name || ' ' || coalesce(p.short_description, '')))`;
const tsQuery = (q: string) => sql`websearch_to_tsquery('spanish', f_unaccent(${q}))`;
const norm = (q: string) => sql`f_unaccent(lower(${q}))`;
const likeEscape = (q: string) => q.replace(/[\\%_]/g, "\\$&");

function scopeConditions(scope: Scope): SQL[] {
  const c: SQL[] = [sql`p.active`, sql`p.category_id = ANY(${uuids(scope.categoryIds)})`];
  if (scope.brandId) c.push(sql`p.brand_id = ${scope.brandId}`);
  if (scope.q) {
    const q = scope.q;
    const contains = sql`'%' || f_unaccent(lower(${likeEscape(q)})) || '%'`;
    // Texto completo (tolera tildes y plurales) · parecido (errores de tipeo) · parte del nombre o marca · SKU/código exacto.
    c.push(sql`(
      ${productTsv} @@ ${tsQuery(q)}
      OR ${norm(q)} <% f_unaccent(lower(p.name))
      OR f_unaccent(lower(p.name)) LIKE ${contains}
      OR f_unaccent(lower(coalesce(b.name, ''))) LIKE ${contains}
      OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND sv.active
                 AND (lower(sv.sku) = lower(${q}) OR sv.barcode = ${q}))
    )`);
  }
  return c;
}

function filterConditions(f: Filters): SQL[] {
  const c: SQL[] = [];
  if (f.brandIds?.length) c.push(sql`p.brand_id = ANY(${uuids(f.brandIds)})`);
  if (f.minPrice !== undefined) c.push(sql`v.price >= ${f.minPrice}`);
  if (f.maxPrice !== undefined) c.push(sql`v.price <= ${f.maxPrice}`);
  if (f.inStock) c.push(sql`v.in_stock`);
  if (f.featured) c.push(sql`p.featured`);
  for (const { def, values } of f.attrs ?? []) {
    // Varios valores del mismo atributo = OR; atributos distintos = AND.
    const any = sql.join(
      values.map((val) => {
        const json = JSON.stringify({ [def.code]: val });
        return def.scope === "PRODUCT"
          ? sql`p.attributes @> ${json}::jsonb`
          : sql`EXISTS (SELECT 1 FROM product_variants av WHERE av.product_id = p.id AND av.active AND av.attributes @> ${json}::jsonb)`;
      }),
      sql` OR `,
    );
    c.push(sql`(${any})`);
  }
  return c;
}

const FROM = sql`FROM products p JOIN (${cheapestVariant}) v ON v.product_id = p.id LEFT JOIN brands b ON b.id = p.brand_id`;

function orderBy(sort: Sort, q?: string): SQL {
  switch (sort) {
    case "relevancia":
      return q
        ? sql`ts_rank(${productTsv}, ${tsQuery(q)}) + word_similarity(${norm(q)}, f_unaccent(lower(p.name))) DESC, p.featured DESC`
        : sql`p.featured DESC, p.created_at DESC`;
    case "nuevos":
      return sql`p.created_at DESC`;
    case "precio_asc":
      return sql`v.price ASC`;
    case "precio_desc":
      return sql`v.price DESC`;
    case "nombre":
      return sql`f_unaccent(lower(p.name)) ASC`;
    default:
      return sql`p.featured DESC, p.created_at DESC`;
  }
}

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  brandName: string | null;
  imageUrl: string | null;
  featured: boolean;
  /** Variante mostrada en la tarjeta (la más barata); se agrega directo al carrito si es la única. */
  variantId: string;
  variantName: string;
  price: number;
  maxPrice: number;
  compareAtPrice: number | null;
  netContent: string | null;
  contentUnit: (typeof s.contentUnit.enumValues)[number];
  unitsPerPack: number;
  variantCount: number;
  inStock: boolean;
};

export async function listProducts(
  scope: Scope,
  filters: Filters = {},
  opts: { sort?: Sort; page?: number; pageSize?: number } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const sort = opts.sort ?? (scope.q ? "relevancia" : "destacados");
  if (!scope.categoryIds.length) return { items: [] as ProductCard[], total: 0, page, pageSize };
  const where = sql.join([...scopeConditions(scope), ...filterConditions(filters)], sql` AND `);

  const [rows, count] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT p.id, p.slug, p.name, p.featured, b.name AS brand_name,
        (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
        v.variant_id, v.variant_name, v.price, v.max_price, v.compare_at_price, v.net_content, v.content_unit, v.units_per_pack, v.variant_count, v.in_stock
      ${FROM} WHERE ${where}
      ORDER BY ${orderBy(sort, scope.q)}, p.id
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
    db.execute<{ total: number }>(sql`SELECT count(*)::int AS total ${FROM} WHERE ${where}`),
  ]);

  const items: ProductCard[] = rows.rows.map((r) => ({
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    brandName: r.brand_name as string | null,
    imageUrl: r.image_url as string | null,
    featured: r.featured as boolean,
    variantId: r.variant_id as string,
    variantName: r.variant_name as string,
    price: r.price as number,
    maxPrice: r.max_price as number,
    compareAtPrice: r.compare_at_price as number | null,
    netContent: r.net_content as string | null,
    contentUnit: r.content_unit as ProductCard["contentUnit"],
    unitsPerPack: r.units_per_pack as number,
    variantCount: Number(r.variant_count),
    inStock: r.in_stock as boolean,
  }));
  return { items, total: count.rows[0]?.total ?? 0, page, pageSize };
}

export type Facets = {
  brands: { id: string; slug: string; name: string; count: number }[];
  price: { min: number; max: number } | null;
  attributes: { def: AttrDef; values: { value: string; count: number }[] }[];
};

/**
 * Opciones de filtro disponibles dentro del alcance (sin aplicar los filtros elegidos,
 * así el cliente siempre puede ampliar la selección).
 */
export async function getFacets(scope: Scope): Promise<Facets> {
  if (!scope.categoryIds.length) return { brands: [], price: null, attributes: [] };
  const where = sql.join(scopeConditions(scope), sql` AND `);
  const defs = (await loadAttributeDefinitions()).filter((d) => d.filterable);
  const productCodes = defs.filter((d) => d.scope === "PRODUCT").map((d) => d.code);
  const variantCodes = defs.filter((d) => d.scope === "VARIANT").map((d) => d.code);

  const [brands, price, attrs] = await Promise.all([
    db.execute<Facets["brands"][number]>(sql`
      SELECT b.id, b.slug, b.name, count(*)::int AS count ${FROM}
      WHERE ${where} AND b.active GROUP BY b.id ORDER BY b.name`),
    db.execute<{ min: number | null; max: number | null }>(sql`SELECT min(v.price) AS min, max(v.price) AS max ${FROM} WHERE ${where}`),
    db.execute<{ key: string; value: string; count: number }>(sql`
      SELECT kv.key, kv.value, count(DISTINCT p.id)::int AS count ${FROM}
      CROSS JOIN LATERAL jsonb_each_text(p.attributes) kv
      WHERE ${where} AND kv.key = ANY(${sql.param(productCodes)}::text[]) GROUP BY 1, 2
      UNION ALL
      SELECT kv.key, kv.value, count(DISTINCT p.id)::int AS count ${FROM}
      JOIN product_variants av ON av.product_id = p.id AND av.active
      CROSS JOIN LATERAL jsonb_each_text(av.attributes) kv
      WHERE ${where} AND kv.key = ANY(${sql.param(variantCodes)}::text[]) GROUP BY 1, 2
      ORDER BY 2`),
  ]);

  const p = price.rows[0];
  return {
    brands: brands.rows,
    price: p?.min != null && p.max != null ? { min: p.min, max: p.max } : null,
    attributes: defs
      .map((def) => ({ def, values: attrs.rows.filter((r) => r.key === def.code).map(({ value, count }) => ({ value, count })) }))
      .filter((a) => a.values.length > 0),
  };
}

/** Ficha de producto. null si no existe, está inactivo, su categoría no es visible o no tiene variantes activas. */
export async function getProductBySlug(slug: string) {
  const { byId, parentOf } = await loadCategories();
  const [row] = await db
    .select({ product: s.products, brand: s.brands })
    .from(s.products)
    .leftJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .where(and(eq(s.products.slug, slug), eq(s.products.active, true)));
  // Un borrador sin categoría no es público (y no puede estar activo: CHECK products_active_needs_category).
  const category = row?.product.categoryId ? byId.get(row.product.categoryId) : undefined;
  if (!row || !category) return null;

  const [variants, images, defs] = await Promise.all([
    db
      .select()
      .from(s.productVariants)
      .where(and(eq(s.productVariants.productId, row.product.id), eq(s.productVariants.active, true)))
      .orderBy(asc(s.productVariants.sortOrder), asc(s.productVariants.price)),
    db.select().from(s.productImages).where(eq(s.productImages.productId, row.product.id)).orderBy(asc(s.productImages.sortOrder)),
    loadAttributeDefinitions(),
  ]);
  if (!variants.length) return null;

  return {
    product: row.product,
    brand: row.brand?.active ? row.brand : null,
    categoryPath: pathTo(category, parentOf),
    variants: variants.map((v) => ({ ...v, available: Math.max(0, v.stockOnHand - v.stockReserved) })),
    images,
    attributeDefs: defs,
  };
}

/** Atributos listos para mostrar, en el orden definido en el panel: [{ label: "Aroma", value: "Coco" }]. */
export function describeAttributes(attrs: s.Attributes, defs: AttrDef[]) {
  return defs
    .filter((d) => attrs[d.code] !== undefined && attrs[d.code] !== "")
    .map((d) => {
      const v = attrs[d.code]!;
      const value = typeof v === "boolean" ? (v ? "Sí" : "No") : d.unit ? `${v} ${d.unit}` : String(v);
      return { code: d.code, label: d.label, value };
    });
}

/** Productos de la misma categoría, excluyendo el actual. */
export async function relatedProducts(productId: string, categoryId: string, limit = 4) {
  const { items } = await listProducts({ categoryIds: [categoryId] }, { inStock: true }, { pageSize: limit + 1 });
  return items.filter((p) => p.id !== productId).slice(0, limit);
}

/** Para el sitemap: todo lo publicable. */
export async function listPublicSlugs() {
  const { visibleIds } = await loadCategories();
  if (!visibleIds.length) return [];
  return db
    .selectDistinct({ slug: s.products.slug, updatedAt: s.products.updatedAt })
    .from(s.products)
    .innerJoin(s.productVariants, and(eq(s.productVariants.productId, s.products.id), eq(s.productVariants.active, true)))
    .where(and(eq(s.products.active, true), inArray(s.products.categoryId, visibleIds)));
}
