import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { Icon } from "@/components/icons";
import { CartLineControls } from "@/components/store/cart-forms";
import { Breadcrumbs } from "@/components/store/catalog-view";
import { ProductImage } from "@/components/store/product-card";
import { currentCartId, getCart, MAX_ITEM_QTY } from "@/modules/cart";
import { formatCLP } from "@/modules/chile";
import { getSettings } from "@/modules/settings";

export const metadata: Metadata = { title: "Carrito", robots: { index: false, follow: false } };

/** Carrito con precios y stock actuales (se leen de la base en cada visita; el carrito no reserva stock). */
export default async function CartPage() {
  const [{ lines, subtotal, count, ready }, st] = await Promise.all([getCart(await currentCartId()), getSettings()]);
  const free = st.freeShippingFrom;

  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Carrito" }]} />
      <h1 id="carrito-titulo" tabIndex={-1} className="rotulo text-display outline-none">
        Tu carrito
      </h1>

      {lines.length > 0 && !ready && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-2xl border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
          <Icon name="alert" className="size-5 shrink-0" />
          Algunos productos cambiaron de disponibilidad. Ajusta las cantidades marcadas para continuar.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_23rem]">
        {lines.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-line">
            {lines.map((l) => (
              // Al quitar un producto su fila se apaga y las de abajo suben a su lugar (ver globals.css, «Filas del carrito»).
              <ViewTransition key={l.variantId} update="fila" exit="fila-sale" default="none">
              <li className="grid grid-cols-[5rem_1fr] gap-4 p-4 sm:grid-cols-[6rem_1fr_auto] sm:p-5">
                <div className="relative aspect-square overflow-hidden rounded-xl">
                  <ProductImage url={l.imageUrl} alt="" brand={l.brandName} label={l.variantName} sizes="96px" thumb />
                </div>
                <div className="min-w-0">
                  {l.brandName && <p className="etiqueta text-muted">{l.brandName}</p>}
                  {l.sellable ? (
                    <Link href={`/producto/${l.slug}?variante=${encodeURIComponent(l.sku)}`} className="mt-0.5 inline-block font-semibold transition-colors hover:text-leaf-dark hover:underline">
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
                  <p className="rotulo text-2xl">{formatCLP(l.lineTotal)}</p>
                </div>
              </li>
              </ViewTransition>
            ))}
          </ul>
        ) : (
          <div className="relative grid place-items-center overflow-hidden rounded-[1.5rem] bg-paper px-6 py-16 text-center">
            <div aria-hidden className="ondas absolute inset-0 [--ondas-x:50%] [--ondas-y:28%]" />
            <span className="relative grid size-16 place-items-center rounded-full bg-white text-leaf ring-1 ring-line">
              <Icon name="cart" className="size-8" />
            </span>
            <p className="rotulo relative mt-5 text-title">Tu carrito está vacío</p>
            <p className="relative mt-2 max-w-sm text-muted">Agrega productos desde el catálogo; aquí verás el total con IVA incluido.</p>
            <Link href="/productos" className="btn-buy relative mt-6 px-6 py-3">
              Ver productos
            </Link>
          </div>
        )}

        <aside aria-labelledby="resumen" className="rounded-[1.5rem] bg-paper p-6 ring-1 ring-line lg:sticky lg:top-4">
          <h2 id="resumen" className="etiqueta text-leaf-dark">
            Resumen
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal ({count === 1 ? "1 producto" : `${count} productos`})</dt>
              <dd className="font-semibold">{formatCLP(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Despacho</dt>
              <dd>{free !== null && subtotal >= free ? "Gratis" : "Se calcula según tu comuna"}</dd>
            </div>
            {free !== null && (
              <div className="rounded-xl bg-leaf-soft px-3 py-2 text-xs font-medium text-leaf-dark">
                {subtotal >= free ? (
                  "¡Tu compra tiene despacho gratis!"
                ) : (
                  <>
                    Te faltan {formatCLP(free - subtotal)} para el despacho gratis.
                    <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white">
                      <span className="block h-full rounded-full bg-leaf" style={{ width: `${Math.round((subtotal / free) * 100)}%` }} />
                    </span>
                  </>
                )}
              </div>
            )}
            <div className="flex items-end justify-between border-t border-dashed border-ink/25 pt-4 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="rotulo text-4xl leading-none">{formatCLP(subtotal)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-muted">IVA incluido</p>
          {ready ? (
            <Link href="/checkout" className="btn-buy mt-6 w-full px-5 py-3.5 text-lg">
              Continuar con la compra
            </Link>
          ) : (
            <button type="button" disabled className="mt-6 w-full cursor-not-allowed rounded-full bg-mist px-5 py-3.5 text-lg font-bold text-muted">
              Continuar con la compra
            </button>
          )}
          <Link href="/productos" className="mt-2 block py-3 text-center text-sm font-semibold text-leaf-dark underline-offset-2 hover:underline">
            Seguir comprando
          </Link>
        </aside>
      </div>
    </>
  );
}
