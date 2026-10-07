"use client";

import { Icon } from "@/components/icons";
import { SITE } from "@/lib/site";

/**
 * Último recurso: falló el layout de la tienda o del panel (p. ej. la base de datos no responde).
 * Los errores de cada página los muestran (store)/error.tsx y admin/(panel)/error.tsx, con el menú intacto.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <div role="alert" className="w-full max-w-md rounded-md border border-line bg-white p-8 text-center">
        <p className="flex items-center justify-center gap-2 text-2xl font-extrabold tracking-tight [font-stretch:80%]">
          <span className="grid size-9 place-items-center rounded-md bg-leaf text-white">
            <Icon name="drop" className="size-5" />
          </span>
          {SITE.name}
        </p>
        <h1 className="mt-6 text-xl font-bold">Estamos con problemas para cargar la tienda</h1>
        <p className="mt-2 text-muted">Es algo temporal de nuestro lado. Inténtalo de nuevo en unos segundos.</p>
        {error.digest && <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p>}
        <button onClick={retry} className="mt-6 rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
          Reintentar
        </button>
      </div>
    </main>
  );
}
