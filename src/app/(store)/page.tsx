import Link from "next/link";
import { ProductGrid } from "@/components/store/product-card";
import { listBrands } from "@/modules/brands/queries";
import { listProducts } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";

export default async function Home() {
  const { roots, visibleIds } = await loadCategories();
  const [featured, brands] = await Promise.all([
    listProducts({ categoryIds: visibleIds }, { featured: true }, { pageSize: 8 }),
    listBrands(),
  ]);

  return (
    <>
      <section className="-mx-4 -mt-8 bg-mist px-4 pb-12 pt-14 sm:pb-16 sm:pt-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight [font-stretch:85%] sm:text-6xl">¿Qué te falta en casa?</h1>
          <form action="/productos" role="search" className="mt-8 flex">
            <label htmlFor="buscar-inicio" className="sr-only">
              Buscar productos
            </label>
            <input
              id="buscar-inicio"
              name="q"
              type="search"
              placeholder="Lavalozas, shampoo, papel higiénico…"
              className="min-w-0 flex-1 rounded-l-md border-2 border-r-0 border-leaf bg-white px-5 py-4 text-lg placeholder:text-muted"
            />
            <button className="rounded-r-md bg-leaf px-6 text-lg font-semibold text-white hover:bg-leaf-dark sm:px-8">Buscar</button>
          </form>
          <p className="mt-4 text-muted">Compara por formato y precio por litro o kilo antes de elegir.</p>
        </div>
      </section>

      <section aria-labelledby="categorias" className="mt-14">
        <h2 id="categorias" className="mb-6 text-2xl font-bold">
          Categorías
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {roots.map((c) => (
            <div key={c.id} className="border-t-4 border-leaf pt-4">
              <Link href={`/categoria/${c.slug}`} className="text-xl font-bold hover:text-leaf hover:underline">
                {c.name}
              </Link>
              {c.children.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-muted">
                  {c.children.map((sub) => (
                    <li key={sub.id}>
                      <Link href={`/categoria/${sub.slug}`} className="hover:text-leaf hover:underline">
                        {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {featured.items.length > 0 && (
        <section aria-labelledby="destacados" className="mt-16">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <h2 id="destacados" className="text-2xl font-bold">
              Destacados
            </h2>
            <Link href="/productos" className="font-semibold text-leaf underline">
              Ver todos los productos
            </Link>
          </div>
          <ProductGrid products={featured.items} />
        </section>
      )}

      {brands.length > 0 && (
        <section aria-labelledby="marcas" className="mt-16">
          <h2 id="marcas" className="mb-4 text-2xl font-bold">
            Marcas
          </h2>
          <ul className="flex flex-wrap gap-2">
            {brands.map((b) => (
              <li key={b.id}>
                <Link href={`/marca/${b.slug}`} className="inline-block rounded-full border border-line px-4 py-1.5 text-sm font-medium hover:border-leaf hover:text-leaf">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
