import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/store/shell";
import { DEFAULT_SETTINGS } from "@/lib/site";
import { getSettings } from "@/modules/settings";

export const metadata: Metadata = { title: "Página no encontrada" };

/** URL que no existe en ninguna sección. Las de la tienda usan (store)/not-found.tsx, con menú y pie. */
export default async function NotFound() {
  // Sin base de datos también hay que poder responder 404: se usan los datos por omisión.
  const { name } = await getSettings().catch(() => DEFAULT_SETTINGS);
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-paper px-4">
      <div aria-hidden className="ondas absolute inset-0 [--ondas-x:50%] [--ondas-y:45%]" />
      <div className="relative w-full max-w-md rounded-[1.75rem] bg-white p-8 text-center ring-1 ring-line">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <BrandMark />
          <span className="rotulo text-[1.8rem] leading-none">{name}</span>
        </Link>
        <h1 className="rotulo mt-7 text-title">No encontramos esta página</h1>
        <p className="mt-2 text-muted">Puede que el enlace tenga un error o que la página ya no exista.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-ink px-6 py-3">
            Ir al inicio
          </Link>
          <Link href="/productos" className="btn-line px-6 py-3">
            Ver el catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
