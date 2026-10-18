import Link from "next/link";

/** Producto, categoría, marca o página informativa que no existe: se muestra dentro de la tienda (con menú y pie). */
export default function StoreNotFound() {
  return (
    <div className="bleed relative -mt-8 overflow-hidden bg-paper py-16 sm:py-24">
      <div aria-hidden className="ondas absolute inset-0 [--ondas-x:78%] [--ondas-y:50%]" />
      <div className="relative">
        <p aria-hidden className="rotulo calado text-[clamp(6rem,18vw,13rem)] leading-[0.8] text-ink/70">
          404
        </p>
        <h1 className="rotulo mt-6 text-display">Este pasillo no existe</h1>
        <p className="mt-4 max-w-md text-lg text-muted">Puede que el producto ya no esté disponible o que el enlace tenga un error.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/productos" className="btn-buy px-6 py-3">
            Ver el catálogo
          </Link>
          <Link href="/" className="btn-line px-6 py-3">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
