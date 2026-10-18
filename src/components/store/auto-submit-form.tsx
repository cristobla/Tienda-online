"use client";

import Form from "next/form";

/**
 * Formulario GET de filtros. Con JavaScript, next/form navega sin recargar el documento: el encabezado, el título y
 * los filtros se quedan y solo cambian los resultados (con su transición, ver CatalogView). Sin JavaScript es un
 * formulario GET normal, con el botón "Aplicar".
 * En escritorio se envía solo al cambiar un filtro; en móvil el cliente elige varios y toca "Aplicar". El orden siempre
 * se aplica al instante. Usa el evento nativo "change" (al confirmar el valor), no el onChange de React (cada tecla).
 */
export function AutoSubmitForm({ action, ...props }: Omit<React.ComponentProps<"form">, "action"> & { action: string }) {
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
