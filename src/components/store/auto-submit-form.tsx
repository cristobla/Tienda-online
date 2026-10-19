"use client";

import Form from "next/form";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { markCatalogNavigation, useInCatalog, useReportBusy } from "./catalog-motion";

/**
 * Formulario GET de filtros. Con JavaScript, next/form navega sin recargar el documento: el encabezado, el título y
 * los filtros se quedan y solo cambian los resultados (con su transición, ver CatalogView). Sin JavaScript es un
 * formulario GET normal, con el botón "Aplicar".
 * En escritorio se envía solo al cambiar un filtro; en móvil el cliente elige varios y toca "Aplicar". El orden siempre
 * se aplica al instante. Usa el evento nativo "change" (al confirmar el valor), no el onChange de React (cada tecla).
 * Historial: cada envío es una entrada (como un filtro de pasillo); los precios se envían al confirmar, no por tecla.
 * Mientras llega la respuesta, los resultados se marcan como "buscando" (CatalogResults) hasta que cambia la URL.
 */
export function AutoSubmitForm({ action, ...props }: Omit<React.ComponentProps<"form">, "action"> & { action: string }) {
  const inCatalog = useInCatalog();
  const query = useSearchParams().toString();
  const [sentFor, setSentFor] = useState<string | null>(null);
  useReportBusy(sentFor === query);
  useEffect(() => setSentFor(null), [query]);
  return (
    <Form
      {...props}
      action={action}
      scroll={false}
      prefetch={false}
      ref={(form) => {
        if (!form) return;
        const wide = matchMedia("(min-width: 1024px)");
        // Se escucha en el documento: un control puede pertenecer al formulario sin estar dentro (atributo form="…").
        const submit = (e: Event) => {
          const { name, form: owner } = e.target as HTMLInputElement;
          // Sin name = interruptor del panel en móvil, no es un filtro.
          if (owner === form && name && (wide.matches || name === "orden")) form.requestSubmit();
        };
        // URLs limpias: sin precio_min= vacíos.
        const clean = (e: FormDataEvent) => {
          for (const [k, v] of [...e.formData]) if (v === "") e.formData.delete(k);
        };
        // Sin recarga, el panel de filtros del móvil seguiría abierto tapando los resultados: se cierra al aplicar.
        const close = () => {
          if (inCatalog) markCatalogNavigation();
          // "Buscando" solo si la búsqueda cambia algo (si no, la URL no cambiaría y quedaría marcado).
          const next = new URLSearchParams([...new FormData(form)].filter(([, v]) => v !== "") as [string, string][]).toString();
          if (next !== query) setSentFor(query);
          for (const toggle of form.querySelectorAll<HTMLInputElement>("input[type=checkbox]:not([name])")) toggle.checked = false;
        };
        document.addEventListener("change", submit);
        form.addEventListener("formdata", clean);
        form.addEventListener("submit", close);
        return () => {
          document.removeEventListener("change", submit);
          form.removeEventListener("formdata", clean);
          form.removeEventListener("submit", close);
        };
      }}
    />
  );
}
