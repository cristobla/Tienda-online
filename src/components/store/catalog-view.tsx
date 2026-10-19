import Link from "next/link";
import { Icon } from "@/components/icons";
import { ATTR_PREFIX, parseCatalogParams, SORTS, type Sort } from "@/modules/catalog/params";
import { getFacets, listProducts, resolveFilters, type Scope } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";
import { formatCLP } from "@/modules/chile";
import { AutoSubmitForm } from "./auto-submit-form";
import { AisleTabs, CatalogBusy, CatalogFixed, CatalogLink, CatalogResults } from "./catalog-motion";
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
              <Link href={it.href} className="transition-colors hover:text-leaf-dark hover:underline">
                {it.name}
              </Link>
            ) : (
              <span aria-current="page" className="font-semibold text-ink">
                {it.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const box = "size-[1.1rem] shrink-0 accent-leaf";
const group = "border-b border-line px-5 py-5 last:border-b-0";
const legend = "etiqueta float-left mb-3 w-full text-ink";
const pill = "grid size-10 place-items-center rounded-full";

/** Páginas a mostrar: primera, última y vecinas de la actual, con huecos (null) entre medio. */
function pageList(page: number, pages: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) out.push(n);
    else if (out.at(-1) !== null) out.push(null);
  }
  return out;
}

/**
 * Listado con filtros, orden y paginación. Lo usan /productos, /categoria/[slug], /marca/[slug] y /ofertas.
 * `aisle`: pasillo raíz que se está mostrando ("/productos" = Todos) para la barra de pasillos; sin él no se muestra.
 * Cambiar de pasillo, filtro, orden o página transforma este mismo catálogo (ver catalog-motion.tsx y ProductGrid).
 */
export async function CatalogView({
  path,
  scope,
  searchParams,
  header,
  aisle,
}: {
  path: string;
  scope: Omit<Scope, "q">;
  searchParams: SP;
  header: React.ReactNode;
  aisle?: string;
}) {
  const params = parseCatalogParams(searchParams);
  const fullScope = { ...scope, q: params.q };
  const sort: Sort = params.sort ?? (params.q ? "relevancia" : "destacados");
  const filters = await resolveFilters(params);
  const [result, facets, { nav }] = await Promise.all([listProducts(fullScope, filters, { sort, page: params.page }), getFacets(fullScope), loadCategories()]);
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

  // Pasillos: la búsqueda se conserva al cambiar de pasillo; los demás filtros no (pueden no existir en el otro).
  const keepQ = params.q ? `?q=${encodeURIComponent(params.q)}` : "";
  const aisles = [
    { href: "/productos", name: "Todos" },
    ...nav.map((c, i) => ({ href: `/categoria/${c.slug}`, name: c.name, number: String(i + 1).padStart(2, "0") })),
  ].map((a) => ({ ...a, href: a.href + keepQ }));

  return (
    <CatalogBusy>
      <CatalogFixed name="titulo">{header}</CatalogFixed>
      {aisle !== undefined && (
        <CatalogFixed name="pasillos">
          <div className="mt-6">
            <AisleTabs items={aisles} current={aisle + keepQ} />
          </div>
        </CatalogFixed>
      )}
      <div className={`${aisle !== undefined ? "mt-2" : "mt-8"} grid grid-cols-1 items-start gap-x-10 lg:grid-cols-[17rem_1fr]`}>
        {/* El formulario envuelve solo los filtros: la grilla tiene sus propios formularios (agregar al carrito)
            y un <form> no puede ir dentro de otro. "Ordenar por" se asocia con el atributo form="filtros". */}
        <CatalogFixed name="filtros">
        <AutoSubmitForm id="filtros" action={path} className="lg:sticky lg:top-4">
          {params.q && <input type="hidden" name="q" value={params.q} />}

          {/* En móvil los filtros se despliegan con este interruptor (sin JavaScript). */}
          <input id="ver-filtros" type="checkbox" className="peer sr-only" />
          <label
            htmlFor="ver-filtros"
            className="btn-line mb-4 w-fit cursor-pointer px-4 py-2.5 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-leaf lg:hidden"
          >
            <Icon name="sliders" />
            Filtrar{chips.length > 0 && ` (${chips.length})`}
          </label>

          <aside aria-label="Filtros" className="mb-6 hidden animate-drop-in overflow-hidden rounded-[1.25rem] bg-white text-sm ring-1 ring-line peer-checked:block lg:mb-0 lg:block lg:animate-none">
            <p className="flex items-center gap-2 border-b border-line bg-paper px-5 py-3.5 font-bold">
              <Icon name="sliders" className="size-4 text-leaf" />
              Filtros
            </p>
            <div className={group}>
              <label className="flex items-center gap-2.5 font-semibold">
                <input type="checkbox" name="disponible" value="1" defaultChecked={params.inStock} className={box} />
                Solo productos con stock
              </label>
            </div>

            {!scope.brandId && facets.brands.length > 0 && (
              <fieldset className={group}>
                <legend className={legend}>Marca</legend>
                <ul className="clear-both space-y-2.5">
                  {facets.brands.map((b) => (
                    <li key={b.id}>
                      <label className="flex items-center gap-2.5">
                        <input type="checkbox" name="marca" value={b.slug} defaultChecked={checked("marca", b.slug)} className={box} />
                        <span className="flex-1">{b.name}</span>
                        <span className="rounded-full bg-mist px-2 text-xs text-muted">{b.count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}

            {facets.price && facets.price.max > facets.price.min && (
              <fieldset className={group}>
                <legend className={legend}>Precio</legend>
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
                        className="w-full rounded-full border-[1.5px] border-line px-3 py-1.5 transition-colors hover:border-muted/50 focus:border-leaf"
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {facets.attributes.map(({ def, values }) => (
              <fieldset key={def.code} className={group}>
                <legend className={legend}>{def.label}</legend>
                <ul className="clear-both space-y-2.5">
                  {values.map((v) => (
                    <li key={v.value}>
                      <label className="flex items-center gap-2.5">
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
                        <span className="rounded-full bg-mist px-2 text-xs text-muted">{v.count}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}

            <div className="flex items-center gap-4 px-5 py-4">
              <button className="btn-ink px-5 py-2">Aplicar</button>
              {chips.length > 0 && (
                <CatalogLink href={clearHref} scroll={false} className="font-semibold text-leaf-dark underline-offset-2 hover:underline">
                  Quitar filtros
                </CatalogLink>
              )}
            </div>
          </aside>
        </AutoSubmitForm>
        </CatalogFixed>

        <CatalogResults total={result.total}>
          <CatalogFixed name="barra">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
            <p className="text-sm text-muted">
              <span className="rotulo mr-1.5 text-3xl leading-none text-ink">{result.total}</span>
              {result.total === 1 ? "producto" : "productos"}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Ordenar por</span>
              <select
                name="orden"
                form="filtros"
                defaultValue={sort}
                className="rounded-full border-[1.5px] border-line bg-white py-1.5 pl-3 pr-2 font-semibold transition-colors hover:border-ink"
              >
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
          </CatalogFixed>

          {/* Sin clave por URL: la grilla no se reemplaza entera; cada tarjeta tiene nombre y viaja, sale o entra. */}
            <div>
              {chips.length > 0 && (
                <ul aria-label="Filtros activos" className="mb-6 flex flex-wrap items-center gap-2">
                  {chips.map((c) => (
                    <li key={c.href + c.label}>
                      <CatalogLink
                        href={c.href}
                        scroll={false}
                        className="inline-flex items-center gap-1.5 rounded-full bg-leaf-soft px-3 py-1.5 text-sm font-semibold text-leaf-dark transition-colors hover:bg-ink hover:text-white"
                      >
                        {c.label}
                        <Icon name="close" className="size-3.5" />
                        <span className="sr-only">(quitar)</span>
                      </CatalogLink>
                    </li>
                  ))}
                  <li>
                    <CatalogLink href={clearHref} scroll={false} className="ml-1 text-sm font-medium text-muted underline underline-offset-2 hover:text-ink">
                      Limpiar todo
                    </CatalogLink>
                  </li>
                </ul>
              )}

              {result.items.length ? <ProductGrid products={result.items} named /> : <EmptyResults q={params.q} />}

              {pages > 1 && (
                <nav aria-label="Páginas" className="mt-12 flex flex-wrap items-center justify-center gap-2 text-sm">
                  {result.page > 1 && (
                    <CatalogLink href={hrefWith(path, searchParams, { pagina: String(result.page - 1) })} rel="prev" scroll={false} className="btn-line px-4 py-2">
                      Anterior
                    </CatalogLink>
                  )}
                  {pageList(result.page, pages).map((n, i) =>
                    n === null ? (
                      <span key={`gap${i}`} className="px-1 text-muted">
                        …
                      </span>
                    ) : n === result.page ? (
                      <span key={n} aria-current="page" className={`${pill} bg-ink font-bold text-white`}>
                        {n}
                      </span>
                    ) : (
                      <CatalogLink key={n} href={hrefWith(path, searchParams, { pagina: String(n) })} scroll={false} className={`${pill} bg-white font-semibold ring-1 ring-line transition-shadow hover:ring-ink`}>
                        <span className="sr-only">Página </span>
                        {n}
                      </CatalogLink>
                    ),
                  )}
                  {result.page < pages && (
                    <CatalogLink href={hrefWith(path, searchParams, { pagina: String(result.page + 1) })} rel="next" scroll={false} className="btn-line px-4 py-2">
                      Siguiente
                    </CatalogLink>
                  )}
                </nav>
              )}
            </div>
        </CatalogResults>
      </div>
    </CatalogBusy>
  );
}

function EmptyResults({ q }: { q?: string }) {
  return (
    <div className="relative grid place-items-center overflow-hidden rounded-[1.5rem] bg-paper px-6 py-16 text-center">
      <div aria-hidden className="ondas absolute inset-0 [--ondas-x:50%] [--ondas-y:30%]" />
      <span className="relative grid size-16 place-items-center rounded-full bg-white text-leaf ring-1 ring-line">
        <Icon name="search" className="size-7" />
      </span>
      <p className="rotulo relative mt-5 text-title">{q ? `No encontramos productos para «${q}»` : "Este pasillo quedó vacío"}</p>
      <p className="relative mt-2 max-w-sm text-muted">{q ? "Revisa la ortografía o prueba con una palabra más general." : "No hay productos con estos filtros: quita alguno para ver más resultados."}</p>
      <CatalogLink href="/productos" scroll={false} className="btn-ink relative mt-6 px-5 py-2.5">
        Ver todo el catálogo
      </CatalogLink>
    </div>
  );
}

/** Encabezado común de las páginas de listado: banda de "espuma" con ondas, como el héroe del inicio. */
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
    <div className="bleed relative -mt-8 overflow-hidden border-b border-line bg-paper py-8 sm:py-10">
      <div aria-hidden className="ondas absolute inset-0 [--ondas-x:90%] [--ondas-y:55%]" />
      <div className="relative">
        <Breadcrumbs items={crumbs} />
        <h1 className="rotulo text-display">{title}</h1>
        {description && <p className="mt-3 max-w-prose text-muted">{description}</p>}
        {children}
      </div>
    </div>
  );
}

/** Subcategorías como accesos rápidos bajo el título. */
export function SubcategoryLinks({ items }: { items: { id: string; slug: string; name: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-6 flex flex-wrap gap-2">
      {items.map((c) => (
        <li key={c.id}>
          {/* Mismo catálogo: las tarjetas se reacomodan (no se anima la página entera). */}
          <CatalogLink href={`/categoria/${c.slug}`} scroll={false} className="inline-block rounded-full border-[1.5px] border-ink/15 bg-white px-3.5 py-1.5 text-sm font-semibold transition-colors hover:border-ink">
            {c.name}
          </CatalogLink>
        </li>
      ))}
    </ul>
  );
}
