import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Submit, Text, TextArea } from "@/components/admin/form";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/modules/orders";
import { getPayment, getProvider, SOURCE_LABELS } from "@/modules/payments";
import { ORDER_TONE, PAYMENT_TONE } from "../../pedidos/labels";
import { confirmTransferAction, resolveIncidentAction } from "../actions";

export const metadata: Metadata = { title: "Pago" };

const EVENT_TONE = { RECEIVED: "warn", PROCESSED: "ok", FAILED: "bad", IGNORED: "off" } as const;
const EVENT_LABEL = { RECEIVED: "Recibido", PROCESSED: "Procesado", FAILED: "Falló (se reintenta)", IGNORED: "Ignorado" } as const;
const MONEY = ["PAID", "REVIEW", "REFUNDED", "PARTIALLY_REFUNDED"];
const todayInChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaffPage("orders:read");
  const { id } = await params;
  const data = z.uuid().safeParse(id).success ? await getPayment(id) : null;
  if (!data) notFound();
  const { payment: x, order: o, verifiedBy, events } = data;
  const provider = getProvider(x.provider);
  const canManage = can(user.role, "payments:manage");
  const confirmable = canManage && provider?.capabilities.manualConfirmation && !MONEY.includes(x.status);
  const action = x.checkout;
  const row = (label: string, value: React.ReactNode) => (
    <div key={label} className="grid grid-cols-[10rem_1fr] gap-2 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );

  return (
    <>
      <PageHeader title={`Pago ${x.reference}`} back={{ href: "/admin/pagos", label: "Pagos" }} />
      <p className="-mt-4 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        {provider?.label ?? x.provider}
        {provider?.testOnly && <Badge tone="bad">Prueba: no mueve dinero</Badge>}
        <Badge tone={PAYMENT_TONE[x.status]}>{PAYMENT_STATUS_LABELS[x.status]}</Badge>
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid min-w-0 gap-6">
          <Section title="Intento">
            <dl className="divide-y divide-line text-sm">
              {row(
                "Pedido",
                <>
                  <Link href={`/admin/pedidos/${o.id}`} className="font-mono font-semibold text-leaf hover:underline">
                    {o.orderNumber}
                  </Link>{" "}
                  <Badge tone={ORDER_TONE[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  <span className="block text-xs text-muted">
                    {o.customerName} · {o.email}
                  </span>
                </>,
              )}
              {row("Intento", `N.º ${x.attempt} · creado el ${formatDateTime(x.createdAt)}`)}
              {row("Monto esperado", <strong>{formatCLP(x.amount)}</strong>)}
              {row("Dinero recibido", x.receivedAmount ? `${formatCLP(x.receivedAmount)}${x.receivedAt ? ` · ${formatDateTime(x.receivedAt)}` : ""}` : "—")}
              {row("Verificado", x.verifiedAt ? `${formatDateTime(x.verifiedAt)} · ${verifiedBy ?? "consulta al proveedor"}` : "—")}
              {row("Plazo", x.expiresAt ? formatDateTime(x.expiresAt) : "—")}
              {row("Ambiente / cuenta", `${x.environment}${x.account ? ` · ${x.account}` : ""}`)}
              {row("Ref. del proveedor", x.providerReference ? <span className="font-mono">{x.providerReference}</span> : "—")}
              {x.incident && row("Incidencia", <span className="font-medium text-oferta">{x.incident}</span>)}
              {x.lastError && row("Último error", <span className="text-oferta">{x.lastError}</span>)}
            </dl>
          </Section>

          {action && (
            <Section title="Lo que recibió el cliente">
              {action.kind === "instructions" ? (
                <dl className="text-sm">
                  {action.example && <p className="mb-2 font-semibold text-oferta">Datos de ejemplo (entorno de pruebas).</p>}
                  {action.lines.map((l) => row(l.label, l.value))}
                </dl>
              ) : action.kind === "redirect" ? (
                <p className="break-all text-sm">
                  Redirección {action.method} a {action.url}
                </p>
              ) : (
                <p className="text-sm">{action.message}</p>
              )}
            </Section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-bold">Eventos</h2>
            <Table head={["Fecha", "Origen", "Id", "Estado", "Intentos", "Detalle"]} empty="Sin eventos.">
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(e.createdAt)}</td>
                  <td>{SOURCE_LABELS[e.source] ?? e.source}</td>
                  <td className="max-w-40 truncate font-mono text-xs" title={e.eventId ?? undefined}>
                    {e.eventId ?? "—"}
                  </td>
                  <td>
                    <Badge tone={EVENT_TONE[e.status]}>{EVENT_LABEL[e.status]}</Badge>
                  </td>
                  <td>{e.tries}</td>
                  <td className="max-w-xs text-xs">{e.lastError ?? ""}</td>
                </tr>
              ))}
            </Table>
          </section>

          {x.raw != null && (
            <details className="rounded-md border border-line bg-white p-4 text-sm">
              <summary className="cursor-pointer font-semibold">Último resultado registrado (sin secretos)</summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(x.raw, null, 2)}</pre>
            </details>
          )}
        </div>

        <div className="grid gap-6">
          {confirmable && (
            <Section title="Confirmar transferencia">
              <p className="mb-4 text-sm text-muted">
                Solo después de ver el dinero en la cuenta. Si el monto coincide con {formatCLP(x.amount)}, el pedido queda pagado y se descuenta el stock; un monto
                distinto queda como incidencia y no confirma el pedido.
              </p>
              <AdminForm
                action={confirmTransferAction.bind(null, x.id)}
                confirm={`¿Confirmas que la transferencia del pedido ${o.orderNumber} está en la cuenta? Esto registra el pago y no se puede deshacer.`}
                className="space-y-4"
              >
                <input type="hidden" name="commandId" value={randomUUID()} />
                <Text name="amount" label="Monto recibido (CLP)" type="number" min={1} step={1} initial={x.amount} required />
                <Text name="receivedOn" label="Fecha de recepción" type="date" max={todayInChile()} initial={todayInChile()} required />
                <Text name="bankReference" label="N.º de operación bancaria" maxLength={60} hint="Opcional. Evita aplicar la misma transferencia a dos pedidos." />
                <TextArea name="note" label="Nota" rows={2} maxLength={500} hint="Opcional. Ej.: banco de origen, titular." />
                <Submit pendingText="Confirmando…">Confirmar transferencia</Submit>
              </AdminForm>
            </Section>
          )}
          {!confirmable && provider && !provider.capabilities.manualConfirmation && !MONEY.includes(x.status) && (
            <p className="text-sm text-muted">Este pago se confirma solo con la verificación del proveedor; no se puede marcar como pagado a mano.</p>
          )}
          {x.status === "REVIEW" && canManage && (
            <Section title="Resolver incidencia">
              <p className="mb-4 text-sm text-muted">Cuando el dinero ya se devolvió al cliente (los reembolsos se hacen fuera del sistema).</p>
              <AdminForm action={resolveIncidentAction.bind(null, x.id)} confirm="¿Confirmas que el dinero ya se devolvió al cliente?" className="space-y-4">
                <TextArea name="note" label="Cómo y cuándo se devolvió" rows={2} maxLength={500} required />
                <Submit variant="danger">Marcar como devuelto</Submit>
              </AdminForm>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
