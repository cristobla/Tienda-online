import Link from "next/link";
import { ATTR_PREFIX, parseCatalogParams, SORTS, type Sort } from "@/modules/catalog/params";
import { getFacets, listProducts, resolveFilters, type Scope } from "@/modules/catalog/queries";
import { formatCLP } from "@/modules/chile";
import { AutoSubmitForm } from "./auto-submit-form";
import { ProductGrid } from "./product-card";

export type SP = Record<string, string | string[] | undefined>;

/** Misma URL con algunos parámetros cambiados (null = quitar). */
export function hrefWith(path: string, sp: SP, changes: Record<string, string | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (!(k in changes)) for (const x of [v ?? []].flat()) u.append(k, x);
  for (const [k, v] of Object.entries(changes)) if (v !== null) u.set(k, v);
  const qs = u.toString();
  return qs ? `${path}?${qs}` : path;
}

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Ruta" className="mb-3 text-sm text-muted">
      <ol className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? (
              <Link href={it.href} className="hover:text-leaf hover:underline">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page">{it.name}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const box = "size-4 accent-leaf";

/** Listado con filtros, orden y paginación. Lo usan /productos, /categoria/[slug] y /marca/[slug]. */
export async function CatalogView({
  path,
  scope,
  searchParams,
  header,
}: {
  path: string;
  scope: Omit<Scope, "q">;
  searchParams: SP;
  header: React.ReactNode;
}) {
  const params = parseCatalogParams(searchParams);
  const fullScope = { ...scope, q: params.q };
  const sort: Sort = params.sort ?? (params.q ? "relevancia" : "destacados");
  const filters = await resolveFilters(params);
  const [result, facets] = await Promise.all([listProducts(fullScope, filters, { sort, page: params.page }), getFacets(fullScope)]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const checked = (key: string, value: string) => [searchParams[key] ?? []].flat().includes(value);
  const activeFilters = params.brandSlugs.length + Object.keys(params.attrs).length + (params.inStock ? 1 : 0) + (params.minPrice !== undefined || params.maxPrice !== undefined ? 1 : 0);

  return (
    <>
      {header}
      <AutoSubmitForm action={path} className="mt-6 grid gap-x-10 lg:grid-cols-[15rem_1fr]">
        {params.q && <input type="hidden" name="q" value={params.q} />}

        {/* En móvil los filtros se despliegan con este interruptor (sin JavaScript). */}
        <input id="ver-filtros" type="checkbox" className="peer sr-only" />
        <label
          htmlFor="ver-filtros"
          className="mb-4 inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-2 font-medium peer-focus-visible:outline-3 peer-focus-visible:outline-leaf lg:hidden"
        >
          Filtros{activeFilters > 0 && ` (${activeFilters})`}
        </label>

        <aside className="mb-8 hidden space-y-7 text-sm peer-checked:block lg:mb-0 lg:block">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name="disponible" value="1" defaultChecked={params.inStock} className={box} />
            Solo productos con stock
          </label>

          {!scope.brandId && facets.brands.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-bold">Marca</legend>
              <ul className="space-y-1.5">
                {facets.brands.map((b) => (
                  <li key={b.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="marca" value={b.slug} defaultChecked={checked("marca", b.slug)} className={box} />
                      {b.name} <span className="text-muted">({b.count})</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}

          {facets.price && facets.price.max > facets.price.min && (
            <fieldset>
              <legend className="mb-2 font-bold">Precio</legend>
              <div className="flex items-center gap-2">
                {(["precio_min", "precio_max"] as const).map((name, i) => (
                  <label key={name} className="min-w-0 flex-1">
                    <span className="sr-only">{i ? "Precio máximo" : "Precio mínimo"}</span>
                    <input
                      type="number"
                      name={name}
                      min={0}
                      step={10}
                      inputMode="numeric"
                      defaultValue={i ? params.maxPrice : params.minPrice}
                      placeholder={formatCLP(i ? facets.price!.max : facets.price!.min)}
                      className="w-full rounded-md border border-line px-2 py-1.5"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {facets.attributes.map(({ def, values }) => (
            <fieldset key={def.code}>
              <legend className="mb-2 font-bold">{def.label}</legend>
              <ul className="space-y-1.5">
                {values.map((v) => (
                  <li key={v.value}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name={ATTR_PREFIX + def.code}
                        value={v.value}
                        defaultChecked={checked(ATTR_PREFIX + def.code, v.value)}
                        className={box}
                      />
                      {def.type === "BOOLEAN" ? (v.value === "true" ? "Sí" : "No") : v.value}
                      {def.unit && ` ${def.unit}`} <span className="text-muted">({v.count})</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}

          <div className="flex items-center gap-4">
            <button className="rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf-dark">Aplicar</button>
            {activeFilters > 0 && (
              <Link href={params.q ? `${path}?q=${encodeURIComponent(params.q)}` : path} className="text-leaf underline">
                Quitar filtros
              </Link>
            )}
          </div>
        </aside>

        <section aria-label="Resultados">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-sm text-muted" aria-live="polite">
              {result.total === 1 ? "1 producto" : `${result.total} productos`}
            </p>
            <label className="flex items-center gap-2 text-sm">
              Ordenar por
              <select name="orden" defaultValue={sort} className="rounded-md border border-line bg-white px-2 py-1.5">
                {Object.entries(SORTS)
                  .filter(([k]) => k !== "relevancia" || params.q)
                  .map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {result.items.length ? (
            <ProductGrid products={result.items} />
          ) : (
            <div className="rounded-md bg-mist p-8">
              <p className="text-lg font-semibold">
                {params.q ? `No encontramos productos para «${params.q}».` : "No hay productos con estos filtros."}
              </p>
              <p className="mt-1 text-muted">
                {params.q ? "Revisa la ortografía o prueba con una palabra más general." : "Quita algún filtro para ver más resultados."}
              </p>
              <Link href="/productos" className="mt-4 inline-block font-semibold text-leaf underline">
                Ver todo el catálogo
              </Link>
            </div>
          )}

          {pages > 1 && (
            <nav aria-label="Páginas" className="mt-12 flex items-center justify-center gap-6 text-sm">
              {result.page > 1 ? (
                <Link href={hrefWith(path, searchParams, { pagina: String(result.page - 1) })} rel="prev" className="font-semibold text-leaf underline">
                  Anterior
                </Link>
              ) : (
                <span className="text-muted">Anterior</span>
              )}
              <span>
                Página {result.page} de {pages}
              </span>
              {result.page < pages ? (
                <Link href={hrefWith(path, searchParams, { pagina: String(result.page + 1) })} rel="next" className="font-semibold text-leaf underline">
                  Siguiente
                </Link>
              ) : (
                <span className="text-muted">Siguiente</span>
              )}
            </nav>
          )}
        </section>
      </AutoSubmitForm>
    </>
  );
}
