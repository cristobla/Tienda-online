import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { Badge, PageHeader, Pagination, Section, StatCard, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { can } from "@/modules/auth/rbac";
import { formatDateTime } from "@/modules/chile";
import { getVariantStock, INVENTORY_PAGE_SIZE, listMovements, type MovementType } from "@/modules/inventory";
import { stockOperationAction } from "../actions";

export const metadata: Metadata = { title: "Stock de variante" };

const TYPE_LABELS: Record<MovementType, string> = {
  INITIAL_STOCK: "Stock inicial",
  PURCHASE: "Ingreso",
  SALE: "Venta",
  SALE_CANCELLED: "Venta anulada",
  RETURN: "Devolución",
  DAMAGED: "Merma",
  MANUAL_ADJUSTMENT: "Ajuste",
};

export default async function VariantStockPage({ params, searchParams }: { params: Promise<{ variantId: string }>; searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireStaffPage("inventory:read");
  const { variantId } = await params;
  const page = z.coerce.number().int().min(1).max(10_000).catch(1).parse((await searchParams).pagina);
  const v = z.uuid().safeParse(variantId).success ? await getVariantStock(variantId) : null;
  if (!v) notFound();
  const rows = await listMovements(v.id, page);
  const action = stockOperationAction.bind(null, v.id);

  return (
    <>
      <PageHeader title={`${v.product} · ${v.name}`} back={{ href: "/admin/inventario", label: "Inventario" }}>
        {can(user.role, "catalog:write") && (
          <Link href={`/admin/productos/${v.productId}/variantes/${v.id}`} className="text-sm font-medium text-muted hover:text-leaf hover:underline">
            Editar variante
          </Link>
        )}
      </PageHeader>
      <p className="-mt-4 mb-6 font-mono text-xs text-muted">
        SKU {v.sku} {!v.active && <Badge tone="off">Pausada</Badge>}
      </p>

      <div className="grid max-w-5xl gap-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="En bodega" value={v.onHand} icon="box" />
          <StatCard label="Reservado para pedidos" value={v.reserved} icon="layers" />
          <StatCard label="Disponible para vender" value={v.available} icon="check" alert={v.available <= v.minimum} />
          <StatCard label="Stock mínimo" value={v.minimum} icon="alert" />
        </div>

        {can(user.role, "inventory:adjust") && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Section title="Ingreso de mercadería">
              <AdminForm action={action} className="space-y-4">
                <input type="hidden" name="type" value="PURCHASE" />
                <Text name="quantity" label="Unidades que entran" type="number" min={1} step={1} inputMode="numeric" required />
                <Text name="reference" label="Documento" maxLength={100} hint="Factura o guía de despacho (opcional)." />
                <Text name="reason" label="Nota" maxLength={500} />
                <Submit>Registrar ingreso</Submit>
              </AdminForm>
            </Section>
            <Section title="Merma o pérdida">
              <AdminForm action={action} className="space-y-4">
                <input type="hidden" name="type" value="DAMAGED" />
                <Text name="quantity" label="Unidades que salen" type="number" min={1} max={Math.max(v.available, 1)} step={1} inputMode="numeric" required hint={`Hasta ${v.available} (lo reservado no se puede descontar).`} />
                <Text name="reason" label="Motivo" maxLength={500} required hint="Ej.: envase roto, vencido." />
                <Submit>Registrar salida</Submit>
              </AdminForm>
            </Section>
            <Section title="Conteo físico">
              <AdminForm action={action} className="space-y-4">
                <input type="hidden" name="type" value="COUNT" />
                <input type="hidden" name="expectedStock" value={v.onHand} />
                <Text name="counted" label="Unidades contadas en bodega" type="number" min={v.reserved} step={1} inputMode="numeric" initial={v.onHand} required hint="El stock queda en este valor; la diferencia se registra como ajuste." />
                <Text name="reason" label="Motivo" maxLength={500} required hint="Ej.: inventario mensual." />
                <Submit>Ajustar stock</Submit>
              </AdminForm>
            </Section>
          </div>
        )}

        <section>
          <h2 className="mb-3 text-lg font-bold">Movimientos</h2>
          <Table head={["Fecha", "Tipo", "Cantidad", "Bodega", "Detalle", "Usuario"]} empty="Esta variante aún no tiene movimientos.">
            {rows.slice(0, INVENTORY_PAGE_SIZE).map(({ movement: m, email }) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</td>
                <td>
                  <Badge tone={m.type === "MANUAL_ADJUSTMENT" ? "warn" : m.quantity > 0 ? "ok" : "bad"}>{TYPE_LABELS[m.type]}</Badge>
                </td>
                <td className="whitespace-nowrap font-semibold">{m.quantity > 0 ? `+${m.quantity}` : `−${-m.quantity}`}</td>
                <td className="whitespace-nowrap text-muted">
                  {m.previousStock} → <span className="font-semibold text-ink">{m.resultingStock}</span>
                </td>
                <td className="min-w-48">
                  {m.reason}
                  {m.referenceType === "DOCUMENT" && <span className="block text-xs text-muted">Doc.: {m.referenceId}</span>}
                  {m.referenceType === "COUNT" && <span className="block text-xs text-muted">Conteo físico</span>}
                </td>
                <td className="text-muted">{email ?? "—"}</td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} hasNext={rows.length > INVENTORY_PAGE_SIZE} href={(n) => `/admin/inventario/${v.id}?pagina=${n}`} />
        </section>
      </div>
    </>
  );
}
