import type { Metadata } from "next";
import { Breadcrumbs, CatalogView, type SP } from "@/components/store/catalog-view";
import { loadCategories } from "@/modules/categories/queries";

type Props = { searchParams: Promise<SP> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = [(await searchParams).q].flat()[0]?.trim();
  return q
    ? { title: `Resultados para «${q.slice(0, 60)}»`, robots: { index: false, follow: true } }
    : { title: "Todos los productos", alternates: { canonical: "/productos" } };
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = [sp.q].flat()[0]?.trim();
  const { visibleIds } = await loadCategories();
  return (
    <CatalogView
      path="/productos"
      scope={{ categoryIds: visibleIds }}
      searchParams={sp}
      header={
        <>
          <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: q ? "Búsqueda" : "Todos los productos" }]} />
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{q ? `Resultados para «${q}»` : "Todos los productos"}</h1>
        </>
      }
    />
  );
}
