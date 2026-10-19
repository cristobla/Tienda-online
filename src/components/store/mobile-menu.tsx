"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { navigatesHere, tappedBackdrop } from "./menu-logic";

type Node = { id: string; slug: string; name: string; children: { id: string; slug: string; name: string }[] };

// Abre el <dialog> sin JavaScript donde el navegador ya entiende command/commandfor (Invoker Commands).
const invoker = { commandfor: "menu-movil", command: "show-modal" };

/**
 * Menú del celular: panel lateral en un <dialog> modal nativo (capa superior, fondo inerte, Escape y foco de vuelta
 * al botón los da el navegador; sin dependencias). Antes era un <details> dentro del encabezado, que vive en el
 * layout y no se vuelve a montar al navegar: quedaba abierto sobre "Mi cuenta" y cualquier destino, y no se cerraba
 * al tocar fuera. Se cierra con: la X, el fondo, Escape, un enlace propio (aunque sea la página actual), cualquier
 * cambio de URL (incluye atrás/adelante y otros parámetros) y al pasar a escritorio. Clics con Ctrl/⌘/Shift o con
 * otro botón siguen siendo nativos (abrir en otra pestaña) y no lo cierran.
 * El scroll de la página queda bloqueado solo mientras está abierto (globals.css, .menu-movil).
 */
export function MobileMenu({ roots, onSale }: { roots: Node[]; onSale: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  const url = usePathname() + "?" + useSearchParams().toString();

  const close = () => {
    if (ref.current?.open) ref.current.close();
  };

  useEffect(() => {
    close();
    // Se eligió un destino en el menú: el foco va al contenido nuevo, no vuelve al botón del menú.
    if (navigating.current) {
      navigating.current = false;
      if (document.activeElement === document.getElementById("menu-boton")) document.getElementById("contenido")?.focus({ preventScroll: true });
    }
  }, [url]);

  useEffect(() => {
    const desktop = matchMedia("(min-width: 768px)");
    const onChange = () => desktop.matches && close();
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, []);

  const link = "flex min-h-11 items-center rounded-xl px-3 transition-colors active:bg-mist";

  return (
    <>
      <button
        id="menu-boton"
        type="button"
        {...invoker}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="menu-movil"
        onClick={() => {
          setOpen(true);
          if (!("command" in HTMLButtonElement.prototype) && ref.current && !ref.current.open) ref.current.showModal();
        }}
        className="grid size-11 place-items-center rounded-full border-[1.5px] border-line transition-colors active:bg-mist md:hidden"
      >
        <Icon name="menu" className="size-5" />
        <span className="sr-only">Menú</span>
      </button>

      <dialog
        id="menu-movil"
        ref={ref}
        aria-label="Menú"
        className="menu-movil"
        onClose={() => setOpen(false)}
        // Captura: se decide antes de que el enlace de Next cancele el clic para navegar sin recargar.
        onClickCapture={(e) => {
          const a = (e.target as Element).closest("a");
          if (a && navigatesHere(e, { target: a.getAttribute("target"), download: a.hasAttribute("download") })) {
            navigating.current = true;
            close();
          }
        }}
        onClick={(e) => tappedBackdrop(e.target, ref.current) && close()}
      >
        {/* El panel llena el <dialog>: un toque que llega al <dialog> mismo solo puede ser en el fondo. */}
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <p className="etiqueta text-muted">Menú</p>
            <button type="button" onClick={close} className="grid size-11 place-items-center rounded-full transition-colors active:bg-mist">
              <Icon name="close" className="size-5" />
              <span className="sr-only">Cerrar menú</span>
            </button>
          </div>

          {/* Todo lo de abajo se desplaza junto (en horizontal con poca altura, la cuenta no le quita espacio a las categorías). */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
          <nav aria-label="Categorías" className="p-3">
            <Link href="/productos" className="flex min-h-12 items-center justify-between rounded-xl bg-ink px-4 font-bold text-white">
              Ver todos los productos
              <Icon name="arrow" />
            </Link>
            {onSale && (
              <Link href="/ofertas" className="mt-2 flex min-h-12 items-center gap-2 rounded-xl border border-oferta/30 px-4 font-bold text-oferta">
                <Icon name="tag" className="size-4" />
                Ofertas
              </Link>
            )}
            {roots.map((c, i) => (
              <div key={c.id} className="border-b border-line py-2 last:border-b-0">
                <Link href={`/categoria/${c.slug}`} className={`${link} gap-2 font-bold`}>
                  <span aria-hidden className="etiqueta text-leaf">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {c.name}
                </Link>
                {c.children.length > 0 && (
                  <ul className="grid grid-cols-2 gap-x-1 text-sm text-muted">
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link href={`/categoria/${s.slug}`} className={link}>
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>

          <ul className="border-t border-line p-3 text-sm font-semibold">
            {[
              { href: "/cuenta", label: "Mi cuenta", icon: "user" as const },
              { href: "/seguimiento", label: "Sigue tu pedido", icon: "truck" as const },
              { href: "/info/ayuda", label: "Centro de ayuda", icon: "chat" as const },
            ].map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={`${link} gap-3`}>
                  <Icon name={l.icon} className="size-5 text-leaf" />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          </div>
        </div>
      </dialog>
    </>
  );
}
