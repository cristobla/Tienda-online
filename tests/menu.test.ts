import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { navigatesHere, tappedBackdrop } from "@/components/store/menu-logic";

const click = (over: Partial<Parameters<typeof navigatesHere>[0]> = {}) => ({
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  ...over,
});

describe("menú del celular", () => {
  it("un clic normal en un enlace del menú lo cierra (también si es la página actual: no depende de la ruta)", () => {
    expect(navigatesHere(click(), { target: null })).toBe(true);
    expect(navigatesHere(click(), { target: "_self" })).toBe(true);
  });

  it("los clics modificados, con otro botón o a otra ventana siguen siendo nativos y no lo cierran", () => {
    for (const k of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) expect(navigatesHere(click({ [k]: true }), {})).toBe(false);
    expect(navigatesHere(click({ button: 1 }), {})).toBe(false);
    expect(navigatesHere(click(), { target: "_blank" })).toBe(false);
    expect(navigatesHere(click(), { download: true })).toBe(false);
    expect(navigatesHere(click({ defaultPrevented: true }), {})).toBe(false);
  });

  it("solo un toque que llega al <dialog> mismo es el fondo; uno dentro del panel no lo cierra", () => {
    const dialog = {};
    expect(tappedBackdrop(dialog, dialog)).toBe(true);
    expect(tappedBackdrop({}, dialog)).toBe(false);
  });

  it("el menú se cierra con cada cambio de URL (ruta y parámetros), al pasar a escritorio, y no deja el scroll bloqueado", () => {
    // Regresión del <details> que quedaba abierto: el cierre depende de pathname + searchParams y de matchMedia,
    // y el bloqueo de scroll es CSS atado al [open] del <dialog> (desaparece solo al cerrarse o desmontarse).
    const menu = readFileSync("src/components/store/mobile-menu.tsx", "utf8");
    expect(menu).toMatch(/usePathname\(\) \+ "\?" \+ useSearchParams\(\)\.toString\(\)/);
    expect(menu).toMatch(/\}, \[url\]\);/);
    expect(menu).toContain('matchMedia("(min-width: 768px)")');
    expect(menu).toContain("showModal()");
    expect(menu).not.toMatch(/^\s*<details/m);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/html:has\(\.menu-movil\[open\]\)\s*\{\s*overflow: hidden;/);
    expect(css).toMatch(/\.menu-movil:not\(\[open\]\)::backdrop\s*\{\s*pointer-events: none;/);
  });
});
