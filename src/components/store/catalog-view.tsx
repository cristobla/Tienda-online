import Link from "next/link";
import { Icon } from "@/components/icons";
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

/** Misma URL sin un valor puntual de un parámetro repetible (?marca=a&marca=b → quitar b). Vuelve a la página 1. */
function hrefWithout(path: string, sp: SP, key: string, value?: string) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "pagina") continue;
    for (const x of [v ?? []].flat()) if (!(k === key && (value === undefined || x === value))) u.append(k, x);
  }
  const qs = u.toString();
  return qs ? `${path}?${qs}` : path;
}

export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Ruta" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <Icon name="chevron" className="size-3.5 opacity-60" />}
            {it.href ? (
              <Link href={it.href} className="hover:text-leaf hover:underline">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const box = "size-4 shrink-0 accent-leaf";
const group = "border-b border-line px-4 py-4 last:border-b-0";

/** Páginas a mostrar: primera, última y vecinas de la actual, con huecos (null) entre medio. */
function pageList(page: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) out.push(n);
    else if (out.at(-1) !== null) out.push(null);
  }
  return out;
}

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

  // Filtros activos como chips que se quitan con un enlace (sin JavaScript).
  const chips: { label: string; href: string }[] = [
    ...params.brandSlugs.map((slug) => ({
      label: facets.brands.find((b) => b.slug === slug)?.name ?? slug,
      href: hrefWithout(path, searchParams, "marca", slug),
    })),
    ...Object.entries(params.attrs).flatMap(([code, values]) => {
      const def = facets.attributes.find((a) => a.def.code === code)?.def;
      return values.map((v) => ({
        label: `${def?.label ?? code}: ${def?.type === "BOOLEAN" ? (v === "true" ? "Sí" : "No") : v}`,
        href: hrefWithout(path, searchParams, ATTR_PREFIX + code, v),
      }));
    }),
    ...(params.inStock ? [{ label: "Con stock", href: hrefWithout(path, searchParams, "disponible") }] : []),
    ...(params.minPrice !== undefined ? [{ label: `Desde ${formatCLP(params.minPrice)}`, href: hrefWithout(path, searchParams, "precio_min") }] : []),
    ...(params.maxPrice !== undefined ? [{ label: `Hasta ${formatCLP(params.maxPrice)}`, href: hrefWithout(path, searchParams, "precio_max") }] : []),
  ];
  const clearHref = params.q ? `${path}?q=${encodeURIComponent(params.q)}` : path;

  return (
    <>
      {header}
      <div className="mt-6 grid grid-cols-1 items-start gap-x-8 lg:grid-cols-[16rem_1fr]">
        {/* El formulario envuelve solo los filtros: la grilla tiene sus propios formularios (agregar al carrito)
            y un <form> no puede ir dentro de otro. "Ordenar por" se asocia con el atributo form="filtros". */}
        <AutoSubmitForm id="filtros" action={path} className="lg:sticky lg:top-4">
          {params.q && <input type="hidden" name="q" value={params.q} />}

          {/* En móvil los filtros se despliegan con este interruptor (sin JavaScript). */}
          <input id="ver-filtros" type="checkbox" className="peer sr-only" />
          <label
            htmlFor="ver-filtros"
            className="mb-4 inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-line bg-white px-4 py-2.5 font-semibold peer-focus-visible:outline-3 peer-focus-visible:outline-leaf lg:hidden"
          >
            <Icon name="sliders" />
            Filtrar{chips.length > 0 && ` (${chips.length})`}
          </label>

          <aside aria-label="Filtros" className="mb-6 hidden rounded-md border border-line bg-white text-sm peer-checked:block lg:mb-0 lg:block">
            <p className="flex items-center gap-2 border-b border-line px-4 py-3 font-bold">
              <Icon name="sliders" className="size-4" />
              Filtros
            </p>
            <div className={group}>
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" name="disponible" value="1" defaultChecked={params.inStock} className={box} />
                Solo productos con stock
              </label>
            </div>

            {!scope.brandId && facets.brands.length > 0 && (
              <fieldset className={group}>
                <legend className="float-left mb-2 w-full font-bold">Marca</legend>
                <ul className="clear-both space-y-2">
                  {facets.brands.map((b) => (
                    <li key={b.id}>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" name="marca" value={b.slug} defaultChecked={checked("marca", b.slug)} className={box} />
                        <span className="flex-1">{b.name}</span>
                        <span className="text-xs text-muted">{b.count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            {facets.price && facets.price.max > facets.price.min && (
              <fieldset className={group}>
                <legend className="float-left mb-2 w-full font-bold">Precio</legend>
                <div className="clear-both flex items-center gap-2">
                  {(["precio_min", "precio_max"] as const).map((name, i) => (
                    <label key={name} className="min-w-0 flex-1">
                      <span className="mb-1 block text-xs text-muted">{i ? "Hasta" : "Desde"}</span>
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
              <fieldset key={def.code} className={group}>
                <legend className="float-left mb-2 w-full font-bold">{def.label}</legend>
                <ul className="clear-both space-y-2">
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
                        <span className="flex-1">
                          {def.type === "BOOLEAN" ? (v.value === "true" ? "Sí" : "No") : v.value}
                          {def.unit && ` ${def.unit}`}
                        </span>
                        <span className="text-xs text-muted">{v.count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}

            <div className="flex items-center gap-4 px-4 py-4">
              <button className="rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf-dark">Aplicar</button>
              {chips.length > 0 && (
                <Link href={clearHref} className="font-medium text-leaf underline">
                  Quitar filtros
                </Link>
              )}
            </div>
          </aside>
        </AutoSubmitForm>

        <section aria-label="Resultados" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-2.5">
            <p className="text-sm font-semibold" aria-live="polite">
              {result.total === 1 ? "1 producto" : `${result.total} productos`}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Ordenar por</span>
              <select name="orden" form="filtros" defaultValue={sort} className="rounded-md border border-line bg-white px-2 py-1.5 font-medium">
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

          {chips.length > 0 && (
            <ul aria-label="Filtros activos" className="mb-5 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <li key={c.href + c.label}>
                  <Link href={c.href} className="inline-flex items-center gap-1.5 rounded-sm bg-leaf-soft px-2.5 py-1 text-sm font-medium text-leaf-dark hover:bg-leaf hover:text-white">
                    {c.label}
                    <Icon name="close" className="size-3.5" />
                    <span className="sr-only">(quitar)</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href={clearHref} className="text-sm font-medium text-muted underline hover:text-leaf">
                  Limpiar todo
                </Link>
              </li>
            </ul>
          )}

          {result.items.length ? (
            <ProductGrid products={result.items} />
          ) : (
            <EmptyResults q={params.q} />
          )}

          {pages > 1 && (
            <nav aria-label="Páginas" className="mt-10 flex flex-wrap items-center justify-center gap-1.5 text-sm">
              {result.page > 1 && (
                <Link href={hrefWith(path, searchParams, { pagina: String(result.page - 1) })} rel="prev" className="rounded-md border border-line bg-white px-3 py-2 font-semibold hover:border-leaf">
                  Anterior
                </Link>
              )}
              {pageList(result.page, pages).map((n, i) =>
                n === null ? (
                  <span key={`gap${i}`} className="px-1 text-muted">
                    …
                  </span>
                ) : n === result.page ? (
                  <span key={n} aria-current="page" className="grid size-9 place-items-center rounded-md bg-leaf font-bold text-white">
                    {n}
                  </span>
                ) : (
                  <Link key={n} href={hrefWith(path, searchParams, { pagina: String(n) })} className="grid size-9 place-items-center rounded-md border border-line bg-white hover:border-leaf">
                    <span className="sr-only">Página </span>
                    {n}
                  </Link>
                ),
              )}
              {result.page < pages && (
                <Link href={hrefWith(path, searchParams, { pagina: String(result.page + 1) })} rel="next" className="rounded-md border border-line bg-white px-3 py-2 font-semibold hover:border-leaf">
                  Siguiente
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}

function EmptyResults({ q }: { q?: string }) {
  return (
    <div className="grid place-items-center rounded-md border border-dashed border-line bg-paper px-6 py-14 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-white text-muted">
        <Icon name="search" className="size-7" />
      </span>
      <p className="mt-4 text-lg font-bold">{q ? `No encontramos productos para «${q}».` : "No hay productos con estos filtros."}</p>
      <p className="mt-1 max-w-sm text-muted">{q ? "Revisa la ortografía o prueba con una palabra más general." : "Quita algún filtro para ver más resultados."}</p>
      <Link href="/productos" className="mt-5 rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf-dark">
        Ver todo el catálogo
      </Link>
    </div>
  );
}

/** Encabezado común de las páginas de listado. */
export function CatalogTitle({
  crumbs,
  title,
  description,
  children,
}: {
  crumbs: { name: string; href?: string }[];
  title: string;
  description?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="bleed -mt-8 border-b border-line bg-paper py-6">
      <Breadcrumbs items={crumbs} />
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
      {description && <p className="mt-2 max-w-prose text-muted">{description}</p>}
      {children}
    </div>
  );
}

/** Subcategorías como accesos rápidos bajo el título. */
export function SubcategoryLinks({ items }: { items: { id: string; slug: string; name: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-5 flex flex-wrap gap-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link href={`/categoria/${c.slug}`} className="inline-block rounded-sm border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-leaf hover:text-leaf">
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
