"use client";

import { usePathname } from "next/navigation";
import { ViewTransition } from "react";

/** Rutas del catálogo: entre ellas no se cambia de página, se transforma el mismo catálogo (ver CatalogView). */
const CATALOG = /^\/(productos|categoria\/[^/]+|marca\/[^/]+|ofertas)$/;

/**
 * Transición entre páginas de la tienda con la View Transitions API (vía <ViewTransition> de React; sin dependencias).
 * Va en el layout (no en un template, que se vuelve a montar en cada ruta), con una clave por "lugar":
 * - Otro lugar (inicio → catálogo, catálogo → ficha, carrito → checkout): la página que se va se apaga y la nueva sube.
 * - Dentro del catálogo (/productos ↔ /categoria/… ↔ /marca/… ↔ /ofertas) y con otros parámetros en la misma ruta, la
 *   página cambia de una vez ("pagina-quieta") y solo se mueven las tarjetas y la repisa del pasillo (nombre propio).
 *   Ojo: "update" no puede ser "none": React concluiría que nada fuera de las tarjetas cambió y cancelaría la
 *   transición completa al cambiar de ruta (comprobado con React 19.3: las tarjetas no viajaban entre pasillos).
 * Las clases se animan en globals.css. Sin soporte del navegador o con "reducir movimiento", el cambio es instantáneo.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <ViewTransition key={CATALOG.test(path) ? "catalogo" : path} enter="pagina-entra" exit="pagina-sale" update="pagina-quieta" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
