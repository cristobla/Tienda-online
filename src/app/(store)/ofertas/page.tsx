import type { Metadata } from "next";
import { CatalogTitle, CatalogView, type SP } from "@/components/store/catalog-view";
import { loadCategories } from "@/modules/categories/queries";

export const metadata: Metadata = {
  title: "Ofertas",
  description: "Productos de higiene, cuidado personal y aseo del hogar con precio rebajado.",
  alternates: { canonical: "/ofertas" },
};

/** Productos cuya variante más barata tiene precio anterior mayor (se marca en la ficha del producto, «Precio anterior»). */
export default async function OffersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { visibleIds } = await loadCategories();
  return (
    <CatalogView
      path="/ofertas"
      scope={{ categoryIds: visibleIds, onSale: true }}
      searchParams={await searchParams}
      header={<CatalogTitle crumbs={[{ name: "Inicio", href: "/" }, { name: "Ofertas" }]} title="Ofertas" />}
    />
  );
}
