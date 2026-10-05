import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, CatalogView, type SP } from "@/components/store/catalog-view";
import { getBrandBySlug } from "@/modules/brands/queries";
import { loadCategories } from "@/modules/categories/queries";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await getBrandBySlug((await params).slug);
  if (!brand) return {};
  return { title: brand.name, description: brand.description ?? undefined, alternates: { canonical: `/marca/${brand.slug}` } };
}

export default async function BrandPage({ params, searchParams }: Props) {
  const brand = await getBrandBySlug((await params).slug);
  if (!brand) notFound();
  const { visibleIds } = await loadCategories();

  return (
    <CatalogView
      path={`/marca/${brand.slug}`}
      scope={{ categoryIds: visibleIds, brandId: brand.id }}
      searchParams={await searchParams}
      header={
        <>
          <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Marcas" }, { name: brand.name }]} />
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{brand.name}</h1>
          {brand.description && <p className="mt-2 max-w-prose text-muted">{brand.description}</p>}
        </>
      }
    />
  );
}
