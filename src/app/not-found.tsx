import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Página no encontrada" };

/** URL que no existe en ninguna sección. Las de la tienda usan (store)/not-found.tsx, con menú y pie. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="w-full max-w-md rounded-md border border-line bg-white p-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight [font-stretch:80%]">
          <span className="grid size-9 place-items-center rounded-md bg-leaf text-white">
            <Icon name="drop" className="size-5" />
          </span>
          {SITE.name}
        </Link>
        <h1 className="mt-6 text-xl font-bold">No encontramos esta página</h1>
        <p className="mt-2 text-muted">Puede que el enlace tenga un error o que la página ya no exista.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className="rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
            Ir al inicio
          </Link>
          <Link href="/productos" className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold hover:border-leaf">
            Ver el catálogo
          </Link>
        </div>
      </div>
    </main>
  );
}
