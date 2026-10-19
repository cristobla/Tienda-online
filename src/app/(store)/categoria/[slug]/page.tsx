import type { Metadata } from "next";
import { CatalogTitle, CatalogView, type SP, SubcategoryLinks } from "@/components/store/catalog-view";
import { redirectFromOldSlug } from "@/modules/catalog/redirects";
import { getCategoryBySlug, loadCategories, subtreeIds } from "@/modules/categories/queries";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await getCategoryBySlug((await params).slug);
  if (!found) return {};
  const { category: c } = found;
  return {
    title: c.metaTitle ?? c.name,
    description: c.metaDescription ?? c.description ?? undefined,
    alternates: { canonical: `/categoria/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const found = await getCategoryBySlug(slug);
  if (!found) return redirectFromOldSlug("category", "/categoria/", slug, await searchParams);
  const { category, path } = found;
  const { navIds } = await loadCategories();

  return (
    <CatalogView
      path={`/categoria/${category.slug}`}
      scope={{ categoryIds: subtreeIds(category) }}
      searchParams={await searchParams}
      aisle={`/categoria/${path[0]!.slug}`}
      header={
        <CatalogTitle
          crumbs={[
            { name: "Inicio", href: "/" },
            ...path.slice(0, -1).map((c) => ({ name: c.name, href: `/categoria/${c.slug}` })),
            { name: category.name },
          ]}
          title={category.name}
          description={category.description}
        >
          <SubcategoryLinks items={category.children.filter((c) => navIds.has(c.id))} />
        </CatalogTitle>
      }
    />
  );
}
