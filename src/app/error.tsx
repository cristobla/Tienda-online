"use client";

import { BrandMark } from "@/components/store/shell";
import { SITE } from "@/lib/site";

/**
 * Último recurso: falló el layout de la tienda o del panel (p. ej. la base de datos no responde).
 * Los errores de cada página los muestran (store)/error.tsx y admin/(panel)/error.tsx, con el menú intacto.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <div role="alert" className="w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center ring-1 ring-line">
        <p className="inline-flex items-center gap-2.5">
          <BrandMark />
          <span className="rotulo text-[1.8rem] leading-none">{SITE.name}</span>
        </p>
        <h1 className="rotulo mt-7 text-title">Estamos con problemas para cargar la tienda</h1>
        <p className="mt-2 text-muted">Es algo temporal de nuestro lado. Inténtalo de nuevo en unos segundos.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p>}
        <button onClick={retry} className="btn-ink mt-7 px-6 py-3">
          Reintentar
        </button>
      </div>
    </main>
  );
}
