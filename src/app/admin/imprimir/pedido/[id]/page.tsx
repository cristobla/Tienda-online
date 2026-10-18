import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BrandMark } from "@/components/store/shell";
import { formatPhone, storeAddressLine } from "@/lib/site";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { getOrder, statusLabel } from "@/modules/orders";
import { getProvider } from "@/modules/payments";
import { getSettings } from "@/modules/settings";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Hoja de pedido", robots: { index: false, follow: false } };

/**
 * Hoja para preparar y entregar el pedido (A4, blanco y negro): productos con casillas para marcar, datos de
 * despacho o retiro y firma de recepción. Fuera del layout del panel para imprimir sin menú.
 */
export default async function PrintOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("orders:read");
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getOrder(id) : null;
  if (!data) notFound();
  const { order: o, items } = data;
  const st = await getSettings();
  const a = o.shippingAddress;
  const pickup = o.fulfillment === "PICKUP";
  const units = items.reduce((n, i) => n + i.quantity, 0);
  const cell = "border-b border-black/30 px-2 py-1.5 align-top";

  return (
    <main className="mx-auto max-w-[21cm] bg-white p-8 text-[13px] leading-snug text-black print:p-0">
      <style>{"@page { size: A4; margin: 12mm } body { background: white }"}</style>
      <div className="mb-6 flex justify-end gap-2 print:hidden">
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
        <div>
          <p className="flex items-center gap-2 text-xl font-extrabold">
            <BrandMark className="size-7" />
            {st.name}
          </p>
          {storeAddressLine(st) && <p className="mt-1">{storeAddressLine(st)}</p>}
          {(st.whatsapp || st.email) && <p>{[st.whatsapp && formatPhone(st.whatsapp), st.email].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold">{o.orderNumber}</p>
          <p>{formatDateTime(o.createdAt)}</p>
          <p className="mt-1 inline-block border-2 border-black px-2 py-0.5 text-sm font-bold uppercase">{pickup ? "Retiro en el local" : "Despacho"}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase">Cliente</h2>
          <p className="font-semibold">{o.customerName}</p>
          {o.phone && <p>{formatPhone(o.phone)}</p>}
          <p>{o.email}</p>
          {o.rut && <p>RUT {o.rut}</p>}
        </div>
        <div>
          <h2 className="mb-1 text-xs font-bold uppercase">{pickup ? "Retira" : "Despachar a"}</h2>
          {pickup ? (
            <p>Retira en el local con el número de pedido.</p>
          ) : a ? (
            <>
              <p className="font-semibold">{a.recipientName}</p>
              <p>
                {a.street} {a.number}
                {a.apartment && `, ${a.apartment}`}
              </p>
              <p>
                {a.commune}, {a.region}
              </p>
              {a.notes && <p className="mt-1 italic">Indicaciones: {a.notes}</p>}
            </>
          ) : (
            <p>Sin dirección registrada.</p>
          )}
        </div>
      </section>

      <p className="mt-3">
        Estado: <strong>{statusLabel(o.status, o.fulfillment)}</strong>
        {o.paidAt && <> · pagado el {formatDateTime(o.paidAt)}</>}
        {o.paymentMethod && <> · {getProvider(o.paymentMethod)?.label ?? o.paymentMethod}</>}
      </p>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="text-left text-xs uppercase">
            <th className={`${cell} w-8`}>✓</th>
            <th className={cell}>Producto</th>
            <th className={cell}>SKU</th>
            <th className={`${cell} text-right`}>Cant.</th>
            <th className={`${cell} text-right`}>Precio</th>
            <th className={`${cell} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td className={cell}>
                <span className="inline-block size-4 border-2 border-black" />
              </td>
              <td className={cell}>
                <span className="font-semibold">{i.productName}</span>
                <span className="block text-xs">{i.variantName}</span>
              </td>
              <td className={`${cell} font-mono text-xs`}>{i.sku}</td>
              <td className={`${cell} text-right text-base font-bold`}>{i.quantity}</td>
              <td className={`${cell} text-right`}>{formatCLP(i.unitPrice)}</td>
              <td className={`${cell} text-right`}>{formatCLP(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-between gap-6">
        <p>
          {items.length} {items.length === 1 ? "producto" : "productos"} · {units} {units === 1 ? "unidad" : "unidades"}
        </p>
        <dl className="w-64 space-y-0.5">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{formatCLP(o.subtotal)}</dd>
          </div>
          {o.discountTotal > 0 && (
            <div className="flex justify-between">
              <dt>Descuento{o.couponCode && ` (${o.couponCode})`}</dt>
              <dd>−{formatCLP(o.discountTotal)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>{pickup ? "Retiro" : "Despacho"}</dt>
            <dd>{o.shippingTotal ? formatCLP(o.shippingTotal) : "Gratis"}</dd>
          </div>
          <div className="flex justify-between border-t-2 border-black pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd>{formatCLP(o.total)}</dd>
          </div>
        </dl>
      </div>

      <section className="mt-12 grid grid-cols-2 gap-10 text-xs">
        <p className="border-t border-black pt-1">Preparado por</p>
        <p className="border-t border-black pt-1">Recibí conforme (nombre, RUT y firma)</p>
      </section>
      <p className="mt-6 text-center text-[11px]">Este documento no es una boleta. Precios con IVA incluido.</p>
    </main>
  );
}
