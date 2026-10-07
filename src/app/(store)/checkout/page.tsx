import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminForm, Submit, Text, TextArea } from "@/components/admin/form";
import { Icon } from "@/components/icons";
import { AutoSubmitForm } from "@/components/store/auto-submit-form";
import { Breadcrumbs, type SP } from "@/components/store/catalog-view";
import { env } from "@/lib/env";
import { currentCartId, getCart } from "@/modules/cart";
import { formatCLP } from "@/modules/chile";
import { listDeliveryCommunes, quoteShipping } from "@/modules/shipping";
import { checkoutAction } from "./actions";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false, follow: false } };

const card = "rounded-md border border-line bg-white p-5";

/**
 * Checkout en dos pasos que funcionan sin JavaScript: 1) elegir la comuna (GET ?comuna=, calcula el despacho);
 * 2) datos y dirección (POST). El total que el cliente ve viaja como expectedTotal y el servidor lo vuelve a calcular.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  const cart = await getCart(await currentCartId());
  if (!cart.ready) redirect("/carrito"); // vacío o con productos por ajustar: el carrito explica qué hacer
  const raw = Number([(await searchParams).comuna].flat()[0]);
  const communeId = Number.isInteger(raw) && raw > 0 ? raw : null;
  const [groups, quote] = await Promise.all([listDeliveryCommunes(), communeId ? quoteShipping(communeId) : null]);
  const total = cart.subtotal + (quote?.cost ?? 0);

  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Carrito", href: "/carrito" }, { name: "Finalizar compra" }]} />
      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Finalizar compra</h1>

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 gap-6">
          <section aria-labelledby="paso-despacho" className={card}>
            <h2 id="paso-despacho" className="flex items-center gap-2 text-lg font-bold">
              <span className="grid size-7 place-items-center rounded-full bg-leaf text-sm text-white">1</span>
              Despacho
            </h2>
            {groups.length ? (
              <AutoSubmitForm action="/checkout" className="mt-4 flex flex-wrap items-end gap-3">
                <label className="w-full min-w-0 sm:w-auto sm:flex-1">
                  <span className="mb-1 block text-sm font-semibold">Comuna de despacho</span>
                  <select name="comuna" defaultValue={communeId ?? ""} required className="w-full rounded-md border border-line bg-white px-3 py-2">
                    <option value="" disabled>
                      Elige tu comuna
                    </option>
                    {groups.map((g) => (
                      <optgroup key={g.region} label={g.region}>
                        {g.communes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <button className="rounded-md border border-line bg-white px-4 py-2 font-semibold hover:border-leaf">Calcular despacho</button>
              </AutoSubmitForm>
            ) : (
              <p className="mt-3 text-muted">Por ahora no hay despachos disponibles. Vuelve a intentarlo pronto.</p>
            )}
            {quote && (
              <p className="mt-4 flex items-start gap-2 rounded-md bg-leaf-soft px-4 py-3 text-sm text-leaf-dark">
                <Icon name="truck" className="size-5 shrink-0" />
                <span>
                  Despacho a <strong>{quote.commune}</strong>, {quote.region}: <strong>{quote.cost ? formatCLP(quote.cost) : "gratis"}</strong>
                  {quote.eta && <> · {quote.eta}</>}
                </span>
              </p>
            )}
            {communeId && !quote && (
              <p role="alert" className="mt-4 text-sm font-medium text-oferta">
                Por ahora no despachamos a esa comuna.
              </p>
            )}
          </section>

          <section aria-labelledby="paso-datos" className={`${card} ${quote ? "" : "opacity-60"}`}>
            <h2 id="paso-datos" className="flex items-center gap-2 text-lg font-bold">
              <span className={`grid size-7 place-items-center rounded-full text-sm text-white ${quote ? "bg-leaf" : "bg-muted"}`}>2</span>
              Tus datos y dirección
            </h2>
            {quote ? (
              <AdminForm action={checkoutAction} className="mt-4 space-y-4">
                <input type="hidden" name="communeId" value={quote.communeId} />
                {/* Lo que el cliente ve en el resumen; si al confirmar cambió (precio o despacho), el pedido no se crea. */}
                <input type="hidden" name="expectedTotal" value={total} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Text name="firstName" label="Nombre" autoComplete="given-name" maxLength={100} required />
                  <Text name="lastName" label="Apellido" autoComplete="family-name" maxLength={100} required />
                  <Text name="email" label="Email" type="email" autoComplete="email" maxLength={200} required hint="Para avisarte del estado del pedido." />
                  <Text name="phone" label="Teléfono" type="tel" autoComplete="tel" maxLength={30} required hint="Ej.: 9 1234 5678" />
                  <Text name="street" label="Calle" autoComplete="address-line1" maxLength={120} required className="sm:col-span-2" />
                  <Text name="number" label="Número" maxLength={20} required />
                  <Text name="apartment" label="Depto. / casa / oficina" autoComplete="address-line2" maxLength={40} hint="Opcional" />
                  <Text name="rut" label="RUT" maxLength={30} hint="Opcional" />
                </div>
                <TextArea name="notes" label="Indicaciones para el despacho" rows={2} maxLength={300} hint="Opcional. Ej.: dejar en conserjería." />
                <p className="text-sm text-muted">
                  Al confirmar reservamos tus productos por {env.RESERVATION_TTL_MINUTES} minutos mientras se completa el pago.
                </p>
                <Submit pendingText="Confirmando…">Confirmar pedido · {formatCLP(total)}</Submit>
              </AdminForm>
            ) : (
              <p className="mt-3 text-sm text-muted">Primero elige la comuna de despacho.</p>
            )}
          </section>
        </div>

        <aside aria-labelledby="resumen" className={`${card} lg:sticky lg:top-4`}>
          <h2 id="resumen" className="text-lg font-bold">
            Resumen
          </h2>
          <ul className="mt-4 divide-y divide-line text-sm">
            {cart.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block font-medium">{l.productName}</span>
                  <span className="text-muted">
                    {l.variantName} · {l.quantity} × {formatCLP(l.price)}
                  </span>
                </span>
                <span className="whitespace-nowrap font-semibold">{formatCLP(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-semibold">{formatCLP(cart.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Despacho</dt>
              <dd>{quote ? (quote.cost ? formatCLP(quote.cost) : "Gratis") : "Elige tu comuna"}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-3 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="text-2xl font-extrabold">{formatCLP(total)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-muted">IVA incluido</p>
          <Link href="/carrito" className="mt-4 block text-center text-sm font-medium text-leaf hover:underline">
            Editar carrito
          </Link>
        </aside>
      </div>
    </>
  );
}
