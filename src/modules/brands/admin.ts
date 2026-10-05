import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { brands, products } from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { slugify } from "@/lib/slug";
import { audit } from "@/modules/audit";

export const brandSchema = z.object({
  name: field.text(80),
  slug: field.optText(80),
  description: field.optText(1000),
  active: field.bool(),
});
export type BrandInput = z.infer<typeof brandSchema>;

const withSlug = (d: BrandInput) => ({ ...d, slug: slugify(d.slug ?? d.name) || slugify(d.name) });

/** Todas las marcas (también inactivas) con su cantidad de productos. */
export function listAllBrands() {
  return db
    .select({ brand: brands, products: count(products.id) })
    .from(brands)
    .leftJoin(products, eq(products.brandId, brands.id))
    .groupBy(brands.id)
    .orderBy(asc(brands.name));
}

export async function getBrand(id: string) {
  const [b] = await db.select().from(brands).where(eq(brands.id, id));
  return b ?? null;
}

export async function createBrand(userId: string, data: BrandInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(brands).values(withSlug(data)).returning();
    await audit(tx, { userId, action: "brand.create", entityType: "brand", entityId: row!.id, after: row });
    return row!;
  });
}

export async function updateBrand(userId: string, id: string, data: BrandInput) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(brands).where(eq(brands.id, id)).for("update");
    if (!before) throw new UserError("La marca no existe.");
    const [row] = await tx.update(brands).set(withSlug(data)).where(eq(brands.id, id)).returning();
    await audit(tx, { userId, action: "brand.update", entityType: "brand", entityId: id, before, after: row });
    return row!;
  });
}

/** Falla con FK (23503) si tiene productos: se desactiva en vez de borrar. */
export async function deleteBrand(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.delete(brands).where(eq(brands.id, id)).returning();
    if (before) await audit(tx, { userId, action: "brand.delete", entityType: "brand", entityId: id, before });
  });
}
