/**
 * Administración del catálogo: productos, variantes e imágenes.
 * Toda escritura va en una transacción con su registro de auditoría; el stock solo cambia vía applyMovement.
 */
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { slugify } from "@/lib/slug";
import { deleteImageFile, saveImage } from "@/lib/storage";
import { audit } from "@/modules/audit";
import { applyMovement } from "@/modules/inventory";

// ───────────── Esquemas ─────────────

export const productSchema = z.object({
  name: field.text(200),
  slug: field.optText(200),
  shortDescription: field.optText(300),
  description: field.optText(10_000),
  brandId: field.optUuid(),
  categoryId: z.uuid("Elige una categoría"),
  active: field.bool(),
  featured: field.bool(),
  metaTitle: field.optText(70),
  metaDescription: field.optText(170),
});
export type ProductInput = z.infer<typeof productSchema>;

export const variantSchema = z
  .object({
    sku: z.string().trim().regex(/^[A-Za-z0-9._-]{1,64}$/, "Letras, números, punto, guion o guion bajo (máx. 64)"),
    barcode: z
      .string()
      .trim()
      .regex(/^(\d{8}|\d{12,14})?$/, "EAN-8, UPC-12, EAN-13 o GTIN-14 (solo dígitos)")
      .transform((v) => v || null),
    name: field.text(100),
    price: field.int(0),
    compareAtPrice: field.optInt(1),
    costPrice: field.optInt(0),
    netContent: z
      .string()
      .trim()
      .regex(/^(\d{1,9}([.,]\d{1,3})?)?$/, "Número con hasta 3 decimales")
      .refine((v) => !v || Number(v.replace(",", ".")) > 0, "Debe ser mayor que 0")
      .transform((v) => (v ? v.replace(",", ".") : null)),
    contentUnit: z.enum(s.contentUnit.enumValues),
    unitsPerPack: field.int(1, 10_000),
    minimumStock: field.int(0, 1_000_000),
    sortOrder: field.int(0, 10_000),
    active: field.bool(),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    path: ["compareAtPrice"],
    message: "El precio anterior debe ser mayor que el precio actual",
  });
export type VariantInput = z.infer<typeof variantSchema>;

/** Solo al crear una variante: el stock posterior se cambia con movimientos de inventario. */
export const initialStockSchema = z.object({ initialStock: field.int(0, 1_000_000) });

const productValues = (d: ProductInput) => ({ ...d, slug: slugify(d.slug ?? d.name) || slugify(d.name) });

// ───────────── Lectura ─────────────

export const ADMIN_PAGE_SIZE = 50;

export type AdminProductFilters = {
  q?: string;
  categoryId?: string;
  brandId?: string;
  status?: "activos" | "inactivos";
  stock?: "agotado" | "bajo";
  page?: number;
};

export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  featured: boolean;
  brand: string | null;
  category: string;
  imageUrl: string | null;
  variants: number;
  minPrice: number | null;
  maxPrice: number | null;
  available: number;
  outOfStock: number;
  low: number;
  total: number;
};

/** Listado del panel: incluye inactivos; filtros por texto, SKU/código, categoría (con subcategorías), marca, estado y stock. */
export async function listAdminProducts(f: AdminProductFilters) {
  const page = f.page ?? 1;
  const where = [sql`true`];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(sql`(f_unaccent(lower(p.name)) LIKE f_unaccent(lower(${like}))
      OR EXISTS (SELECT 1 FROM product_variants sv WHERE sv.product_id = p.id AND (sv.sku ILIKE ${like} OR sv.barcode = ${f.q})))`);
  }
  if (f.categoryId)
    where.push(sql`p.category_id IN (WITH RECURSIVE t AS (SELECT id FROM categories WHERE id = ${f.categoryId}
      UNION ALL SELECT c.id FROM categories c JOIN t ON c.parent_id = t.id) SELECT id FROM t)`);
  if (f.brandId) where.push(sql`p.brand_id = ${f.brandId}`);
  if (f.status) where.push(f.status === "activos" ? sql`p.active` : sql`NOT p.active`);
  if (f.stock) where.push(f.stock === "agotado" ? sql`v.out_of_stock > 0` : sql`v.low > 0`);

  const res = await db.execute<Record<string, unknown>>(sql`
    SELECT p.id, p.name, p.slug, p.active, p.featured, b.name AS brand, c.name AS category,
      (SELECT i.url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url,
      v.variants, v.min_price, v.max_price, v.available, v.out_of_stock, v.low, count(*) OVER ()::int AS total
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN brands b ON b.id = p.brand_id
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS variants, min(x.price) AS min_price, max(x.price) AS max_price,
        coalesce(sum(x.stock_on_hand - x.stock_reserved) FILTER (WHERE x.active), 0)::int AS available,
        count(*) FILTER (WHERE x.active AND x.stock_on_hand - x.stock_reserved <= 0)::int AS out_of_stock,
        count(*) FILTER (WHERE x.active AND x.stock_on_hand - x.stock_reserved > 0
                         AND x.stock_on_hand - x.stock_reserved <= x.minimum_stock)::int AS low
      FROM product_variants x WHERE x.product_id = p.id
    ) v
    WHERE ${sql.join(where, sql` AND `)}
    ORDER BY p.updated_at DESC, p.id
    LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}`);

  const items: AdminProductRow[] = res.rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    active: r.active as boolean,
    featured: r.featured as boolean,
    brand: r.brand as string | null,
    category: r.category as string,
    imageUrl: r.image_url as string | null,
    variants: r.variants as number,
    minPrice: r.min_price as number | null,
    maxPrice: r.max_price as number | null,
    available: r.available as number,
    outOfStock: r.out_of_stock as number,
    low: r.low as number,
    total: r.total as number,
  }));
  return { items, total: items[0]?.total ?? 0, page };
}

export async function getAdminProduct(id: string) {
  const [product] = await db.select().from(s.products).where(eq(s.products.id, id));
  if (!product) return null;
  const [variants, images] = await Promise.all([
    db.select().from(s.productVariants).where(eq(s.productVariants.productId, id)).orderBy(asc(s.productVariants.sortOrder), asc(s.productVariants.price)),
    db.select().from(s.productImages).where(eq(s.productImages.productId, id)).orderBy(asc(s.productImages.sortOrder), asc(s.productImages.createdAt)),
  ]);
  return { product, variants, images };
}

export async function getVariant(id: string) {
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, id));
  return v ?? null;
}

/** Números para el inicio del panel. */
export async function dashboardStats() {
  const [counts, low] = await Promise.all([
    db.execute<Record<string, number>>(sql`SELECT
      (SELECT count(*) FROM products WHERE active)::int AS active_products,
      (SELECT count(*) FROM products WHERE NOT active)::int AS inactive_products,
      (SELECT count(*) FROM product_variants WHERE active AND stock_on_hand - stock_reserved <= 0)::int AS out_of_stock,
      (SELECT count(*) FROM product_variants WHERE active AND stock_on_hand - stock_reserved > 0
         AND stock_on_hand - stock_reserved <= minimum_stock)::int AS low_stock,
      (SELECT count(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id))::int AS without_images`),
    db
      .select({
        productId: s.products.id,
        product: s.products.name,
        variant: s.productVariants.name,
        sku: s.productVariants.sku,
        available: sql<number>`${s.productVariants.stockOnHand} - ${s.productVariants.stockReserved}`,
        minimum: s.productVariants.minimumStock,
      })
      .from(s.productVariants)
      .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
      .where(
        and(
          eq(s.productVariants.active, true),
          sql`${s.productVariants.stockOnHand} - ${s.productVariants.stockReserved} <= ${s.productVariants.minimumStock}`,
        ),
      )
      .orderBy(sql`${s.productVariants.stockOnHand} - ${s.productVariants.stockReserved}`, asc(s.products.name))
      .limit(15),
  ]);
  const c = counts.rows[0]!;
  return {
    activeProducts: c.active_products!,
    inactiveProducts: c.inactive_products!,
    outOfStock: c.out_of_stock!,
    lowStock: c.low_stock!,
    withoutImages: c.without_images!,
    lowList: low,
  };
}

// ───────────── Productos ─────────────

/** Todo producto nace con su variante por defecto (un producto sin variantes no se puede vender). */
export async function createProduct(
  userId: string,
  input: { product: ProductInput; attributes: s.Attributes; variant: VariantInput; variantAttributes: s.Attributes; initialStock: number },
) {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .insert(s.products)
      .values({ ...productValues(input.product), attributes: input.attributes })
      .returning();
    const [variant] = await tx
      .insert(s.productVariants)
      .values({ ...input.variant, attributes: input.variantAttributes, productId: product!.id, isDefault: true })
      .returning();
    if (input.initialStock > 0)
      await applyMovement(tx, { variantId: variant!.id, type: "INITIAL_STOCK", quantity: input.initialStock, reason: "Stock inicial al crear", userId });
    await audit(tx, { userId, action: "product.create", entityType: "product", entityId: product!.id, after: { ...product, variants: [variant] } });
    return product!;
  });
}

export async function updateProduct(userId: string, id: string, data: ProductInput, attributes: s.Attributes) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.products).where(eq(s.products.id, id)).for("update");
    if (!before) throw new UserError("El producto no existe.");
    const [row] = await tx
      .update(s.products)
      .set({ ...productValues(data), attributes })
      .where(eq(s.products.id, id))
      .returning();
    await audit(tx, { userId, action: "product.update", entityType: "product", entityId: id, before, after: row });
    return row!;
  });
}

/** Solo si nunca tuvo stock ni ventas (FK 23503 en otro caso): con historial se desactiva. */
export async function deleteProduct(userId: string, id: string) {
  const images = await db.transaction(async (tx) => {
    const imgs = await tx.select().from(s.productImages).where(eq(s.productImages.productId, id));
    const [before] = await tx.delete(s.products).where(eq(s.products.id, id)).returning();
    if (before) await audit(tx, { userId, action: "product.delete", entityType: "product", entityId: id, before });
    return imgs;
  });
  // Archivos al final: si la transacción falla, las imágenes siguen existiendo.
  await Promise.all(images.map((i) => deleteImageFile(i.url)));
}

// ───────────── Variantes ─────────────

export async function createVariant(userId: string, productId: string, data: VariantInput, attributes: s.Attributes, initialStock: number) {
  return db.transaction(async (tx) => {
    const [product] = await tx.select({ id: s.products.id }).from(s.products).where(eq(s.products.id, productId)).for("update");
    if (!product) throw new UserError("El producto no existe.");
    const [hasDefault] = await tx
      .select({ id: s.productVariants.id })
      .from(s.productVariants)
      .where(and(eq(s.productVariants.productId, productId), eq(s.productVariants.isDefault, true)));
    const [row] = await tx
      .insert(s.productVariants)
      .values({ ...data, attributes, productId, isDefault: !hasDefault })
      .returning();
    if (initialStock > 0)
      await applyMovement(tx, { variantId: row!.id, type: "INITIAL_STOCK", quantity: initialStock, reason: "Stock inicial al crear", userId });
    await audit(tx, { userId, action: "variant.create", entityType: "variant", entityId: row!.id, after: { ...row, initialStock } });
    return row!;
  });
}

export async function updateVariant(userId: string, id: string, data: VariantInput, attributes: s.Attributes) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, id)).for("update");
    if (!before) throw new UserError("La variante no existe.");
    const [row] = await tx.update(s.productVariants).set({ ...data, attributes }).where(eq(s.productVariants.id, id)).returning();
    await audit(tx, { userId, action: "variant.update", entityType: "variant", entityId: id, before, after: row });
    return row!;
  });
}

export async function setDefaultVariant(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, id)).for("update");
    if (!v) throw new UserError("La variante no existe.");
    // Primero se quita la marca a las demás: el índice único admite una sola por producto.
    await tx
      .update(s.productVariants)
      .set({ isDefault: false })
      .where(and(eq(s.productVariants.productId, v.productId), ne(s.productVariants.id, id)));
    await tx.update(s.productVariants).set({ isDefault: true }).where(eq(s.productVariants.id, id));
    await audit(tx, { userId, action: "variant.set_default", entityType: "variant", entityId: id, before: { isDefault: v.isDefault }, after: { isDefault: true } });
  });
}

/** No se borra la variante por defecto; con movimientos o ventas falla por FK (23503) y se desactiva. */
export async function deleteVariant(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, id)).for("update");
    if (!v) return;
    if (v.isDefault) throw new UserError("Es la variante por defecto: marca otra como principal antes de eliminarla.");
    await tx.delete(s.productVariants).where(eq(s.productVariants.id, id));
    await audit(tx, { userId, action: "variant.delete", entityType: "variant", entityId: id, before: v });
  });
}

// ───────────── Imágenes ─────────────

export const imageSchema = z.object({
  alt: field.optText(200).transform((v) => v ?? ""),
  variantId: field.optUuid(),
  sortOrder: field.int(0, 10_000),
});

export async function addImages(userId: string, productId: string, files: File[], alt: string) {
  if (!files.length) throw new UserError("Elige al menos una imagen.");
  if (files.length > 10) throw new UserError("Máximo 10 imágenes por vez.");
  const urls: string[] = [];
  try {
    for (const file of files) urls.push(await saveImage(file));
    return await db.transaction(async (tx) => {
      const [max] = await tx
        .select({ n: sql<number>`coalesce(max(${s.productImages.sortOrder}), -1)` })
        .from(s.productImages)
        .where(eq(s.productImages.productId, productId));
      const rows = await tx
        .insert(s.productImages)
        .values(urls.map((url, i) => ({ productId, url, alt, sortOrder: Number(max!.n) + 1 + i })))
        .returning();
      await audit(tx, { userId, action: "image.add", entityType: "product", entityId: productId, after: { images: urls } });
      return rows;
    });
  } catch (e) {
    // Si algo falla, no dejar archivos huérfanos.
    await Promise.all(urls.map(deleteImageFile));
    throw e;
  }
}

export async function updateImage(userId: string, id: string, data: z.infer<typeof imageSchema>) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(s.productImages).where(eq(s.productImages.id, id)).for("update");
    if (!before) throw new UserError("La imagen no existe.");
    if (data.variantId) {
      const [v] = await tx
        .select({ id: s.productVariants.id })
        .from(s.productVariants)
        .where(and(eq(s.productVariants.id, data.variantId), eq(s.productVariants.productId, before.productId)));
      if (!v) throw new UserError("La variante no pertenece a este producto.", "variantId");
    }
    const [row] = await tx.update(s.productImages).set(data).where(eq(s.productImages.id, id)).returning();
    await audit(tx, { userId, action: "image.update", entityType: "product", entityId: before.productId, before, after: row });
  });
}

export async function deleteImage(userId: string, id: string) {
  const removed = await db.transaction(async (tx) => {
    const [before] = await tx.delete(s.productImages).where(eq(s.productImages.id, id)).returning();
    if (before) await audit(tx, { userId, action: "image.delete", entityType: "product", entityId: before.productId, before });
    return before;
  });
  if (removed) await deleteImageFile(removed.url);
}
