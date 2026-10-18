/** Redirecciones de slugs antiguos (SEO): cambiar la dirección de un producto, categoría o marca no rompe sus enlaces. */
import { and, eq } from "drizzle-orm";
import { notFound, permanentRedirect } from "next/navigation";
import { db, type Transaction } from "@/db";
import * as s from "@/db/schema";

export type SlugKind = "product" | "category" | "brand";
const TABLES = { product: s.products, category: s.categories, brand: s.brands };

/** En la misma transacción del cambio: el slug anterior pasa a apuntar a la entidad; el nuevo deja de ser "anterior". */
export async function rememberSlug(tx: Transaction, kind: SlugKind, targetId: string, oldSlug: string, newSlug: string) {
  if (oldSlug === newSlug) return;
  await tx
    .insert(s.slugRedirects)
    .values({ kind, oldSlug, targetId })
    .onConflictDoUpdate({ target: [s.slugRedirects.kind, s.slugRedirects.oldSlug], set: { targetId, createdAt: new Date() } });
  await tx.delete(s.slugRedirects).where(and(eq(s.slugRedirects.kind, kind), eq(s.slugRedirects.oldSlug, newSlug)));
}

/** Slug actual de la entidad a la que apuntaba un slug viejo, o null. Las páginas lo consultan solo si el slug no existe. */
export async function currentSlug(kind: SlugKind, oldSlug: string): Promise<string | null> {
  const t = TABLES[kind];
  const [row] = await db
    .select({ slug: t.slug })
    .from(s.slugRedirects)
    .innerJoin(t, eq(t.id, s.slugRedirects.targetId))
    .where(and(eq(s.slugRedirects.kind, kind), eq(s.slugRedirects.oldSlug, oldSlug)));
  return row?.slug ?? null;
}

/**
 * Para las páginas cuyo slug no existe: si fue la dirección anterior de algo que sigue existiendo, redirección
 * permanente (308) a la actual con los mismos parámetros (p. ej. ?variante=); si no, 404.
 */
export async function redirectFromOldSlug(kind: SlugKind, base: string, slug: string, sp: Record<string, string | string[] | undefined>): Promise<never> {
  const to = await currentSlug(kind, slug);
  if (!to) notFound();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of [v ?? []].flat()) q.append(k, x);
  permanentRedirect(`${base}${to}${q.size ? `?${q}` : ""}`);
}
