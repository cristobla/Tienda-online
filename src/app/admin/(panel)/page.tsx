import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader, Section, StatCard, Table } from "@/components/admin/ui";
import { SITE } from "@/lib/site";
import { listAudit } from "@/modules/audit";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { dashboardStats } from "@/modules/catalog/admin";
import { formatDateTime } from "@/modules/chile";
import { orderStats } from "@/modules/orders";
import { paymentStats } from "@/modules/payments";
import { actionLabel } from "./auditoria/labels";

// absolute: la plantilla "· Panel" del layout solo aplica a las páginas hijas, no a la de su mismo segmento.
export const metadata: Metadata = { title: { absolute: `Inicio · Panel ${SITE.name}` } };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const user = await requireStaffPage();
  const showCatalog = can(user.role, "catalog:read");
  const canInventory = can(user.role, "inventory:read");
  const [stats, activity, orders] = await Promise.all([
    showCatalog ? dashboardStats() : null,
    can(user.role, "audit:read") ? listAudit({}).then((r) => r.slice(0, 8)) : null,
    can(user.role, "orders:read") ? Promise.all([orderStats(), paymentStats()]).then(([o, p]) => ({ ...o, ...p })) : null,
  ]);

  return (
    <>
      <PageHeader title="Inicio" />
      {(await searchParams).sin_permiso && (
        <p role="alert" className="mb-6 rounded-md border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
          Tu rol no tiene acceso a esa sección.
        </p>
      )}

      {orders && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Pedidos pendientes de pago" value={orders.pending} icon="cart" href="/admin/pedidos?estado=PENDING_PAYMENT" />
          <StatCard label="Pagados por preparar" value={orders.paid} icon="truck" href="/admin/pedidos?estado=PAID" alert={orders.paid > 0} />
          <StatCard label="Transferencias por comprobar" value={orders.toConfirm} icon="check" href="/admin/pagos?metodo=transferencia&estado=PENDING" alert={orders.toConfirm > 0} />
          {orders.review > 0 && <StatCard label="Pagos en revisión" value={orders.review} icon="alert" href="/admin/pagos?estado=REVIEW" alert />}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Productos activos" value={stats.activeProducts} icon="box" href="/admin/productos?estado=activos" />
            <StatCard label="Inactivos" value={stats.inactiveProducts} icon="layers" href="/admin/productos?estado=inactivos" />
            <StatCard label="Variantes agotadas" value={stats.outOfStock} icon="alert" href="/admin/productos?stock=agotado&estado=activos" alert={stats.outOfStock > 0} />
            <StatCard label="Bajo stock mínimo" value={stats.lowStock} icon="chart" href="/admin/productos?stock=bajo&estado=activos" alert={stats.lowStock > 0} />
            <StatCard label="Productos sin foto" value={stats.withoutImages} icon="tag" />
          </div>

          <div className="mt-8">
            <h2 className="mb-3 text-lg font-bold">Reponer pronto</h2>
            <Table head={["Producto", "Variante", "SKU", "Disponible", "Mínimo"]} empty="Todo el stock está sobre el mínimo.">
              {stats.lowList.map((v) => (
                <tr key={v.sku}>
                  <td>
                    <Link href={`/admin/productos/${v.productId}`} className="font-medium hover:text-leaf hover:underline">
                      {v.product}
                    </Link>
                  </td>
                  <td>
                    {canInventory ? (
                      <Link href={`/admin/inventario/${v.variantId}`} className="hover:text-leaf hover:underline">
                        {v.variant}
                      </Link>
                    ) : (
                      v.variant
                    )}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs">{v.sku}</td>
                  <td>{v.available <= 0 ? <Badge tone="bad">Agotado</Badge> : <Badge tone="warn">{v.available}</Badge>}</td>
                  <td>{v.minimum}</td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}

      {activity && (
        <div className="mt-8">
          <Section title="Actividad reciente" actions={<Link href="/admin/auditoria" className="text-sm text-leaf hover:underline">Ver todo</Link>}>
            <ul className="divide-y divide-line text-sm">
              {activity.map(({ log, email }) => (
                <li key={log.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{email ?? "Sistema"}</span> · {actionLabel(log.action)}
                  </span>
                  <span className="text-muted">{formatDateTime(log.createdAt)}</span>
                </li>
              ))}
              {activity.length === 0 && <li className="py-2 text-muted">Aún no hay cambios registrados.</li>}
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}
