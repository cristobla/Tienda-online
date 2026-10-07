/**
 * Despacho: tarifa por región (CLP, IVA incluido) configurada en el panel. Una región sin tarifa no recibe despachos.
 * ponytail: tarifa única por región; agregar excepciones por comuna o envío gratis desde cierto monto cuando el negocio lo pida.
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import * as s from "@/db/schema";
import { field } from "@/lib/form";
import { audit } from "@/modules/audit";

export type ShippingQuote = { communeId: number; commune: string; region: string; cost: number; eta: string | null };

/** Costo de despachar a una comuna. null si la comuna no existe o su región no tiene tarifa. */
export async function quoteShipping(communeId: number, tx: Tx = db): Promise<ShippingQuote | null> {
  const [q] = await tx
    .select({ communeId: s.communes.id, commune: s.communes.name, region: s.regions.name, cost: s.shippingRates.cost, eta: s.shippingRates.eta })
    .from(s.communes)
    .innerJoin(s.regions, eq(s.regions.id, s.communes.regionId))
    .innerJoin(s.shippingRates, eq(s.shippingRates.regionId, s.regions.id))
    .where(eq(s.communes.id, communeId));
  return q ?? null;
}

/** Comunas a las que se despacha, agrupadas por región (para el selector del checkout). */
export async function listDeliveryCommunes() {
  const rows = await db
    .select({ regionId: s.regions.id, region: s.regions.name, id: s.communes.id, name: s.communes.name })
    .from(s.communes)
    .innerJoin(s.regions, eq(s.regions.id, s.communes.regionId))
    .innerJoin(s.shippingRates, eq(s.shippingRates.regionId, s.regions.id))
    .orderBy(asc(s.regions.sortOrder), asc(s.communes.name));
  const groups = new Map<number, { region: string; communes: { id: number; name: string }[] }>();
  for (const r of rows) {
    const g = groups.get(r.regionId) ?? groups.set(r.regionId, { region: r.region, communes: [] }).get(r.regionId)!;
    g.communes.push({ id: r.id, name: r.name });
  }
  return [...groups.values()];
}

/** Las 16 regiones con su tarifa actual (null = sin despacho), para el panel. */
export function listShippingRates() {
  return db
    .select({ regionId: s.regions.id, region: s.regions.name, cost: s.shippingRates.cost, eta: s.shippingRates.eta })
    .from(s.regions)
    .leftJoin(s.shippingRates, eq(s.shippingRates.regionId, s.regions.id))
    .orderBy(asc(s.regions.sortOrder));
}

const rateSchema = z.object({ cost: field.optInt(0, 1_000_000), eta: field.optText(60) });

/**
 * Lee el formulario del panel: por región, `cost_<id>` (vacío = sin despacho) y `eta_<id>`.
 * Devuelve las tarifas o los errores por campo.
 */
export function parseShippingForm(raw: Record<string, string>, regionIds: number[]) {
  const rates: { regionId: number; cost: number | null; eta: string | null }[] = [];
  const errors: Record<string, string> = {};
  for (const id of regionIds) {
    const r = rateSchema.safeParse({ cost: raw[`cost_${id}`] ?? "", eta: raw[`eta_${id}`] ?? "" });
    if (r.success) rates.push({ regionId: id, ...r.data });
    else for (const issue of r.error.issues) errors[`${String(issue.path[0])}_${id}`] ??= issue.message;
  }
  return { rates, errors };
}

/** Reemplaza las tarifas (una transacción, auditada). Costo null = la región deja de recibir despachos. */
export async function saveShippingRates(userId: string, rates: { regionId: number; cost: number | null; eta: string | null }[]) {
  await db.transaction(async (tx) => {
    const before = await tx.select({ regionId: s.shippingRates.regionId, cost: s.shippingRates.cost, eta: s.shippingRates.eta }).from(s.shippingRates);
    await tx.delete(s.shippingRates);
    const active = rates.filter((r) => r.cost !== null).map((r) => ({ regionId: r.regionId, cost: r.cost!, eta: r.eta }));
    if (active.length) await tx.insert(s.shippingRates).values(active);
    await audit(tx, { userId, action: "shipping.update", entityType: "shipping", entityId: "tarifas", before, after: active });
  });
}
