import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { categories, products } from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { slugify } from "@/lib/slug";
import { audit } from "@/modules/audit";

export const categorySchema = z.object({
  name: field.text(80),
  slug: field.optText(80),
  parentId: field.optUuid(),
  description: field.optText(2000),
  sortOrder: field.int(0, 10_000),
  active: field.bool(),
  metaTitle: field.optText(70),
  metaDescription: field.optText(170),
});
export type CategoryInput = z.infer<typeof categorySchema>;

const withSlug = (d: CategoryInput) => ({ ...d, slug: slugify(d.slug ?? d.name) || slugify(d.name) });

export type AdminCategory = typeof categories.$inferSelect & { depth: number; products: number; path: string };

/**
 * Todas las categorías (también inactivas) en orden de árbol, con profundidad y ruta ("Aseo › Cocina").
 * ponytail: árbol en memoria, igual que la tienda; CTE recursiva si llegan a ser miles.
 */
export async function listCategoryTree(): Promise<AdminCategory[]> {
  const rows = await db
    .select({ c: categories, products: count(products.id) })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.name));
  const children = new Map<string | null, typeof rows>();
  for (const r of rows) children.set(r.c.parentId, [...(children.get(r.c.parentId) ?? []), r]);
  const out: AdminCategory[] = [];
  const walk = (parentId: string | null, depth: number, prefix: string) => {
    for (const r of children.get(parentId) ?? []) {
      const path = prefix ? `${prefix} › ${r.c.name}` : r.c.name;
      out.push({ ...r.c, depth, products: r.products, path });
      walk(r.c.id, depth + 1, path);
    }
  };
  walk(null, 0, "");
  return out;
}

export async function getCategory(id: string) {
  const [c] = await db.select().from(categories).where(eq(categories.id, id));
  return c ?? null;
}

/** El nuevo padre no puede ser la misma categoría ni una de sus descendientes (crearía un ciclo). */
async function assertNoCycle(tx: Tx, id: string, parentId: string | null) {
  if (!parentId) return;
  const all = await tx.select({ id: categories.id, parentId: categories.parentId }).from(categories);
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
  for (let p: string | null | undefined = parentId; p; p = parentOf.get(p))
    if (p === id) throw new UserError("Una categoría no puede quedar dentro de sí misma ni de sus subcategorías.", "parentId");
}

export async function createCategory(userId: string, data: CategoryInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(categories).values(withSlug(data)).returning();
    await audit(tx, { userId, action: "category.create", entityType: "category", entityId: row!.id, after: row });
    return row!;
  });
}

export async function updateCategory(userId: string, id: string, data: CategoryInput) {
  return db.transaction(async (tx) => {
    await assertNoCycle(tx, id, data.parentId);
    const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
    if (!before) throw new UserError("La categoría no existe.");
    const [row] = await tx.update(categories).set(withSlug(data)).where(eq(categories.id, id)).returning();
    await audit(tx, { userId, action: "category.update", entityType: "category", entityId: id, before, after: row });
    return row!;
  });
}

/** Falla con FK (23503) si tiene productos o subcategorías. */
export async function deleteCategory(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.delete(categories).where(eq(categories.id, id)).returning();
    if (before) await audit(tx, { userId, action: "category.delete", entityType: "category", entityId: id, before });
  });
}
