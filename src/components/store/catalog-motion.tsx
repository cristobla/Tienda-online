"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, ViewTransition } from "react";

/**
 * Estado "buscando" del catálogo mientras llega la respuesta de un cambio (pasillo, filtro, orden, página).
 * Los resultados anteriores se quedan a la vista, atenuados y con aria-busy: no se presentan como si ya fueran del
 * filtro nuevo. Cuando llegan los nuevos, el catálogo se transforma (View Transition de las tarjetas).
 * La última selección gana: el enrutador de Next cancela la navegación anterior y su enlace deja de estar pendiente.
 */
const outside = () => {};
const Report = createContext<(on: boolean) => void>(outside);
const Busy = createContext(false);

export function CatalogBusy({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const report = useCallback((on: boolean) => setCount((c) => Math.max(0, c + (on ? 1 : -1))), []);
  return (
    <Report value={report}>
      <Busy value={count > 0}>{children}</Busy>
    </Report>
  );
}

/** ¿Está dentro de un catálogo? (el formulario de filtros también se usa en el checkout, para la comuna). */
export const useInCatalog = () => useContext(Report) !== outside;

/** Avisa al catálogo mientras `on` sea verdadero (se limpia solo al terminar o desmontarse). */
export function useReportBusy(on: boolean) {
  const report = useContext(Report);
  useEffect(() => {
    if (!on) return;
    report(true);
    return () => report(false);
  }, [on, report]);
}

function LinkPending() {
  const { pending } = useLinkStatus();
  useReportBusy(pending);
  // data-pendiente: el enlace se marca con has-[[data-pendiente]] (pasillos) sin otro estado de React.
  return pending ? <span data-pendiente aria-hidden className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-leaf align-middle" /> : null;
}

/**
 * Scroll al filtrar: los enlaces y el formulario del catálogo no mandan al inicio de la página (scroll={false}).
 * Si después del cambio el comienzo de los resultados quedó arriba, fuera de la pantalla (p. ej. "Siguiente" al pie
 * de la grilla), se sube solo hasta los resultados. Solo tras un cambio pedido aquí: atrás/adelante restaura el scroll.
 * Foco: si el enlace usado con teclado desaparece (otro pasillo es otra página; el chip quitado; el número de página
 * que pasa a ser la actual), el foco vuelve al pasillo activo (si se usó un pasillo) o al comienzo de los resultados.
 */
let revealResults = false;
let announce = false;
let focusAfter: "pasillo" | "resultados" | null = null;
export const markCatalogNavigation = () => {
  revealResults = announce = true;
};

/** Enlace del catálogo (pasillo, chip, página): mientras navega marca los resultados como "buscando". */
export function CatalogLink({ children, onClick, aisle = false, ...props }: React.ComponentProps<typeof Link> & { aisle?: boolean }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        markCatalogNavigation();
        // detail 0 = activado con teclado o lector de pantalla (no con el mouse).
        focusAfter = e.detail === 0 ? (aisle ? "pasillo" : "resultados") : null;
        onClick?.(e);
      }}
    >
      {children}
      <LinkPending />
    </Link>
  );
}

/**
 * Zona de resultados: aria-busy y atenuada mientras se busca (con un pequeño retraso, así lo rápido no parpadea).
 * Al llegar los resultados de un cambio pedido aquí se anuncia una vez cuántos hay, en la región #anuncios del layout
 * (persiste entre páginas: una región nueva que aparece con texto no siempre se lee).
 */
export function CatalogResults({ total, children }: { total: number; children: React.ReactNode }) {
  const busy = useContext(Busy);
  const ref = useRef<HTMLElement>(null);
  const url = usePathname() + "?" + useSearchParams().toString();
  useEffect(() => {
    const el = ref.current;
    if (focusAfter && el && (!document.activeElement || document.activeElement === document.body)) {
      const target = focusAfter === "pasillo" ? document.querySelector<HTMLElement>('nav[aria-label="Pasillos"] [aria-current="page"]') : el;
      target?.focus({ preventScroll: true });
    }
    focusAfter = null;
    if (announce) {
      announce = false;
      const live = document.getElementById("anuncios");
      if (live) live.textContent = `${total} ${total === 1 ? "producto" : "productos"}`;
    }
    if (!revealResults) return;
    revealResults = false;
    if (el && el.getBoundingClientRect().top < 0)
      el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    // Solo al cambiar la URL (el total nuevo llega junto con ella).
  }, [url]);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      aria-label="Resultados"
      aria-busy={busy}
      className={`min-w-0 scroll-mt-4 outline-none transition-opacity duration-(--mov-micro) ${busy ? "opacity-55 delay-150" : ""}`}
    >
      {children}
    </section>
  );
}

/**
 * Pasillos del catálogo (Todos · 01 Higiene personal · 02 …). El activo lleva la repisa tinta, que se desliza al
 * pasillo nuevo cuando llegan sus productos (View Transition con nombre). Al tocar otro pasillo, ese se marca de
 * inmediato como pedido (punto y color), pero el activo sigue siendo el que se está mostrando hasta que cambian
 * los resultados. Sin JavaScript son enlaces normales. No mueve el scroll: los resultados están justo debajo.
 */
export function AisleTabs({ items, current }: { items: { href: string; name: string; number?: string }[]; current: string }) {
  const ref = useRef<HTMLElement>(null);
  // En el celular la barra se desliza de lado: el pasillo activo queda a la vista (sin mover el scroll de la página).
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth)
      nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - active.offsetWidth) / 2;
  }, [current]);
  return (
    <nav ref={ref} aria-label="Pasillos" className="mb-6 overflow-x-auto [scrollbar-width:none]">
      <ul className="flex w-max min-w-full gap-1 border-b border-line">
        {items.map((it) => {
          const active = it.href === current;
          return (
            <li key={it.href}>
              <CatalogLink
                href={it.href}
                scroll={false}
                aisle
                aria-current={active ? "page" : undefined}
                className={`relative flex items-baseline gap-1.5 whitespace-nowrap rounded-t-xl px-3 pb-3 pt-2 font-bold transition-colors duration-(--mov-micro) hover:bg-mist has-[[data-pendiente]]:text-leaf-dark ${
                  active ? "text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {it.number && <span className="text-xs font-semibold tabular-nums text-muted">{it.number}</span>}
                {it.name}
                {active && (
                  <ViewTransition name="pasillo-repisa" share="repisa" default="none">
                    <span aria-hidden className="absolute inset-x-2 -bottom-px h-1 rounded-t-[3px] bg-ink" />
                  </ViewTransition>
                )}
              </CatalogLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Nombre de transición de una tarjeta del catálogo. Va en un componente de cliente: un <ViewTransition> que llega
 * desde el servidor anima al reordenar dentro de la misma ruta, pero React no lo empareja al cambiar de ruta
 * (/productos → /categoria/…); armado aquí sí (comprobado en el navegador con Next 16.3 / React 19.3).
 */
export function CardTransition({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={`producto-${id}`} share="tarjeta" update="tarjeta" enter="tarjeta-entra" exit="tarjeta-sale" default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * Parte fija del catálogo (título, pasillos, barra de resultados, filtros) con nombre propio: al cambiar de pasillo
 * cambia de una vez en su lugar nuevo, en vez de fundirse con la versión anterior (el título de otro alto quedaba
 * doble un instante). Así lo único que se mueve son las tarjetas y la repisa. Ver globals.css (.fija).
 */
export function CatalogFixed({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={`catalogo-${name}`} share="fija" update="fija" default="none">
      {children}
    </ViewTransition>
  );
}
