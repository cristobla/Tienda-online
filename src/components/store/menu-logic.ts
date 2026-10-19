/** Reglas del menú móvil, sin DOM ni React (se prueban en tests/menu.test.ts). */

type ClickLike = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean };

/**
 * ¿Un clic en este enlace del menú navega aquí mismo (y por eso el menú debe cerrarse)?
 * No: clic con otro botón o con modificadores (abrir en otra pestaña o ventana), enlaces que abren otra
 * ventana o descargan, o un clic que otro código ya canceló. El menú sigue abierto para seguir eligiendo.
 */
export function navigatesHere(e: ClickLike, link: { target?: string | null; download?: boolean }) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (link.download) return false;
  return !link.target || link.target === "_self";
}

/** ¿El toque fue en el fondo (fuera del panel)? En un <dialog> modal el fondo es el propio <dialog>. */
export const tappedBackdrop = (target: unknown, dialog: unknown) => target === dialog;
