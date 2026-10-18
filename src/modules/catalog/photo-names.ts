/** Reglas de nombres de la carga masiva de fotos. Puras: las usa también el navegador (panel). */

export const PHOTO_MODES = {
  "si-vacio": "Solo si el producto aún no tiene fotos",
  agregar: "Agregar a las fotos que ya tiene",
  reemplazar: "Reemplazar las fotos que tiene",
} as const;
export type PhotoMode = keyof typeof PHOTO_MODES;

/** Claves a buscar, en orden: el nombre completo y, si termina en número de orden, el nombre sin él. */
export function photoKeys(fileName: string): string[] {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").normalize("NFC").trim();
  const m = base.match(/^(.+?)(?:[-_ ]\d{1,2}|\s*\(\d{1,2}\))$/);
  return m ? [base, m[1]!.trim()] : [base];
}

/** Orden en que conviene subir: la foto sin número antes que "-2", "-3"… (así queda como principal). */
export const photoOrder = (a: string, b: string) =>
  a.replace(/\.[^.]+$/, "").localeCompare(b.replace(/\.[^.]+$/, ""), "es", { numeric: true, sensitivity: "base" });
