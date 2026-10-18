"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

/**
 * Transición entre páginas de la tienda con la View Transitions API (vía <ViewTransition> de React; sin dependencias).
 * La clave es la ruta sin parámetros:
 * - Otra ruta (inicio → pasillo, pasillo → pasillo, ficha): la página que se va se desvanece y la nueva sube.
 *   Si el enlace marca la navegación como "filtro" (subcategoría del mismo pasillo), solo un fundido corto.
 * - Misma ruta con otros parámetros (filtros, orden, página, variante): esta capa no anima ("update" none);
 *   la grilla del catálogo tiene su propia transición. Encabezado y pie no se mueven.
 * Las clases se animan en globals.css. Sin soporte del navegador o con "reducir movimiento", el cambio es instantáneo.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      key={usePathname()}
      enter={{ filtro: "suave-entra", default: "pagina-entra" }}
      exit={{ filtro: "suave-sale", default: "pagina-sale" }}
      update="none"
      default="none"
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
