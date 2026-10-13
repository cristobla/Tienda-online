import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { PageHeader, Pagination, Table } from "@/components/admin/ui";
import { hrefWith, type SP } from "@/components/store/catalog-view";
import { AUDIT_PAGE_SIZE, changedFields, listAudit } from "@/modules/audit";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatDateTime } from "@/modules/chile";
import { actionLabel, entityHref } from "./labels";

export const metadata: Metadata = { title: "Auditoría" };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const params = z.object({
  tipo: z.preprocess(one, z.enum(["product", "variant", "category", "brand", "attribute", "user", "order", "shipping", "catalog", "payment"]).optional()).catch(undefined),
  id: z.preprocess(one, z.string().max(64).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const TYPES = { product: "Productos", variant: "Variantes", category: "Categorías", brand: "Marcas", attribute: "Atributos", user: "Usuarios", order: "Pedidos", shipping: "Despacho", catalog: "Importaciones", payment: "Pagos" };

const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage("audit:read");
  const sp = await searchParams;
  const p = params.parse(sp);
  const rows = await listAudit({ entityType: p.tipo, entityId: p.id, page: p.pagina });

  return (
    <>
      <PageHeader title="Auditoría" />
      <nav aria-label="Filtrar por tipo" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["", "Todo"], ...Object.entries(TYPES)].map(([key, label]) => (
          <Link
            key={key}
            href={key ? `/admin/auditoria?tipo=${key}` : "/admin/auditoria"}
            aria-current={(p.tipo ?? "") === key && !p.id ? "page" : undefined}
            className="rounded-md border border-line bg-white px-3 py-1 hover:border-leaf aria-[current=page]:border-leaf aria-[current=page]:bg-leaf aria-[current=page]:text-white"
          >
            {label}
          </Link>
        ))}
      </nav>
      {p.id && <p className="mb-3 text-sm text-muted">Mostrando el historial de un solo registro.</p>}

      <Table head={["Fecha", "Usuario", "Acción", "Cambios"]} empty="Sin registros.">
        {rows.slice(0, AUDIT_PAGE_SIZE).map(({ log, email }) => {
          const href = entityHref(log.entityType, log.entityId);
          const changes = log.action.endsWith(".update") || log.action === "variant.set_default" || log.action.startsWith("payment.") ? changedFields(log.before, log.after) : [];
          return (
            <tr key={log.id}>
              <td className="whitespace-nowrap text-muted">{formatDateTime(log.createdAt)}</td>
              <td className="whitespace-nowrap">{email ?? "Sistema"}</td>
              <td>
                {actionLabel(log.action)}
                {href && !log.action.endsWith(".delete") && (
                  <Link href={href} className="ml-1 text-leaf hover:underline">
                    ver
                  </Link>
                )}
              </td>
              <td className="max-w-xl text-xs">
                {log.action === "catalog.import" && <ImportSummary after={log.after} />}
                {changes.length > 0 && (
                  <ul className="space-y-0.5">
                    {changes.slice(0, 8).map((c) => (
                      <li key={c.field} className="break-words">
                        <span className="font-semibold">{c.field}</span>: <s className="text-muted">{show(c.before)}</s> → {show(c.after)}
                      </li>
                    ))}
                    {changes.length > 8 && <li className="text-muted">y {changes.length - 8} más…</li>}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      <Pagination page={p.pagina} hasNext={rows.length > AUDIT_PAGE_SIZE} href={(n) => hrefWith("/admin/auditoria", sp, { pagina: String(n) })} />
    </>
  );
}

/** Resumen de una importación de Excel: archivo y totales (el detalle por producto está en "Productos"). */
function ImportSummary({ after }: { after: unknown }) {
  const a = after as { archivo?: string; resultado?: Record<string, number> } | null;
  const r = a?.resultado;
  if (!r) return null;
  return (
    <span className="break-words">
      {a.archivo} · {r.created} creados, {r.updated} actualizados, {r.excluded} excluidos, {r.stockMovements} con stock inicial
    </span>
  );
}
