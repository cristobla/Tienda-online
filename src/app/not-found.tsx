import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24">
      <h1 className="text-3xl font-extrabold">No encontramos esta página</h1>
      <p className="mt-3 text-muted">Puede que el producto ya no esté disponible o que el enlace tenga un error.</p>
      <div className="mt-6 flex gap-6 font-semibold text-leaf">
        <Link href="/" className="underline">
          Ir al inicio
        </Link>
        <Link href="/productos" className="underline">
          Ver el catálogo
        </Link>
      </div>
    </main>
  );
}
