"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";

/** Error inesperado en una página de la tienda. El detalle queda en el registro del servidor (digest). */
export default function StoreError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-6 max-w-lg rounded-[1.75rem] bg-paper px-8 py-12 text-center ring-1 ring-line">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-oferta/10 text-oferta">
        <Icon name="alert" className="size-8" />
      </span>
      <h1 className="rotulo mt-5 text-title">Algo salió mal</h1>
      <p className="mt-2 text-muted">No pudimos cargar esta página. Inténtalo de nuevo en unos segundos.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p>}
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button onClick={retry} className="btn-ink px-6 py-3">
          Reintentar
        </button>
        <Link href="/" className="btn-line px-6 py-3">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
