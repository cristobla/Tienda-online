import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminForm, Submit, Text, TextArea } from "@/components/admin/form";
import { Icon } from "@/components/icons";
import { AutoSubmitForm } from "@/components/store/auto-submit-form";
import { Breadcrumbs, type SP } from "@/components/store/catalog-view";
import { db } from "@/db";
import { UserError } from "@/lib/form";
import { mapsLink, pickupAvailable, shippingCost, storeAddressLine } from "@/lib/site";
import { currentCartId, getCart } from "@/modules/cart";
import { formatCLP } from "@/modules/chile";
import { checkoutMethods, formatMinutes } from "@/modules/payments";
import { applyCoupon } from "@/modules/promotions";
import { getSettings } from "@/modules/settings";
import { listDeliveryCommunes, quoteShipping } from "@/modules/shipping";
import { checkoutAction } from "./actions";

export const metadata: Metadata = { title: "Finalizar compra", robots: { index: false, follow: false } };

const card = "rounded-[1.5rem] bg-white p-5 ring-1 ring-line sm:p-6";
const step = "rotulo grid size-9 shrink-0 place-items-center rounded-full text-lg text-white";

/**
 * Checkout en dos pasos que funcionan sin JavaScript: 1) la entrega: comuna de despacho (GET ?comuna=, calcula el
 * costo) o retiro en el local (?entrega=retiro, si el local lo ofrece); 2) datos (y dirección si es despacho), POST.
 * El total que el cliente ve viaja como expectedTotal y el servidor lo vuelve a calcular.
 */
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<SP> }) {
  const cart = await getCart(await currentCartId());
  if (!cart.ready) redirect("/carrito"); // vacío o con productos por ajustar: el carrito explica qué hacer
  const sp = await searchParams;
  const st = await getSettings();
  const canPickup = pickupAvailable(st);
  const pickup = canPickup && [sp.entrega].flat()[0] === "retiro";
  const raw = Number([sp.comuna].flat()[0]);
  const communeId = !pickup && Number.isInteger(raw) && raw > 0 ? raw : null;
  const [groups, quote, methods] = await Promise.all([listDeliveryCommunes(), communeId ? quoteShipping(communeId) : null, checkoutMethods()]);
  const ready = pickup || !!quote;
  // Cupón (?cupon=): vista previa; al confirmar, el servidor lo vuelve a validar con el email y bloqueado.
  const code = String([sp.cupon].flat()[0] ?? "").trim().slice(0, 40);
  let coupon: Awaited<ReturnType<typeof applyCoupon>> | null = null;
  let couponError: string | null = null;
  if (code)
    try {
      coupon = await applyCoupon(db, code, { subtotal: cart.subtotal, email: null });
    } catch (e) {
      if (!(e instanceof UserError)) throw e;
      couponError = e.message;
    }
  const discount = coupon?.discount ?? 0;
  const goods = cart.subtotal - discount;
  const ship = quote ? shippingCost(quote.cost, goods, st) : 0;
  const total = goods + ship;
  const missingForFree = st.freeShippingFrom !== null && !pickup && goods < st.freeShippingFrom ? st.freeShippingFrom - goods : null;
  // Parámetros que cada formulario GET debe conservar.
  const keepCoupon = coupon ? `&cupon=${encodeURIComponent(coupon.code)}` : "";
  const here = pickup ? "?entrega=retiro" : communeId ? `?comuna=${communeId}` : "?";
  const option = "rounded-2xl border-[1.5px] p-4 transition-colors";

  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Carrito", href: "/carrito" }, { name: "Finalizar compra" }]} />
      <h1 className="rotulo text-display">Finalizar compra</h1>

      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_23rem]">
        <div className="grid min-w-0 gap-6">
          <section aria-labelledby="paso-despacho" className={card}>
            <h2 id="paso-despacho" className="flex items-center gap-3 text-xl font-bold">
              <span className={`${step} bg-ink`}>1</span>
              Entrega
            </h2>
            {canPickup && (
              <div className={`mt-4 ${option} ${pickup ? "border-ink bg-leaf-soft" : "border-line"}`}>
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">Retiro en el local</span>
                  <span className="rounded-full bg-menta px-2.5 py-0.5 text-xs font-bold text-ink">Gratis</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {storeAddressLine(st)}
                  {st.hours && <> · {st.hours}</>}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {pickup ? (
                    <span className="flex items-center gap-1.5 font-semibold text-leaf-dark">
                      <Icon name="check" className="size-4" />
                      Elegiste retirar en el local. Te avisamos por correo cuando esté listo.
                    </span>
                  ) : (
                    <Link href={`/checkout?entrega=retiro${keepCoupon}`} scroll={false} className="btn-line px-4 py-1.5">
                      Retirar en el local
                    </Link>
                  )}
                  <a href={mapsLink(st)!} target="_blank" rel="noopener" className="font-medium text-leaf-dark underline-offset-2 hover:underline">
                    Ver en Google Maps
                  </a>
                </p>
              </div>
            )}
            {canPickup && <p className="mt-5 text-sm font-semibold">{pickup ? "¿Prefieres despacho a domicilio?" : "O despacho a domicilio"}</p>}
            {groups.length ? (
              <AutoSubmitForm action="/checkout" className={`${canPickup ? "mt-2" : "mt-4"} flex flex-wrap items-end gap-3`}>
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
                {coupon && <input type="hidden" name="cupon" value={coupon.code} />}
                <button className="btn-line px-5 py-2">Calcular despacho</button>
              </AutoSubmitForm>
            ) : (
              <p className="mt-3 text-muted">Por ahora no hay despachos disponibles. Vuelve a intentarlo pronto.</p>
            )}
            {quote && (
              <p className="mt-5 flex animate-drop-in items-start gap-2 rounded-2xl bg-leaf-soft px-4 py-3 text-sm text-leaf-dark">
                <Icon name="truck" className="size-5 shrink-0" />
                <span>
                  Despacho a <strong>{quote.commune}</strong>, {quote.region}: <strong>{ship ? formatCLP(ship) : "gratis"}</strong>
                  {quote.cost > 0 && !ship && " por compra sobre " + formatCLP(st.freeShippingFrom ?? 0)}
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

          <section aria-labelledby="paso-datos" className={`${card} ${ready ? "" : "opacity-60"}`}>
            <h2 id="paso-datos" className="flex items-center gap-3 text-xl font-bold">
              <span className={`${step} ${ready ? "bg-ink" : "bg-muted"}`}>2</span>
              {pickup ? "Tus datos" : "Tus datos y dirección"}
            </h2>
            {ready ? (
              <AdminForm action={checkoutAction} className="mt-4 space-y-4">
                <input type="hidden" name="delivery" value={pickup ? "retiro" : "despacho"} />
                {quote && <input type="hidden" name="communeId" value={quote.communeId} />}
                {coupon && <input type="hidden" name="couponCode" value={coupon.code} />}
                {/* Lo que el cliente ve en el resumen; si al confirmar cambió (precio o despacho), el pedido no se crea. */}
                <input type="hidden" name="expectedTotal" value={total} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Text name="firstName" label="Nombre" autoComplete="given-name" maxLength={100} required />
                  <Text name="lastName" label="Apellido" autoComplete="family-name" maxLength={100} required />
                  <Text name="email" label="Email" type="email" autoComplete="email" maxLength={200} required hint="Para avisarte del estado del pedido." />
                  <Text name="phone" label="Teléfono" type="tel" autoComplete="tel" maxLength={30} required hint="Ej.: 9 1234 5678" />
                  {!pickup && (
                    <>
                      <Text name="street" label="Calle" autoComplete="address-line1" maxLength={120} required className="sm:col-span-2" />
                      <Text name="number" label="Número" maxLength={20} required />
                      <Text name="apartment" label="Depto. / casa / oficina" autoComplete="address-line2" maxLength={40} hint="Opcional" />
                    </>
                  )}
                  <Text name="rut" label="RUT" maxLength={30} hint="Opcional" />
                </div>
                {!pickup && <TextArea name="notes" label="Indicaciones para el despacho" rows={2} maxLength={300} hint="Opcional. Ej.: dejar en conserjería." />}
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">Medio de pago</legend>
                  {methods.length ? (
                    <div className="grid gap-2">
                      {methods.map((m, i) => (
                        <label key={m.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border-[1.5px] border-line p-4 transition-colors hover:border-ink/40 has-[:checked]:border-ink has-[:checked]:bg-leaf-soft">
                          <input type="radio" name="paymentMethod" value={m.id} defaultChecked={i === 0} required className="mt-1 size-4 accent-leaf" />
                          <span className="text-sm">
                            <span className="font-semibold">{m.label}</span>
                            {m.testOnly && <span className="ml-2 rounded-full bg-oferta px-2 py-0.5 text-xs font-bold text-white">PRUEBA</span>}
                            <span className="block text-muted">{m.description}</span>
                            <span className="block text-muted">Reservamos tus productos por {formatMinutes(m.reservationMinutes)} mientras se completa el pago.</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p role="alert" className="text-sm font-medium text-oferta">
                      Por ahora no hay medios de pago disponibles. Vuelve a intentarlo pronto.
                    </p>
                  )}
                </fieldset>
                {methods.length > 0 && (
                  <Submit variant="buy" pendingText="Confirmando…">
                    Confirmar pedido · {formatCLP(total)}
                  </Submit>
                )}
              </AdminForm>
            ) : (
              <p className="mt-3 text-sm text-muted">{canPickup ? "Primero elige retiro en el local o la comuna de despacho." : "Primero elige la comuna de despacho."}</p>
            )}
          </section>
        </div>

        <aside aria-labelledby="resumen" className="rounded-[1.5rem] bg-paper p-6 ring-1 ring-line lg:sticky lg:top-4">
          <h2 id="resumen" className="etiqueta text-leaf-dark">
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
            {coupon && (
              <div className="flex justify-between text-leaf-dark">
                <dt>
                  Cupón <span className="font-mono font-semibold">{coupon.code}</span>
                  {coupon.label && ` (${coupon.label})`}
                </dt>
                <dd className="font-semibold">−{formatCLP(discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">{pickup ? "Retiro en el local" : "Despacho"}</dt>
              <dd>{pickup ? "Gratis" : quote ? (ship ? formatCLP(ship) : "Gratis") : "Elige tu comuna"}</dd>
            </div>
            {missingForFree !== null && (
              <p className="rounded-xl bg-leaf-soft px-3 py-2 text-xs font-medium text-leaf-dark">Te faltan {formatCLP(missingForFree)} para el despacho gratis.</p>
            )}
            <div className="flex items-end justify-between border-t border-dashed border-ink/25 pt-4 text-base">
              <dt className="font-bold">Total</dt>
              <dd className="rotulo text-4xl leading-none">{formatCLP(total)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-right text-xs text-muted">IVA incluido</p>
          {/* Formulario GET: funciona sin JavaScript y conserva la entrega elegida. */}
          <form action="/checkout" className="mt-4 border-t border-line pt-4">
            {pickup && <input type="hidden" name="entrega" value="retiro" />}
            {communeId && <input type="hidden" name="comuna" value={communeId} />}
            <label htmlFor="cupon" className="mb-1 block text-sm font-semibold">
              ¿Tienes un cupón?
            </label>
            <div className="flex gap-2">
              <input
                id="cupon"
                name="cupon"
                defaultValue={coupon?.code ?? code}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
                aria-invalid={couponError ? true : undefined}
                aria-describedby={couponError ? "cupon-error" : undefined}
                className="w-full min-w-0 rounded-md border border-line bg-white px-3 py-2 font-mono uppercase"
              />
              <button className="btn-line shrink-0 px-4 py-2">Aplicar</button>
            </div>
            {couponError && (
              <p id="cupon-error" role="alert" className="mt-1 text-xs font-medium text-oferta">
                {couponError}
              </p>
            )}
            {coupon && (
              <Link href={`/checkout${here}`} scroll={false} className="mt-1 inline-block text-xs font-semibold text-muted underline-offset-2 hover:underline">
                Quitar cupón
              </Link>
            )}
          </form>
          <Link href="/carrito" className="mt-4 block text-center text-sm font-semibold text-leaf-dark underline-offset-2 hover:underline">
            Editar carrito
          </Link>
        </aside>
      </div>
    </>
  );
}
