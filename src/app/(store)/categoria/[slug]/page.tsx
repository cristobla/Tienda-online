import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, CatalogView, type SP } from "@/components/store/catalog-view";
import { getCategoryBySlug, subtreeIds } from "@/modules/categories/queries";

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
  const found = await getCategoryBySlug((await params).slug);
  if (!found) notFound();
  const { category, path } = found;

  return (
    <CatalogView
      path={`/categoria/${category.slug}`}
      scope={{ categoryIds: subtreeIds(category) }}
      searchParams={await searchParams}
      header={
        <>
          <Breadcrumbs
            items={[
              { name: "Inicio", href: "/" },
              ...path.slice(0, -1).map((c) => ({ name: c.name, href: `/categoria/${c.slug}` })),
              { name: category.name },
            ]}
          />
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{category.name}</h1>
          {category.description && <p className="mt-2 max-w-prose text-muted">{category.description}</p>}
          {category.children.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {category.children.map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className="inline-block rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:border-leaf hover:text-leaf">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      }
    />
  );
}
