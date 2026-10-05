"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";

/** Error inesperado en una página de la tienda. El detalle queda en el registro del servidor (digest). */
export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-6 max-w-md rounded-md border border-line bg-white p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-oferta/10 text-oferta">
        <Icon name="alert" className="size-7" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold">Algo salió mal</h1>
      <p className="mt-2 text-muted">No pudimos cargar esta página. Inténtalo de nuevo en unos segundos.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button onClick={retry} className="rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
          Reintentar
        </button>
        <Link href="/" className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold hover:border-leaf">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
