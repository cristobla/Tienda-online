"use client";

/**
 * Formulario GET de filtros. En escritorio se envía solo al cambiar un filtro; en móvil el cliente elige
 * varios y toca "Aplicar" (cada envío recarga y cerraría el panel). El orden siempre se aplica al instante.
 * Sin JavaScript funciona igual con el botón "Aplicar".
 * Usa el evento nativo "change" (al confirmar el valor), no el onChange de React (que dispara en cada tecla).
 */
export function AutoSubmitForm(props: React.ComponentProps<"form">) {
  return (
    <form
      {...props}
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
        document.addEventListener("change", submit);
        form.addEventListener("formdata", clean);
        return () => {
          document.removeEventListener("change", submit);
          form.removeEventListener("formdata", clean);
        };
      }}
    />
  );
}
