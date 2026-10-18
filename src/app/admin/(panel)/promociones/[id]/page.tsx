import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Submit } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { getCoupon } from "@/modules/promotions";
import { saveCouponAction } from "../actions";
import { CouponFields } from "../coupon-fields";

export const metadata: Metadata = { title: "Cupón" };

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("promotions:manage");
  const { id } = await params;
  const r = z.uuid().safeParse(id).success ? await getCoupon(id) : null;
  if (!r) notFound();
  return (
    <>
      <PageHeader title={`Cupón ${r.c.code}`} back={{ href: "/admin/promociones", label: "Promociones" }} />
      <div className="max-w-3xl">
        <Section title={`Editar · ${r.uses} ${r.uses === 1 ? "uso" : "usos"}`}>
          <AdminForm action={saveCouponAction.bind(null, r.c.id)} className="space-y-4">
            <CouponFields c={r.c} startsOn={r.startsOn} endsOn={r.endsOn} />
            {r.uses > 0 && (
              <p className="text-xs text-muted">Ya tiene usos: si cambias el código, los pedidos hechos con el anterior dejan de contar para este cupón.</p>
            )}
            <Submit>Guardar</Submit>
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
