import Link from "next/link";
import { Icon } from "@/components/icons";
import { SITE, socialLinks } from "@/lib/site";
import type { CategoryNode } from "@/modules/categories/queries";

/** Buscador del catálogo: formulario GET a /productos?q= (funciona sin JavaScript). */
export function SearchBar({ id, placeholder = "Busca por producto, marca o código", large = false }: { id: string; placeholder?: string; large?: boolean }) {
  return (
    <form action="/productos" role="search" className="relative flex w-full items-center">
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder={placeholder}
        className={`w-full min-w-0 rounded-full border-[1.5px] transition-colors placeholder:text-muted focus:bg-white ${
          large ? "border-ink bg-white py-4 pl-6 pr-16 text-lg sm:pr-36" : "border-transparent bg-mist py-2.5 pl-5 pr-14 hover:border-line focus:border-leaf"
        }`}
      />
      <button className={`absolute ${large ? "btn-buy right-2 size-12 sm:w-auto sm:px-5" : "btn-ink right-1.5 size-9"}`}>
        <Icon name="search" />
        <span className={large ? "sr-only sm:not-sr-only" : "sr-only"}>Buscar</span>
      </button>
    </form>
  );
}

/** Marca: gota menta sobre tinta (la misma del favicon, src/app/icon.svg). */
export function BrandMark({ className = "size-10" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={`shrink-0 ${className}`}>
      <rect width="40" height="40" rx="11" className="fill-ink" />
      <path d="M20 7.5s9 9.6 9 16a9 9 0 0 1-18 0c0-6.4 9-16 9-16Z" className="fill-menta" />
      <path d="M15.6 24.4a4.8 4.8 0 0 0 3.9 4.4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group flex items-center gap-2.5 ${className}`}>
      <BrandMark className="size-10 transition-transform duration-500 ease-spring group-hover:-rotate-8" />
      <span className="rotulo text-[1.8rem] leading-none">{SITE.name}</span>
    </Link>
  );
}

/** Número de pasillo de cada categoría raíz (01, 02…): el orden es el del panel. */
export const aisle = (i: number) => String(i + 1).padStart(2, "0");

export function StoreHeader({ roots, cartCount }: { roots: CategoryNode[]; cartCount: number }) {
  return (
    <header className="relative z-30 border-b border-line bg-white">
      <div className="bg-ink text-white/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-xs sm:text-[0.8rem]">
          <p className="flex items-center gap-2">
            <Icon name="truck" className="size-4 shrink-0 text-menta" />
            Despacho a todo Chile
            <span aria-hidden className="text-menta">
              ·
            </span>
            Precios con IVA incluido
          </p>
          <Link href="/info/ayuda" className="subrayado hidden text-white focus-visible:outline-menta sm:block">
            Centro de ayuda
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 px-4 py-3 md:gap-x-8 md:py-4">
        {/* Menú móvil: <details> nativo, sin JavaScript. */}
        <details className="group relative md:hidden">
          <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full border-[1.5px] border-line transition-colors group-open:border-ink group-open:bg-ink group-open:text-white">
            <Icon name="menu" className="size-5 group-open:hidden" />
            <Icon name="close" className="hidden size-5 group-open:block" />
            <span className="sr-only">Menú de categorías</span>
          </summary>
          <nav
            aria-label="Categorías (móvil)"
            className="absolute left-0 top-12 z-40 max-h-[75vh] w-[calc(100vw-2rem)] animate-drop-in overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-lift"
          >
            <Link href="/productos" className="flex items-center justify-between rounded-xl bg-ink px-4 py-3 font-bold text-white">
              Ver todos los productos
              <Icon name="arrow" />
            </Link>
            {roots.map((c, i) => (
              <div key={c.id} className="border-b border-line px-2 py-3 last:border-b-0">
                <Link href={`/categoria/${c.slug}`} className="flex items-baseline gap-2 py-1 font-bold">
                  <span aria-hidden className="etiqueta text-leaf">
                    {aisle(i)}
                  </span>
                  {c.name}
                </Link>
                <ul className="mt-1 grid grid-cols-2 gap-x-3 text-sm text-muted">
                  {c.children.map((s) => (
                    <li key={s.id}>
                      <Link href={`/categoria/${s.slug}`} className="block py-1.5 hover:text-leaf-dark">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </details>

        <Logo className="justify-self-start md:col-start-1" />

        <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1 md:w-full md:max-w-2xl md:justify-self-center">
          <SearchBar id="buscar" />
        </div>

        <div className="col-start-3 flex items-center gap-1 justify-self-end sm:gap-2">
          <Link href="/cuenta" className="flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-semibold transition-colors hover:bg-mist">
            <Icon name="user" className="size-6" />
            <span className="sr-only sm:not-sr-only">Mi cuenta</span>
          </Link>
          <Link href="/carrito" className="btn-ink py-2 pl-3 pr-3 text-sm sm:pl-3.5 sm:pr-4">
            <Icon name="cart" className="size-5" />
            <span className="sr-only sm:not-sr-only">Carrito</span>
            {cartCount > 0 && (
              <>
                <span className="sr-only"> ({cartCount === 1 ? "1 producto" : `${cartCount} productos`})</span>
                {/* key: al cambiar la cantidad el contador se vuelve a montar y repite el "pop". */}
                <span key={cartCount} aria-hidden className="grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-menta px-1 text-[0.7rem] font-bold text-ink">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              </>
            )}
          </Link>
        </div>
      </div>

      {/* Las categorías raíz son los "pasillos" de la tienda, numerados. */}
      <nav aria-label="Categorías" className="hidden border-t border-line md:block">
        <ul className="mx-auto flex max-w-7xl items-stretch gap-1 px-4 text-sm font-semibold">
          <li>
            <Link href="/productos" className="flex items-center gap-2 py-3 pr-4 text-leaf-dark">
              <Icon name="grid" className="size-4" />
              <span className="subrayado">Todos los productos</span>
            </Link>
          </li>
          {roots.map((c, i) => (
            // El submenú se abre con el mouse o al llegar con el teclado (focus-within).
            <li key={c.id} className="group relative">
              <Link
                href={`/categoria/${c.slug}`}
                className="relative flex items-baseline gap-2 px-3 py-3 transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-left after:scale-x-0 after:bg-leaf after:transition-transform after:duration-300 after:ease-out group-focus-within:after:scale-x-100 hover:text-leaf-dark hover:after:scale-x-100"
              >
                <span aria-hidden className="etiqueta text-[0.62rem] text-leaf">
                  {aisle(i)}
                </span>
                {c.name}
              </Link>
              {c.children.length > 0 && (
                <ul className="invisible absolute left-0 top-full z-40 min-w-60 translate-y-2 rounded-2xl border border-line bg-white p-2 font-normal opacity-0 shadow-lift transition-[opacity,translate,visibility] duration-300 ease-out group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {c.children.map((s) => (
                    <li key={s.id}>
                      <Link href={`/categoria/${s.slug}`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-mist hover:text-leaf-dark">
                        {s.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

const HELP = [
  { href: "/info/despacho", label: "Despacho y retiro" },
  { href: "/info/cambios", label: "Cambios y devoluciones" },
  { href: "/info/ayuda", label: "Preguntas frecuentes" },
  { href: "/info/contacto", label: "Contacto" },
];
const LEGAL = [
  { href: "/info/terminos", label: "Términos y condiciones" },
  { href: "/info/privacidad", label: "Política de privacidad" },
];

export function StoreFooter({ roots }: { roots: CategoryNode[] }) {
  const col = "space-y-2.5 text-sm text-white/75";
  const head = "etiqueta mb-4 text-menta";
  const link = "subrayado transition-colors hover:text-white";
  return (
    <footer className="relative mt-28 bg-ink text-white [&_:focus-visible]:outline-menta">
      <div aria-hidden className="borde-espuma absolute inset-x-0 bottom-full h-[1.3rem]" />
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-14">
        <div className="flex flex-col gap-8 border-b border-white/15 pb-12 lg:flex-row lg:items-end lg:justify-between">
          <p className="rotulo max-w-3xl text-display">
            Casa limpia, <span className="calado text-menta">compra simple.</span>
          </p>
          <Link href="/productos" className="btn-buy shrink-0 self-start px-6 py-3 lg:self-auto">
            Ver el catálogo
            <Icon name="arrow" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 pt-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <p className="flex items-center gap-2.5">
              <BrandMark />
              <span className="rotulo text-[1.8rem] leading-none">{SITE.name}</span>
            </p>
            <p className="mt-4 max-w-xs text-sm text-white/75">{SITE.description}</p>
            {socialLinks().length > 0 && (
              <ul aria-label="Redes sociales" className="mt-5 flex flex-wrap gap-2 text-sm">
                {socialLinks().map((l) => (
                  <li key={l.label}>
                    <a href={l.url} rel="me noopener" target="_blank" className="inline-block rounded-full border border-white/30 px-3.5 py-1.5 transition-colors hover:border-menta hover:text-menta">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {/* Solo se muestra el contacto que ya está definido en SITE (no se publican datos inventados). */}
            {(SITE.email || SITE.hours) && (
              <dl className="mt-5 space-y-1 text-sm text-white/75">
                {SITE.email && (
                  <div className="flex gap-2">
                    <dt className="font-semibold text-white">Correo:</dt>
                    <dd>
                      <a href={`mailto:${SITE.email}`} className={link}>
                        {SITE.email}
                      </a>
                    </dd>
                  </div>
                )}
                {SITE.hours && (
                  <div className="flex gap-2">
                    <dt className="font-semibold text-white">Horario:</dt>
                    <dd>{SITE.hours}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
          <nav aria-label="Categorías del pie">
            <h2 className={head}>Pasillos</h2>
            <ul className={col}>
              {roots.map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className={link}>
                    {c.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/productos" className={link}>
                  Todos los productos
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Ayuda">
            <h2 className={head}>Ayuda</h2>
            <ul className={col}>
              {HELP.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Legal">
            <h2 className={head}>Legal</h2>
            <ul className={col}>
              {LEGAL.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={link}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-white/60">
          <p>
            © {new Date().getFullYear()} {SITE.name} · Chile
          </p>
          <p>Precios en pesos chilenos (CLP) con IVA incluido.</p>
        </div>
      </div>
    </footer>
  );
}
