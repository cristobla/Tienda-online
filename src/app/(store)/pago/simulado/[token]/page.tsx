import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatCLP } from "@/modules/chile";
import { inboundProvider, simulator } from "@/modules/payments";
import type { SimDecision } from "./decision/route";

export const metadata: Metadata = { title: "Pasarela simulada", robots: { index: false, follow: false } };

const CHOICES: [SimDecision, string, string][] = [
  ["PAID", "Aprobar el pago", "bg-leaf text-white hover:bg-leaf-dark"],
  ["FAILED", "Rechazar (tarjeta rechazada)", "border border-line hover:border-oferta"],
  ["CANCELLED", "Cancelar y volver a la tienda", "border border-line hover:border-oferta"],
  ["OTHER_AMOUNT", "Cobrar otro monto (+$1.000)", "border border-line hover:border-leaf"],
  ["TIMEOUT", "Aprobar, pero la consulta no responde", "border border-line hover:border-leaf"],
  ["WEBHOOK_ONLY", "Aprobar y cerrar la pestaña (solo notificación)", "border border-line hover:border-leaf"],
];

/** Página "del proveedor" para probar el flujo completo en local. Nunca existe en producción. */
export default async function SimulatedGatewayPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ notificado?: string }> }) {
  const { token } = await params;
  if (!(await inboundProvider("simulado"))) notFound();
  const s = simulator.get(token);
  if (!s) notFound();
  const notified = (await searchParams).notificado === "1";

  return (
    <div className="mx-auto max-w-lg rounded-md border-2 border-dashed border-oferta bg-white p-6">
      <p className="text-xs font-bold tracking-wide text-oferta">ENTORNO DE PRUEBAS · NO MUEVE DINERO</p>
      <h1 className="mt-2 text-2xl font-extrabold">Pasarela simulada</h1>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted">Pedido</dt>
        <dd className="font-mono">{s.orderNumber}</dd>
        <dt className="text-muted">Monto</dt>
        <dd className="font-semibold">{formatCLP(s.amount)}</dd>
        <dt className="text-muted">Estado en la pasarela</dt>
        <dd>{s.status}</dd>
      </dl>
      {notified ? (
        <p role="status" className="mt-5 text-sm">
          Notificación enviada a la tienda. Vuelve a la pestaña del pedido: se actualiza sola.
        </p>
      ) : s.status === "PENDING" ? (
        <div className="mt-6 grid gap-2">
          {CHOICES.map(([d, label, style]) => (
            // Formulario HTML normal: la vuelta a la tienda es una navegación completa, como desde una pasarela real.
            <form key={d} method="post" action={`/pago/simulado/${token}/decision`}>
              <input type="hidden" name="d" value={d} />
              <button className={`w-full rounded-md px-4 py-2 text-left font-semibold ${style}`}>{label}</button>
            </form>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted">Esta transacción ya terminó en la pasarela.</p>
      )}
    </div>
  );
}
