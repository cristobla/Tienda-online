import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { CartLineControls } from "@/components/store/cart-forms";
import { Breadcrumbs } from "@/components/store/catalog-view";
import { ProductImage } from "@/components/store/product-card";
import { currentCartId, getCart, MAX_ITEM_QTY } from "@/modules/cart";
import { formatCLP } from "@/modules/chile";

export const metadata: Metadata = { title: "Carrito", robots: { index: false, follow: false } };

/** Carrito con precios y stock actuales (se leen de la base en cada visita; el carrito no reserva stock). */
export default async function CartPage() {
  const { lines, subtotal, count, ready } = await getCart(await currentCartId());

  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Carrito" }]} />
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tu carrito</h1>

      {lines.length > 0 && !ready && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
          <Icon name="alert" className="size-5 shrink-0" />
          Algunos productos cambiaron de disponibilidad. Ajusta las cantidades marcadas para continuar.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_22rem]">
        {lines.length ? (
          <ul className="divide-y divide-line rounded-md border border-line bg-white">
            {lines.map((l) => (
              <li key={l.variantId} className="grid grid-cols-[5rem_1fr] gap-4 p-4 sm:grid-cols-[6rem_1fr_auto]">
                <div className="relative aspect-square overflow-hidden rounded-sm bg-mist">
                  <ProductImage url={l.imageUrl} alt="" brand={l.brandName} label={l.variantName} sizes="96px" thumb />
                </div>
                <div className="min-w-0">
                  {l.brandName && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{l.brandName}</p>}
                  {l.sellable ? (
                    <Link href={`/producto/${l.slug}?variante=${encodeURIComponent(l.sku)}`} className="font-semibold hover:text-leaf hover:underline">
                      {l.productName}
                    </Link>
                  ) : (
                    <p className="font-semibold">{l.productName}</p>
                  )}
                  <p className="text-sm text-muted">{l.variantName}</p>
                  <p className="mt-1 text-sm">{formatCLP(l.price)} c/u</p>
                  {l.problem && (
                    <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-oferta">
                      <Icon name="alert" className="size-4 shrink-0" />
                      {l.problem}
                    </p>
                  )}
                </div>
                <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end">
                  <CartLineControls
                    // key: tras cada cambio el formulario se monta de nuevo con la cantidad nueva y sin el error anterior.
                    key={l.quantity}
                    variantId={l.variantId}
                    name={`${l.productName} ${l.variantName}`}
                    quantity={l.quantity}
                    canIncrease={l.sellable && l.quantity < Math.min(l.available, MAX_ITEM_QTY)}
                    fixTo={l.sellable && l.available > 0 && l.available < l.quantity ? l.available : undefined}
                  />
                  <p className="text-lg font-extrabold">{formatCLP(l.lineTotal)}</p>
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
            <p className="mt-1 max-w-sm text-muted">Agrega productos desde el catálogo; aquí verás el total con IVA incluido.</p>
            <Link href="/productos" className="mt-6 rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
              Ver productos
            </Link>
          </div>
        )}

        <aside aria-labelledby="resumen" className="rounded-md border border-line bg-white p-5 lg:sticky lg:top-4">
          <h2 id="resumen" className="text-lg font-bold">
            Resumen
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal ({count === 1 ? "1 producto" : `${count} productos`})</dt>
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
          {ready ? (
            <Link href="/checkout" className="mt-5 block w-full rounded-md bg-leaf px-5 py-3 text-center font-bold text-white hover:bg-leaf-dark">
              Continuar con la compra
            </Link>
          ) : (
            <button type="button" disabled className="mt-5 w-full cursor-not-allowed rounded-md bg-leaf/60 px-5 py-3 font-bold text-white">
              Continuar con la compra
            </button>
          )}
          <Link href="/productos" className="mt-3 block text-center text-sm font-medium text-leaf hover:underline">
            Seguir comprando
          </Link>
        </aside>
      </div>
    </>
  );
}
