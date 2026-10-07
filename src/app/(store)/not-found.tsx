import Link from "next/link";

/** Producto, categoría, marca o página informativa que no existe: se muestra dentro de la tienda (con menú y pie). */
export default function StoreNotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <h1 className="text-3xl font-extrabold">No encontramos esta página</h1>
      <p className="mt-3 text-muted">Puede que el producto ya no esté disponible o que el enlace tenga un error.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/productos" className="rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
          Ver el catálogo
        </Link>
        <Link href="/" className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold hover:border-leaf">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
