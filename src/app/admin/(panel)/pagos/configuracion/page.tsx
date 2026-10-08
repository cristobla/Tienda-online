import type { Metadata } from "next";
import { AdminForm, Select, Submit, Text } from "@/components/admin/form";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
import { env } from "@/lib/env";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatRut } from "@/modules/chile";
import { ACCOUNT_TYPES, formatMinutes, methodStates } from "@/modules/payments";
import { saveTransferSettingsAction, toggleMethodAction } from "../actions";

export const metadata: Metadata = { title: "Medios de pago" };

const CAPS: [keyof Awaited<ReturnType<typeof methodStates>>[number]["capabilities"], string][] = [
  ["manualConfirmation", "confirmación en el panel"],
  ["verify", "consulta de estado"],
  ["browserReturn", "retorno"],
  ["webhook", "notificaciones"],
  ["refund", "reembolsos"],
];
const yes = (v: boolean) => <Badge tone={v ? "ok" : "off"}>{v ? "Sí" : "No"}</Badge>;

/**
 * Configuración NO secreta de pagos. Las credenciales de pasarelas viven en el entorno del servidor (nunca en la
 * base ni en un formulario). Un método pendiente no se habilita desde aquí.
 */
export default async function PaymentSettingsPage() {
  await requireStaffPage("payments:manage");
  const states = await methodStates();
  const transfer = states.find((m) => m.id === "transferencia")!;
  const saved = (transfer.settings ?? {}) as Partial<Record<string, string>>;

  return (
    <>
      <PageHeader title="Medios de pago" back={{ href: "/admin/pagos", label: "Pagos" }} />
      <p className="-mt-4 mb-6 text-sm text-muted">
        Ambiente: <strong>{env.APP_ENV}</strong>. Al cliente solo se le ofrecen los métodos implementados, configurados y habilitados.
      </p>

      <Table head={["Método", "Implementado", "Configurado", "Habilitado", "Se ofrece", "Capacidades", ""]}>
        {states.map((m) => (
          <tr key={m.id}>
            <td className="min-w-44">
              <span className="font-semibold">{m.label}</span>
              <span className="block text-xs text-muted">Reserva: {formatMinutes(m.reservationMinutes)}</span>
            </td>
            <td>{yes(m.implemented)}</td>
            <td>{m.implemented ? yes(m.configured) : "—"}</td>
            <td>{m.testOnly ? <span className="text-xs text-muted">Por entorno</span> : yes(m.enabled)}</td>
            <td className="min-w-40">
              {yes(m.available)}
              {m.reason && <span className="mt-1 block text-xs text-muted">{m.reason}</span>}
              {m.example && <span className="mt-1 block text-xs text-oferta">Con datos de ejemplo</span>}
            </td>
            <td className="min-w-40 text-xs text-muted">
              {CAPS.filter(([k]) => m.capabilities[k])
                .map(([, l]) => l)
                .join(", ")}
            </td>
            <td>
              {m.implemented && !m.testOnly && (
                <AdminForm action={toggleMethodAction.bind(null, m.id, !m.enabled)} className="space-y-2">
                  <Submit variant="plain" pendingText="Guardando…">
                    {m.enabled ? "Deshabilitar" : "Habilitar"}
                  </Submit>
                </AdminForm>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-muted">
        Webpay Plus, Mercado Pago y Khipu quedan pendientes hasta implementar su protocolo y verificarlo en su ambiente de integración (docs/PAGOS.md). Sus credenciales
        se cargan en el servidor, no aquí.
      </p>

      <div className="mt-8 max-w-2xl">
        <Section title="Cuenta para transferencias">
          <p className="mb-4 text-sm text-muted">
            Datos de recepción que ve el cliente (no son credenciales). Cambiarlos no altera las instrucciones de los pedidos ya emitidos.
            {transfer.example && " Mientras no se completen, en este ambiente se muestran datos de ejemplo rotulados; en producción el método no se ofrece."}
          </p>
          <AdminForm action={saveTransferSettingsAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Text name="bank" label="Banco" initial={saved.bank} maxLength={80} required />
              <Text name="holder" label="Titular" initial={saved.holder} maxLength={120} required />
              <Text name="rut" label="RUT del titular" initial={saved.rut ? formatRut(saved.rut) : null} maxLength={20} required />
              <Select name="accountType" label="Tipo de cuenta" initial={saved.accountType} options={ACCOUNT_TYPES.map((t) => ({ value: t, label: t }))} empty="Elige…" required />
              <Text name="accountNumber" label="N.º de cuenta" initial={saved.accountNumber} maxLength={30} required />
              <Text name="email" label="Email para comprobantes" type="email" initial={saved.email} maxLength={200} required />
            </div>
            <Submit>Guardar cuenta</Submit>
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
