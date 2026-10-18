/**
 * Carga masiva de fotos: cada archivo se asocia a su producto por el nombre (SKU o código de barras).
 * "ABC-123.jpg" es la foto principal de ABC-123; "ABC-123-2.jpg", "ABC-123_2.jpg" o "ABC-123 (2).jpg" son las
 * siguientes. Se sube un archivo por llamada (el panel las envía de a una, con progreso).
 */
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { deleteImageFile, saveImage } from "@/lib/storage";
import { audit } from "@/modules/audit";
import { type PhotoMode, photoKeys } from "./photo-names";

export { PHOTO_MODES, type PhotoMode, photoKeys, photoOrder } from "./photo-names";

export type PhotoResult =
  | { status: "added" | "skipped"; variantId: string; productId: string; product: string; sku: string; note?: string }
  | { status: "unmatched"; note: string };

async function findVariant(keys: string[]) {
  for (const k of keys) {
    const [v] = await db
      .select({ id: s.productVariants.id, sku: s.productVariants.sku, productId: s.productVariants.productId, product: s.products.name })
      .from(s.productVariants)
      .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
      .where(or(sql`lower(${s.productVariants.sku}) = lower(${k})`, eq(s.productVariants.barcode, k)))
      // Si dos SKU difieren solo en mayúsculas, gana el idéntico.
      .orderBy(sql`${s.productVariants.sku} = ${k} desc`)
      .limit(1);
    if (v) return v;
  }
  return null;
}

/**
 * Asocia una foto. `added` = variantes que ya recibieron foto en esta misma carga: a esas se les agrega
 * (la foto "-2" no debe reemplazar ni saltarse por la principal que se acaba de subir).
 * Con varias variantes, la foto queda ligada a la variante del SKU; si no, al producto.
 */
export async function attachPhotoBySku(userId: string, file: File, mode: PhotoMode, added: readonly string[] = []): Promise<PhotoResult> {
  const v = await findVariant(photoKeys(file.name));
  if (!v) return { status: "unmatched", note: "Ningún SKU ni código de barras coincide con el nombre del archivo." };
  const effective: PhotoMode = added.includes(v.id) ? "agregar" : mode;
  const info = { variantId: v.id, productId: v.productId, product: v.product, sku: v.sku };

  const [{ n: variants }] = (await db.select({ n: sql<number>`count(*)::int` }).from(s.productVariants).where(eq(s.productVariants.productId, v.productId))) as [{ n: number }];
  const scope = variants > 1 ? eq(s.productImages.variantId, v.id) : eq(s.productImages.productId, v.productId);
  const existing = () => db.$count(s.productImages, scope);
  if (effective === "si-vacio" && (await existing()) > 0) return { status: "skipped", ...info, note: "Ya tenía fotos." };

  const url = await saveImage(file);
  let replaced: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      // Bloquea el producto: dos cargas a la vez no intercalan reemplazos ni órdenes.
      await tx.select({ id: s.products.id }).from(s.products).where(eq(s.products.id, v.productId)).for("update");
      if (effective === "si-vacio" && (await tx.$count(s.productImages, scope)) > 0) return "skipped" as const;
      if (effective === "reemplazar") {
        const gone = await tx.delete(s.productImages).where(and(eq(s.productImages.productId, v.productId), scope)).returning();
        replaced = gone.map((g) => g.url);
        if (gone.length) await audit(tx, { userId, action: "image.delete", entityType: "product", entityId: v.productId, before: { images: replaced } });
      }
      const [max] = await tx
        .select({ n: sql<number>`coalesce(max(${s.productImages.sortOrder}), -1)` })
        .from(s.productImages)
        .where(eq(s.productImages.productId, v.productId));
      // Reemplazar la foto de la única variante = nueva principal (orden 0); si no, va al final.
      const sortOrder = effective === "reemplazar" && variants === 1 ? 0 : Number(max!.n) + 1;
      await tx.insert(s.productImages).values({ productId: v.productId, variantId: variants > 1 ? v.id : null, url, alt: v.product, sortOrder });
      await audit(tx, { userId, action: "image.add", entityType: "product", entityId: v.productId, after: { images: [url], archivo: file.name.slice(0, 200) } });
      return "added" as const;
    });
    if (result === "skipped") {
      await deleteImageFile(url);
      return { status: "skipped", ...info, note: "Ya tenía fotos." };
    }
  } catch (e) {
    await deleteImageFile(url);
    throw e;
  }
  await Promise.all(replaced.map(deleteImageFile));
  return { status: "added", ...info, note: effective === "reemplazar" && replaced.length ? `Reemplazó ${replaced.length}.` : undefined };
}

// Columnas escritas a mano: dentro de una subconsulta, Drizzle no califica la tabla (ver CLAUDE.md, «Raw SQL»).
const noPhoto = sql`NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = "products"."id")`;

/** Productos sin ninguna foto (para saber qué falta fotografiar). Publicados primero. */
export async function productsWithoutPhotos(limit = 200) {
  const rows = await db
    .select({ id: s.products.id, name: s.products.name, active: s.products.active, sku: sql<string>`min(${s.productVariants.sku})` })
    .from(s.products)
    .leftJoin(s.productVariants, eq(s.productVariants.productId, s.products.id))
    .where(noPhoto)
    .groupBy(s.products.id)
    .orderBy(sql`${s.products.active} desc`, asc(s.products.name))
    .limit(limit + 1);
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.products)
    .where(noPhoto)) as [{ n: number }];
  return { items: rows.slice(0, limit), total: n };
}

