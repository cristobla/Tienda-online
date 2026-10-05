import Link from "next/link";
import { Icon } from "@/components/icons";
import { SITE } from "@/lib/site";
import type { CategoryNode } from "@/modules/categories/queries";

/** Buscador del catálogo: formulario GET a /productos?q= (funciona sin JavaScript). */
export function SearchBar({ id, placeholder = "Busca por producto, marca o código", large = false }: { id: string; placeholder?: string; large?: boolean }) {
  return (
    <form action="/productos" role="search" className="flex w-full">
      <label htmlFor={id} className="sr-only">
        Buscar productos
      </label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder={placeholder}
        className={`min-w-0 flex-1 rounded-l-md border border-r-0 placeholder:text-muted ${
          large ? "border-2 border-leaf bg-white px-5 py-3.5 text-lg" : "border-line bg-mist px-4 py-2.5 focus:bg-white"
        }`}
      />
      <button className={`flex items-center gap-2 rounded-r-md bg-leaf font-semibold text-white hover:bg-leaf-dark ${large ? "px-6 text-lg" : "px-4"}`}>
        <Icon name="search" />
        <span className={large ? "" : "sr-only sm:not-sr-only"}>Buscar</span>
      </button>
    </form>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <span className="grid size-9 place-items-center rounded-md bg-leaf text-white">
        <Icon name="drop" className="size-5" />
      </span>
      <span className="text-2xl font-extrabold tracking-tight text-ink [font-stretch:80%]">{SITE.name}</span>
    </Link>
  );
}

const iconLink = "flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-mist hover:text-leaf sm:flex-row sm:gap-2 sm:text-sm";

export function StoreHeader({ roots, cartCount }: { roots: CategoryNode[]; cartCount: number }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="bg-leaf-dark text-xs text-white sm:text-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-1.5">
          <p className="flex items-center gap-2">
            <Icon name="truck" className="size-4 shrink-0" />
            Despacho a todo Chile · Precios con IVA incluido
          </p>
          <Link href="/info/ayuda" className="hidden underline-offset-2 hover:underline sm:block">
            Centro de ayuda
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3 px-4 py-3 md:grid-cols-[auto_1fr_auto] md:gap-x-8 md:py-4">
        {/* Menú móvil: <details> nativo, sin JavaScript. */}
        <details className="group relative md:hidden">
          <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-md border border-line">
            <Icon name="menu" className="size-5 group-open:hidden" />
            <Icon name="close" className="hidden size-5 group-open:block" />
            <span className="sr-only">Menú de categorías</span>
          </summary>
          <nav aria-label="Categorías (móvil)" className="absolute left-0 top-12 z-40 max-h-[75vh] w-[calc(100vw-2rem)] overflow-y-auto rounded-md border border-line bg-white p-4 shadow-lg">
            <Link href="/productos" className="block py-2 font-bold text-leaf">
              Ver todos los productos
            </Link>
            {roots.map((c) => (
              <div key={c.id} className="border-t border-line py-2">
                <Link href={`/categoria/${c.slug}`} className="block py-1.5 font-bold">
                  {c.name}
                </Link>
                <ul className="grid grid-cols-2 gap-x-3 text-sm text-muted">
                  {c.children.map((s) => (
                    <li key={s.id}>
                      <Link href={`/categoria/${s.slug}`} className="block py-1.5 hover:text-leaf">
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

        <div className="col-span-3 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1 md:max-w-2xl md:justify-self-center md:w-full">
          <SearchBar id="buscar" />
        </div>

        <div className="col-start-3 flex items-center justify-self-end gap-1">
          <Link href="/cuenta" className={iconLink}>
            <Icon name="user" className="size-6" />
            <span>Mi cuenta</span>
          </Link>
          <Link href="/carrito" className={iconLink}>
            <span className="relative">
              <Icon name="cart" className="size-6" />
              {cartCount > 0 && (
                <span aria-hidden className="absolute -right-2.5 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-leaf px-1 text-[0.65rem] font-bold text-white">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </span>
            <span>
              Carrito{cartCount > 0 && <span className="sr-only"> ({cartCount === 1 ? "1 producto" : `${cartCount} productos`})</span>}
            </span>
          </Link>
        </div>
      </div>

      <nav aria-label="Categorías" className="hidden border-t border-line md:block">
        <ul className="mx-auto flex max-w-7xl items-stretch gap-1 px-4 text-sm font-semibold">
          <li>
            <Link href="/productos" className="flex items-center gap-2 py-3 pr-4 text-leaf hover:underline">
              <Icon name="grid" className="size-4" />
              Todos los productos
            </Link>
          </li>
          {roots.map((c) => (
            // El submenú se abre con el mouse o al llegar con el teclado (focus-within).
            <li key={c.id} className="group relative">
              <Link href={`/categoria/${c.slug}`} className="flex items-center gap-1 border-b-2 border-transparent px-3 py-3 hover:border-leaf hover:text-leaf">
                {c.name}
              </Link>
              {c.children.length > 0 && (
                <ul className="absolute left-0 top-full z-40 hidden min-w-56 rounded-b-md border border-line bg-white py-2 font-normal shadow-lg group-focus-within:block group-hover:block">
                  {c.children.map((s) => (
                    <li key={s.id}>
                      <Link href={`/categoria/${s.slug}`} className="block px-4 py-2 hover:bg-mist hover:text-leaf">
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
  const col = "space-y-2 text-sm text-white/80";
  const head = "mb-3 text-sm font-bold uppercase tracking-wide text-white";
  return (
    <footer className="mt-20 bg-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 text-2xl font-extrabold [font-stretch:80%]">
            <span className="grid size-9 place-items-center rounded-md bg-leaf">
              <Icon name="drop" className="size-5" />
            </span>
            {SITE.name}
          </p>
          <p className="mt-3 max-w-xs text-sm text-white/80">{SITE.description}</p>
          {/* Datos de contacto por definir: no se publican datos inventados. */}
          <dl className="mt-5 space-y-1 text-sm text-white/80">
            <div className="flex gap-2">
              <dt className="font-semibold text-white">Correo:</dt>
              <dd>por definir</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-white">Horario:</dt>
              <dd>por definir</dd>
            </div>
          </dl>
        </div>
        <nav aria-label="Categorías del pie">
          <h2 className={head}>Categorías</h2>
          <ul className={col}>
            {roots.map((c) => (
              <li key={c.id}>
                <Link href={`/categoria/${c.slug}`} className="hover:text-white hover:underline">
                  {c.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/productos" className="hover:text-white hover:underline">
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
                <Link href={l.href} className="hover:text-white hover:underline">
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
                <Link href={l.href} className="hover:text-white hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-4 text-xs text-white/70">
          <p>
            © {new Date().getFullYear()} {SITE.name} · Chile
          </p>
          <p>Precios en pesos chilenos (CLP) con IVA incluido.</p>
        </div>
      </div>
    </footer>
  );
}
