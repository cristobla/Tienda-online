"use client";

import { useActionState } from "react";
import { Submit } from "@/components/admin/form";
import type { FormState } from "@/lib/form";

const MB = 1024 * 1024;

/** Subida de imágenes. Los límites se revisan también aquí para avisar antes de enviar megas por la red. */
export function UploadForm({ action }: { action: (prev: FormState, fd: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3 rounded-md border border-dashed border-line p-4" key={state.v}>
      <p className="text-sm font-semibold">Subir imágenes</p>
      <input
        type="file"
        name="files"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        required
        aria-label="Archivos de imagen"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          const big = files.find((f) => f.size > 5 * MB);
          const total = files.reduce((n, f) => n + f.size, 0);
          e.target.setCustomValidity(
            big ? `"${big.name}" supera 5 MB.` : files.length > 10 ? "Máximo 10 imágenes por vez." : total > 24 * MB ? "En total superan 24 MB: súbelas en dos tandas." : "",
          );
          e.target.reportValidity();
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-mist file:px-3 file:py-2 file:font-semibold"
      />
      <label className="block text-sm">
        <span className="mb-1 block font-semibold">Texto alternativo</span>
        <input name="alt" maxLength={200} className="w-full rounded-md border border-line px-3 py-2" placeholder="Ej.: Botella de 500 ml, vista frontal" />
      </label>
      <p className="text-xs text-muted">JPG, PNG, WebP o AVIF · máx. 5 MB c/u · hasta 10 por vez (24 MB en total). Ideal: fondo blanco, cuadradas, 1200 px.</p>
      {state.error && (
        <p role="alert" className="text-sm font-medium text-oferta">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm font-medium text-leaf-dark">
          {state.message}
        </p>
      )}
      <Submit>Subir</Submit>
    </form>
  );
}
