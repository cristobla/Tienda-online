"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";

/** Error inesperado en una página del panel. El detalle queda en el registro del servidor (digest). */
export default function PanelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-oferta/40 bg-white p-6">
      <p className="flex items-center gap-2 text-lg font-bold text-oferta">
        <Icon name="alert" />
        No se pudo completar la operación
      </p>
      <p className="mt-2 text-sm text-muted">Puede ser un problema temporal. Si se repite, avisa al equipo técnico con este código.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Código: {error.digest}</p>}
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <button onClick={retry} className="rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf-dark">
          Reintentar
        </button>
        <Link href="/admin" className="rounded-md border border-line bg-white px-4 py-2 font-semibold hover:border-leaf">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
