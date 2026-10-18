import type { Metadata } from "next";
import { CatalogTitle, CatalogView, type SP } from "@/components/store/catalog-view";
import { getBrandBySlug } from "@/modules/brands/queries";
import { redirectFromOldSlug } from "@/modules/catalog/redirects";
import { loadCategories } from "@/modules/categories/queries";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await getBrandBySlug((await params).slug);
  if (!brand) return {};
  return { title: brand.name, description: brand.description ?? undefined, alternates: { canonical: `/marca/${brand.slug}` } };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const brand = await getBrandBySlug(slug);
  if (!brand) return redirectFromOldSlug("brand", "/marca/", slug, await searchParams);
  const { visibleIds } = await loadCategories();

  return (
    <CatalogView
      path={`/marca/${brand.slug}`}
      scope={{ categoryIds: visibleIds, brandId: brand.id }}
      searchParams={await searchParams}
      header={<CatalogTitle crumbs={[{ name: "Inicio", href: "/" }, { name: "Marcas" }, { name: brand.name }]} title={brand.name} description={brand.description} />}
    />
  );
}
