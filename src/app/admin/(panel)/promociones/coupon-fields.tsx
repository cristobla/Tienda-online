import { Check, Select, Text } from "@/components/admin/form";
import type { Coupon } from "@/modules/promotions";

/** Campos del cupón (crear y editar). Las fechas son días en hora de Chile. */
export function CouponFields({ c, startsOn, endsOn }: { c?: Coupon; startsOn?: string | null; endsOn?: string | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Text name="code" label="Código" initial={c?.code} required maxLength={30} placeholder="BIENVENIDA10" hint="Lo escribe el cliente. Letras, números, - o _." />
      <Select
        name="kind"
        label="Tipo"
        initial={c?.kind ?? "PERCENT"}
        options={[
          { value: "PERCENT", label: "Porcentaje (%)" },
          { value: "FIXED", label: "Monto fijo ($)" },
        ]}
      />
      <Text name="value" label="Descuento" type="number" min={1} inputMode="numeric" initial={c?.value} required hint="10 = 10 % o $10 según el tipo. Máximo 90 %." />
      <Text name="minSubtotal" label="Compra mínima ($)" type="number" min={0} inputMode="numeric" initial={c?.minSubtotal || null} hint="Productos, sin despacho. Vacío = sin mínimo." />
      <Text name="startsOn" label="Desde" type="date" initial={startsOn} hint="Vacío = desde ya." />
      <Text name="endsOn" label="Hasta (inclusive)" type="date" initial={endsOn} hint="Vacío = sin fecha de término." />
      <Text name="maxUses" label="Usos máximos" type="number" min={1} inputMode="numeric" initial={c?.maxUses} hint="Total entre todos los clientes. Vacío = sin límite." />
      <Text name="note" label="Nota interna" initial={c?.note} maxLength={200} placeholder="Ej.: lanzamiento, Instagram" />
      <div className="space-y-2 sm:col-span-2">
        <Check name="oncePerEmail" label="Un uso por cliente (email)" initial={c?.oncePerEmail ?? true} />
        <Check name="active" label="Activo" initial={c?.active ?? true} hint="Desactívalo para pausarlo sin perder su historial." />
      </div>
    </div>
  );
}
