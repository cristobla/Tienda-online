import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { Badge, ButtonLink, PageHeader, Pagination, StatCard, Table } from "@/components/admin/ui";
import { hrefWith, type SP } from "@/components/store/catalog-view";
import { paymentStatus } from "@/db/schema";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { PAYMENT_STATUS_LABELS } from "@/modules/orders";
import { getProvider, listPayments, PAYMENTS_PAGE_SIZE, PROVIDERS, paymentStats } from "@/modules/payments";
import { PAYMENT_TONE } from "../pedidos/labels";

export const metadata: Metadata = { title: "Pagos" };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const params = z.object({
  q: z.preprocess(one, z.string().trim().max(100).optional()).catch(undefined),
  metodo: z.preprocess(one, z.enum(Object.keys(PROVIDERS) as [string, ...string[]]).optional()).catch(undefined),
  estado: z.preprocess(one, z.enum(paymentStatus.enumValues).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const select = "rounded-md border border-line bg-white px-3 py-2 text-sm";

/** Intentos de pago de todos los pedidos: búsqueda por pedido, referencia u operación; filtros de método y estado. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireStaffPage("orders:read");
  const sp = await searchParams;
  const p = params.parse(sp);
  const [{ items, total }, stats] = await Promise.all([listPayments({ q: p.q || undefined, provider: p.metodo, status: p.estado, page: p.pagina }), paymentStats()]);

  return (
    <>
      <PageHeader title="Pagos">
        {can(user.role, "payments:manage") && (
          <ButtonLink href="/admin/pagos/configuracion" variant="plain">
            Medios de pago
          </ButtonLink>
        )}
      </PageHeader>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Transferencias por comprobar" value={stats.toConfirm} icon="check" href="/admin/pagos?metodo=transferencia&estado=PENDING" alert={stats.toConfirm > 0} />
        <StatCard label="En revisión (reembolso pendiente)" value={stats.review} icon="alert" href="/admin/pagos?estado=REVIEW" alert={stats.review > 0} />
        <StatCard label="Por verificar con el proveedor" value={stats.uncertain} icon="chart" href="/admin/pagos?estado=UNCERTAIN" />
      </div>

      <form role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <input name="q" type="search" defaultValue={p.q} placeholder="Pedido, referencia, n.º de operación o email" className={`${select} w-full`} />
        </label>
        <select name="metodo" defaultValue={p.metodo ?? ""} aria-label="Método" className={select}>
          <option value="">Todos los métodos</option>
          {Object.values(PROVIDERS).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={p.estado ?? ""} aria-label="Estado" className={select}>
          <option value="">Todos los estados</option>
          {paymentStatus.enumValues.map((st) => (
            <option key={st} value={st}>
              {PAYMENT_STATUS_LABELS[st]}
            </option>
          ))}
        </select>
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
      </form>

      <p className="mb-2 text-sm text-muted">{total === 1 ? "1 intento de pago" : `${total} intentos de pago`}</p>
      <Table head={["Referencia", "Fecha", "Pedido", "Método", "Monto", "Recibido", "Estado"]} empty="No hay pagos con esos filtros.">
        {items.map(({ payment: x, orderNumber, customerName }) => (
          <tr key={x.id}>
            <td className="whitespace-nowrap">
              <Link href={`/admin/pagos/${x.id}`} className="font-mono font-semibold hover:text-leaf hover:underline">
                {x.reference}
              </Link>
            </td>
            <td className="whitespace-nowrap text-muted">{formatDateTime(x.createdAt)}</td>
            <td className="min-w-40">
              <span className="font-mono">{orderNumber}</span>
              <span className="block text-xs text-muted">{customerName}</span>
            </td>
            <td>
              {getProvider(x.provider)?.label ?? x.provider}{" "}
              {getProvider(x.provider)?.testOnly && <Badge tone="bad">Prueba</Badge>}
            </td>
            <td className="whitespace-nowrap font-semibold">{formatCLP(x.amount)}</td>
            <td className="whitespace-nowrap">{x.receivedAmount ? formatCLP(x.receivedAmount) : "—"}</td>
            <td>
              <Badge tone={PAYMENT_TONE[x.status]}>{PAYMENT_STATUS_LABELS[x.status]}</Badge>
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={p.pagina} hasNext={p.pagina * PAYMENTS_PAGE_SIZE < total} href={(n) => hrefWith("/admin/pagos", sp, { pagina: String(n) })} />
    </>
  );
}
