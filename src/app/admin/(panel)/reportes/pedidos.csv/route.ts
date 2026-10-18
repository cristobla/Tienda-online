import { db } from "@/db";
import { audit } from "@/modules/audit";
import { can } from "@/modules/auth/rbac";
import { getCurrentUser } from "@/modules/auth/session";
import { EXPORT_HEAD, type ExportKind, ordersForExport, parseReportRange, toCsv } from "@/modules/reports";

/** Descarga de pedidos en CSV (permiso reports:read). Lleva datos personales: cada descarga queda en la auditoría. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "reports:read")) return new Response("No autorizado.", { status: 403 });
  const url = new URL(req.url);
  const r = parseReportRange(Object.fromEntries(url.searchParams));
  const kind: ExportKind = url.searchParams.get("tipo") === "todos" ? "todos" : "pagados";
  const rows = await ordersForExport(r, kind);
  await audit(db, { userId: user.id, action: "report.export", entityType: "report", entityId: `pedidos-${kind}`, after: { desde: r.from, hasta: r.to, filas: rows.length } });
  return new Response(toCsv([EXPORT_HEAD, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${kind}-${r.from}-a-${r.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
