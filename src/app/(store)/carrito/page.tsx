import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Breadcrumbs, type SP } from "@/components/store/catalog-view";
import { ProductImage } from "@/components/store/product-card";
import { listProducts } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";
import { formatCLP } from "@/modules/chile";

export const metadata: Metadata = { title: "Carrito", robots: { index: false, follow: false } };

/**
 * Solo interfaz: el carrito real (tabla carts, reservas y checkout) es de la FASE 5.
 * Con ?vista_previa=1 se muestran productos destacados reales como ejemplo de diseño, marcado como tal.
 */
export default async function CartPage({ searchParams }: { searchParams: Promise<SP> }) {
  const preview = [(await searchParams).vista_previa].flat()[0] === "1";
  const { visibleIds } = await loadCategories();
  const lines = preview ? (await listProducts({ categoryIds: visibleIds }, { featured: true, inStock: true }, { pageSize: 3 })).items.map((p) => ({ p, qty: 1 })) : [];
  const subtotal = lines.reduce((s, l) => s + l.p.price * l.qty, 0);

  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Carrito" }]} />
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tu carrito</h1>

      {preview && (
        <p role="note" className="mt-4 flex items-start gap-2 rounded-md border border-fleje bg-fleje/20 px-4 py-3 text-sm">
          <Icon name="alert" className="size-5 shrink-0" />
          Vista previa del diseño con productos del catálogo. El carrito se habilita junto con los pedidos.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_22rem]">
        {lines.length ? (
          <ul className="divide-y divide-line rounded-md border border-line bg-white">
            {lines.map(({ p, qty }) => (
              <li key={p.id} className="grid grid-cols-[5rem_1fr] gap-4 p-4 sm:grid-cols-[6rem_1fr_auto]">
                <div className="relative aspect-square overflow-hidden rounded-sm bg-mist">
                  <ProductImage url={p.imageUrl} alt="" brand={p.brandName} label={p.variantName} sizes="96px" thumb />
                </div>
                <div className="min-w-0">
                  {p.brandName && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.brandName}</p>}
                  <Link href={`/producto/${p.slug}`} className="font-semibold hover:text-leaf hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-sm text-muted">{p.variantName}</p>
                  <p className="mt-1 text-sm">{formatCLP(p.price)} c/u</p>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end">
                  <fieldset disabled className="flex items-center rounded-md border border-line">
                    <legend className="sr-only">Cantidad de {p.name}</legend>
                    <span aria-hidden className="grid w-8 place-items-center text-muted">−</span>
                    <span className="w-8 border-x border-line py-1.5 text-center font-semibold">{qty}</span>
                    <span aria-hidden className="grid w-8 place-items-center text-muted">+</span>
                  </fieldset>
                  <p className="text-lg font-extrabold">{formatCLP(p.price * qty)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid place-items-center rounded-md border border-dashed border-line bg-paper px-6 py-16 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-white text-leaf">
              <Icon name="cart" className="size-8" />
            </span>
            <p className="mt-4 text-xl font-bold">Tu carrito está vacío</p>
            <p className="mt-1 max-w-sm text-muted">La compra en línea se habilita muy pronto. Mientras tanto, revisa el catálogo y compara precios.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/productos" className="rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
                Ver productos
              </Link>
              <Link href="/carrito?vista_previa=1" className="rounded-md border border-line bg-white px-5 py-2.5 font-semibold hover:border-leaf">
                Ver vista previa
              </Link>
            </div>
          </div>
        )}

        <aside aria-labelledby="resumen" className="rounded-md border border-line bg-white p-5 lg:sticky lg:top-4">
          <h2 id="resumen" className="text-lg font-bold">
            Resumen
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal ({lines.reduce((s, l) => s + l.qty, 0)} productos)</dt>
              <dd className="font-semibold">{formatCLP(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Despacho</dt>
              <dd>Se calcula según tu comuna</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="text-2xl font-extrabold">{formatCLP(subtotal)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-muted">IVA incluido</p>
          <button type="button" disabled className="mt-5 w-full rounded-md bg-leaf px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-leaf/60">
            Continuar con la compra
          </button>
          <Link href="/productos" className="mt-3 block text-center text-sm font-medium text-leaf hover:underline">
            Seguir comprando
          </Link>
        </aside>
      </div>
    </>
  );
}
