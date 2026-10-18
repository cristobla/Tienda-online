import type { Metadata } from "next";
import Link from "next/link";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { Badge, PageHeader, Section, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatCLP, formatDateTime } from "@/modules/chile";
import { listCoupons } from "@/modules/promotions";
import { getSettings } from "@/modules/settings";
import { saveCouponAction, saveFreeShippingAction } from "./actions";
import { CouponFields } from "./coupon-fields";

export const metadata: Metadata = { title: "Promociones" };

export default async function PromotionsPage() {
  await requireStaffPage("promotions:manage");
  const [coupons, st] = await Promise.all([listCoupons(), getSettings()]);
  const now = Date.now();

  return (
    <>
      <PageHeader title="Promociones" />
      <div className="grid max-w-5xl gap-6">
        <Section title="Despacho gratis">
          <AdminForm action={saveFreeShippingAction} className="flex flex-wrap items-end gap-4">
            <Text
              name="freeShippingFrom"
              label="Despacho gratis desde ($)"
              type="number"
              min={1}
              inputMode="numeric"
              initial={st.freeShippingFrom}
              placeholder="Ej.: 30000"
              hint="Monto de productos (con descuento) desde el que no se cobra el despacho, a todas las regiones. Vacío = apagado."
              className="max-w-md flex-1"
            />
            <Submit>Guardar</Submit>
          </AdminForm>
        </Section>

        <Section title="Cupones">
          <Table head={["Código", "Descuento", "Vigencia", "Usos", "Estado"]} empty="Aún no hay cupones.">
            {coupons.map(({ c, uses }) => {
              const over = (c.endsAt && c.endsAt.getTime() <= now) || (c.maxUses !== null && uses >= c.maxUses);
              const soon = c.startsAt && c.startsAt.getTime() > now;
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/admin/promociones/${c.id}`} className="font-mono font-semibold text-leaf hover:underline">
                      {c.code}
                    </Link>
                    {c.note && <span className="block text-xs text-muted">{c.note}</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {c.kind === "PERCENT" ? `${c.value} %` : formatCLP(c.value)}
                    {c.minSubtotal > 0 && <span className="block text-xs text-muted">desde {formatCLP(c.minSubtotal)}</span>}
                  </td>
                  <td className="text-xs text-muted">
                    {c.startsAt ? formatDateTime(c.startsAt) : "Desde ya"} → {c.endsAt ? formatDateTime(c.endsAt) : "sin término"}
                  </td>
                  <td>
                    {uses}
                    {c.maxUses !== null && ` / ${c.maxUses}`}
                    {c.oncePerEmail && <span className="block text-xs text-muted">1 por cliente</span>}
                  </td>
                  <td>
                    {!c.active ? (
                      <Badge tone="off">Pausado</Badge>
                    ) : over ? (
                      <Badge tone="off">Terminado</Badge>
                    ) : soon ? (
                      <Badge tone="warn">Programado</Badge>
                    ) : (
                      <Badge tone="ok">Vigente</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          <p className="mt-2 text-xs text-muted">Un uso = un pedido no cancelado con el cupón. Si un pedido vence sin pagarse, su uso se libera.</p>
        </Section>

        <Section title="Nuevo cupón">
          <AdminForm action={saveCouponAction.bind(null, null)} className="space-y-4">
            <CouponFields />
            <Submit>Crear cupón</Submit>
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
