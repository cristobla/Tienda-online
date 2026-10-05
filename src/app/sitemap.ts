import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { listBrands } from "@/modules/brands/queries";
import { listPublicSlugs } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ bySlug }, brands, products] = await Promise.all([loadCategories(), listBrands(), listPublicSlugs()]);
  const u = (path: string) => `${env.APP_URL}${path}`;
  return [
    { url: u("/"), changeFrequency: "daily", priority: 1 },
    { url: u("/productos"), changeFrequency: "daily" },
    ...[...bySlug.values()].map((c) => ({ url: u(`/categoria/${c.slug}`), lastModified: c.updatedAt })),
    ...brands.map((b) => ({ url: u(`/marca/${b.slug}`), lastModified: b.updatedAt })),
    ...products.map((p) => ({ url: u(`/producto/${p.slug}`), lastModified: p.updatedAt })),
  ];
}
