import { db } from "@/db";
import { env } from "@/lib/env";
import { audit } from "@/modules/audit";
import { can } from "@/modules/auth/rbac";
import { getCurrentUser } from "@/modules/auth/session";
import { PRODUCTS_EXPORT_HEAD, variantsForExport } from "@/modules/catalog/admin";
import { toCsv } from "@/modules/reports";

/** Productos y stock por SKU en CSV para Excel (permiso catalog:read). Sin datos personales; igual queda en la auditoría. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "catalog:read")) return new Response("No autorizado.", { status: 403 });
  const rows = await variantsForExport(env.APP_URL);
  await audit(db, { userId: user.id, action: "report.export", entityType: "report", entityId: "productos", after: { filas: rows.length } });
  return new Response(toCsv([PRODUCTS_EXPORT_HEAD, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="productos-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
