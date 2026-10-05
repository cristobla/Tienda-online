import type { Metadata } from "next";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { PageHeader } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listShippingRates } from "@/modules/shipping";
import { saveShippingAction } from "./actions";

export const metadata: Metadata = { title: "Despacho" };

export default async function ShippingPage() {
  await requireStaffPage("shipping:manage");
  const rates = await listShippingRates();
  const active = rates.filter((r) => r.cost !== null).length;

  return (
    <>
      <PageHeader title="Despacho" />
      <p className="-mt-2 mb-6 max-w-2xl text-sm text-muted">
        Costo de despacho por región, en pesos con IVA incluido. Una región sin costo no aparece en el checkout. Hoy despachas a{" "}
        <strong className="text-ink">{active === 1 ? "1 región" : `${active} regiones`}</strong>.
      </p>
      <AdminForm action={saveShippingAction} className="space-y-4">
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {rates.map((r) => (
            <li key={r.regionId} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_10rem_14rem] sm:items-end">
              <p className="font-semibold sm:pb-2">{r.region}</p>
              <Text name={`cost_${r.regionId}`} label="Costo ($)" type="number" min={0} step={10} inputMode="numeric" initial={r.cost} placeholder="Sin despacho" />
              <Text name={`eta_${r.regionId}`} label="Plazo" maxLength={60} initial={r.eta} placeholder="Ej.: 2 a 4 días hábiles" />
            </li>
          ))}
        </ul>
        <Submit>Guardar tarifas</Submit>
      </AdminForm>
    </>
  );
}
