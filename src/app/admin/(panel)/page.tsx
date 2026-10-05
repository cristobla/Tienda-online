import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
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
  const [stats, activity] = await Promise.all([
    showCatalog ? dashboardStats() : null,
    can(user.role, "audit:read") ? listAudit({}).then((r) => r.slice(0, 8)) : null,
  ]);

  return (
    <>
      <PageHeader title="Inicio" />
      {(await searchParams).sin_permiso && (
        <p role="alert" className="mb-6 rounded-md border border-oferta/40 bg-white px-4 py-3 text-sm text-oferta">
          Tu rol no tiene acceso a esa sección.
        </p>
      )}

      {stats && (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              { label: "Productos activos", value: stats.activeProducts, href: "/admin/productos?estado=activos" },
              { label: "Inactivos", value: stats.inactiveProducts, href: "/admin/productos?estado=inactivos" },
              { label: "Variantes agotadas", value: stats.outOfStock, href: "/admin/productos?stock=agotado", alert: stats.outOfStock > 0 },
              { label: "Bajo stock mínimo", value: stats.lowStock, href: "/admin/productos?stock=bajo", alert: stats.lowStock > 0 },
              { label: "Productos sin foto", value: stats.withoutImages },
            ].map((s) => (
              <div key={s.label} className="rounded-md border border-line bg-white p-4">
                <dt className="text-sm text-muted">{s.label}</dt>
                <dd className={`mt-1 text-3xl font-extrabold [font-stretch:80%] ${s.alert ? "text-oferta" : ""}`}>
                  {s.href ? (
                    <Link href={s.href} className="hover:underline">
                      {s.value}
                    </Link>
                  ) : (
                    s.value
                  )}
                </dd>
              </div>
            ))}
          </dl>

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
                  <td>{v.variant}</td>
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
