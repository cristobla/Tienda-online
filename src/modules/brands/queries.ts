import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { brands } from "@/db/schema";

export type Brand = typeof brands.$inferSelect;

/** Marcas activas, por nombre. Una marca inactiva no tiene página ni aparece en filtros. */
export const listBrands = cache(() => db.select().from(brands).where(eq(brands.active, true)).orderBy(asc(brands.name)));

export async function getBrandBySlug(slug: string): Promise<Brand | null> {
  return (await listBrands()).find((b) => b.slug === slug) ?? null;
}
