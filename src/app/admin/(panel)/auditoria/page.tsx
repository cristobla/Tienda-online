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
  tipo: z.preprocess(one, z.enum(["product", "variant", "category", "brand", "attribute", "user", "order"]).optional()).catch(undefined),
  id: z.preprocess(one, z.string().max(64).optional()).catch(undefined),
  pagina: z.preprocess(one, z.coerce.number().int().min(1).max(10_000)).catch(1),
});

const TYPES = { product: "Productos", variant: "Variantes", category: "Categorías", brand: "Marcas", attribute: "Atributos", user: "Usuarios", order: "Pedidos" };

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
          const changes = log.action.endsWith(".update") || log.action === "variant.set_default" ? changedFields(log.before, log.after) : [];
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
