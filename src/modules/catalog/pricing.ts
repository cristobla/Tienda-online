import { formatCLP } from "@/modules/chile";

type Unit = "UNIT" | "ML" | "L" | "G" | "KG" | "CM" | "M";
export type PricedVariant = {
  price: number;
  compareAtPrice: number | null;
  netContent: string | number | null;
  contentUnit: Unit;
  unitsPerPack: number;
};

/** Factor a la unidad de referencia del fleje (litro, kilo, metro). */
const BASE: Partial<Record<Unit, { factor: number; label: string }>> = {
  ML: { factor: 1 / 1000, label: "L" },
  L: { factor: 1, label: "L" },
  G: { factor: 1 / 1000, label: "kg" },
  KG: { factor: 1, label: "kg" },
  CM: { factor: 1 / 100, label: "m" },
  M: { factor: 1, label: "m" },
};

/**
 * Precio por unidad de medida, como en el fleje de góndola: "$11.960 por L", "$832 c/u".
 * null cuando no aporta (producto unitario sin contenido declarado).
 */
export function unitPriceLabel(v: PricedVariant): string | null {
  const base = BASE[v.contentUnit];
  const net = v.netContent == null ? 0 : Number(v.netContent);
  if (base && net > 0) {
    const total = net * base.factor * v.unitsPerPack;
    return `${formatCLP(Math.round(v.price / total))} por ${base.label}`;
  }
  if (v.unitsPerPack > 1) return `${formatCLP(Math.round(v.price / v.unitsPerPack))} c/u`;
  return null;
}

const UNIT_LABEL: Record<Unit, string | null> = { UNIT: null, ML: "ml", L: "L", G: "g", KG: "kg", CM: "cm", M: "m" };

/** Contenido para mostrar: "500 ml", "6 × 90 g", "12 unidades". null si no hay nada que decir. */
export function contentLabel(v: Omit<PricedVariant, "price" | "compareAtPrice">): string | null {
  const unit = UNIT_LABEL[v.contentUnit];
  const net = v.netContent == null ? 0 : Number(v.netContent);
  const one = unit && net > 0 ? `${net.toLocaleString("es-CL")} ${unit}` : null;
  if (v.unitsPerPack > 1) return one ? `${v.unitsPerPack} × ${one}` : `${v.unitsPerPack} unidades`;
  return one;
}

/** % de descuento redondeado hacia abajo (nunca prometer más de lo real). null si no hay oferta. */
export function discountPercent(v: Pick<PricedVariant, "price" | "compareAtPrice">): number | null {
  if (!v.compareAtPrice || v.compareAtPrice <= v.price) return null;
  return Math.floor(((v.compareAtPrice - v.price) / v.compareAtPrice) * 100);
}
