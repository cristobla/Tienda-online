import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader, Section, StatCard, Table } from "@/components/admin/ui";
import { listAudit } from "@/modules/audit";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { dashboardStats } from "@/modules/catalog/admin";
import { formatDateTime } from "@/modules/chile";
import { actionLabel } from "./auditoria/labels";

export const metadata: Metadata = { title: "Inicio" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const user = await requireStaffPage();
  const showCatalog = can(user.role, "catalog:read");
  const canInventory = can(user.role, "inventory:read");
  const [stats, activity] = await Promise.all([
    showCatalog ? dashboardStats() : null,
    can(user.role, "audit:read") ? listAudit({}).then((r) => r.slice(0, 8)) : null,
  ]);

  return (
    <>
      <PageHeader title="Inicio" />
      {(await searchParams).sin_permiso && (
        <p role="alert" className="mb-6 rounded-md border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
          Tu rol no tiene acceso a esa sección.
        </p>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Productos activos" value={stats.activeProducts} icon="box" href="/admin/productos?estado=activos" />
            <StatCard label="Inactivos" value={stats.inactiveProducts} icon="layers" href="/admin/productos?estado=inactivos" />
            <StatCard label="Variantes agotadas" value={stats.outOfStock} icon="alert" href="/admin/productos?stock=agotado" alert={stats.outOfStock > 0} />
            <StatCard label="Bajo stock mínimo" value={stats.lowStock} icon="chart" href="/admin/productos?stock=bajo" alert={stats.lowStock > 0} />
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
