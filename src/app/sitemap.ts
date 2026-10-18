import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { listBrands } from "@/modules/brands/queries";
import { listPublicSlugs } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";
import { listInfoPages } from "@/modules/settings";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ bySlug }, brands, products, pages] = await Promise.all([loadCategories(), listBrands(), listPublicSlugs(), listInfoPages()]);
  const u = (path: string) => `${env.APP_URL}${path}`;
  return [
    { url: u("/"), changeFrequency: "daily", priority: 1 },
    { url: u("/productos"), changeFrequency: "daily" },
    ...[...bySlug.values()].map((c) => ({ url: u(`/categoria/${c.slug}`), lastModified: c.updatedAt })),
    ...brands.map((b) => ({ url: u(`/marca/${b.slug}`), lastModified: b.updatedAt })),
    ...products.map((p) => ({ url: u(`/producto/${p.slug}`), lastModified: p.updatedAt })),
    // Solo las que ya tienen texto oficial (las vacías son noindex).
    ...pages.filter((p) => p.filled).map((p) => ({ url: u(`/info/${p.slug}`), lastModified: p.updatedAt ?? undefined })),
  ];
}
