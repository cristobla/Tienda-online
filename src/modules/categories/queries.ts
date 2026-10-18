import { asc, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { categories } from "@/db/schema";

export type Category = typeof categories.$inferSelect;
export type CategoryNode = Category & { children: CategoryNode[] };

/**
 * Árbol de categorías visibles: activas y con todos sus ancestros activos.
 * ponytail: carga la tabla completa (decenas/cientos de filas) y arma el árbol en memoria;
 * pasar a CTE recursiva si llegan a ser miles.
 */
export const loadCategories = cache(async () => {
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
  const nodes = new Map<string, CategoryNode>(rows.map((c) => [c.id, { ...c, children: [] }]));
  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (!node.active) continue;
    if (!node.parentId) roots.push(node);
    else nodes.get(node.parentId)?.children.push(node);
  }
  // Solo es visible lo alcanzable desde una raíz activa pasando por categorías activas.
  const bySlug = new Map<string, CategoryNode>();
  const byId = new Map<string, CategoryNode>();
  const parentOf = new Map<string, CategoryNode>();
  const walk = (n: CategoryNode) => {
    bySlug.set(n.slug, n);
    byId.set(n.id, n);
    for (const c of n.children) {
      parentOf.set(c.id, n);
      walk(c);
    }
  };
  roots.forEach(walk);

  // Navegación (menú, pie, pasillos de la portada): solo categorías con algún producto publicado en su rama.
  // Las vacías siguen existiendo (su página, el carrito y la validación no cambian); solo no se ofrecen.
  const used = new Set(
    (await db.execute<{ id: string }>(sql`SELECT DISTINCT "category_id" AS id FROM "products" WHERE "active" AND "category_id" IS NOT NULL`)).rows.map((r) => r.id),
  );
  const prune = (n: CategoryNode): CategoryNode | null => {
    const children = n.children.map(prune).filter((c): c is CategoryNode => c !== null);
    return used.has(n.id) || children.length ? { ...n, children } : null;
  };
  const nav = roots.map(prune).filter((c): c is CategoryNode => c !== null);
  const navIds = new Set<string>();
  const mark = (n: CategoryNode) => (navIds.add(n.id), n.children.forEach(mark));
  nav.forEach(mark);
  return { roots, nav, navIds, bySlug, byId, parentOf, visibleIds: [...byId.keys()] };
});

/** Ids de la categoría y todas sus descendientes visibles (un producto de una subcategoría aparece en la madre). */
export function subtreeIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(subtreeIds)];
}

/** Categoría por slug con su ruta desde la raíz (migas de pan). null si no existe o no es visible. */
export async function getCategoryBySlug(slug: string) {
  const { bySlug, parentOf } = await loadCategories();
  const category = bySlug.get(slug);
  if (!category) return null;
  return { category, path: pathTo(category, parentOf) };
}

export function pathTo(node: CategoryNode, parentOf: Map<string, CategoryNode>): CategoryNode[] {
  const path = [node];
  for (let p = parentOf.get(node.id); p; p = parentOf.get(p.id)) path.unshift(p);
  return path;
}
