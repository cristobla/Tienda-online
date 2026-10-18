"use client";

/** Marca o desmarca todas las casillas de la página (las de la acción masiva). Sin JavaScript se marcan una a una. */
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Marcar todos los productos de esta página"
      onChange={(e) => document.querySelectorAll<HTMLInputElement>('input[form="masivo"][name="ids"]').forEach((c) => (c.checked = e.target.checked))}
      className="size-4 accent-leaf"
    />
  );
}
