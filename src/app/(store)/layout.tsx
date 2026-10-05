import Link from "next/link";
import { SITE } from "@/lib/site";
import { loadCategories } from "@/modules/categories/queries";

// El catálogo se lee de la base en cada visita (stock y precios al día).
// ponytail: sin caché de páginas; agregar "use cache" + revalidación al editar si el tráfico lo exige.
export const dynamic = "force-dynamic";

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const { roots } = await loadCategories();
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-2">
        Saltar al contenido
      </a>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
          <Link href="/" className="text-2xl font-extrabold tracking-tight text-leaf [font-stretch:80%]">
            {SITE.name}
          </Link>
          <form action="/productos" role="search" className="order-last flex w-full md:order-none md:max-w-xl md:flex-1">
            <label htmlFor="buscar" className="sr-only">
              Buscar productos
            </label>
            <input
              id="buscar"
              name="q"
              type="search"
              placeholder="Busca por producto, marca o código"
              className="min-w-0 flex-1 rounded-l-md border border-r-0 border-line bg-mist px-4 py-2.5 placeholder:text-muted focus:bg-white"
            />
            <button className="rounded-r-md bg-leaf px-5 font-semibold text-white hover:bg-leaf-dark">Buscar</button>
          </form>
        </div>
        <nav aria-label="Categorías" className="mx-auto max-w-7xl overflow-x-auto px-4">
          <ul className="flex gap-6 whitespace-nowrap pb-3 text-sm font-medium">
            <li>
              <Link href="/productos" className="hover:text-leaf">
                Todo
              </Link>
            </li>
            {roots.map((c) => (
              <li key={c.id}>
                <Link href={`/categoria/${c.slug}`} className="hover:text-leaf">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="contenido" className="mx-auto max-w-7xl px-4 py-8">
        {children}
      </main>

      <footer className="mt-16 border-t border-line bg-mist">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
          <div>
            <p className="font-bold text-leaf">{SITE.name}</p>
            <p className="mt-2 max-w-xs text-muted">{SITE.description}</p>
          </div>
          <nav aria-label="Categorías del pie">
            <ul className="space-y-1.5">
              {roots.map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className="hover:text-leaf">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-muted">Precios en pesos chilenos con IVA incluido.</p>
        </div>
      </footer>
    </>
  );
}
