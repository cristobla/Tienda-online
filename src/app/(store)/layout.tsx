import { StoreFooter, StoreHeader } from "@/components/store/shell";
import { cartItemCount, currentCartId } from "@/modules/cart";
import { loadCategories } from "@/modules/categories/queries";

// El catálogo se lee de la base en cada visita (stock y precios al día).
// ponytail: sin caché de páginas; agregar "use cache" + revalidación al editar si el tráfico lo exige.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [{ roots }, cartCount] = await Promise.all([loadCategories(), currentCartId().then(cartItemCount)]);
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:font-semibold focus:text-white">
        Saltar al contenido
      </a>
      <StoreHeader roots={roots} cartCount={cartCount} />
      <main id="contenido" className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>
      <StoreFooter roots={roots} />
    </>
  );
}
