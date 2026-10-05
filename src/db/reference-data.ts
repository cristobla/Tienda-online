import { sql } from "drizzle-orm";
import type { Tx } from ".";
import data from "./data/chile-regions.json";
import { communes, regions } from "./schema";

/**
 * Regiones y comunas de Chile (16 / 346). Idempotente: se puede correr en producción.
 * Fuente: paquete npm "dpacl" (MIT), códigos CUT de región agregados manualmente.
 */
export async function loadReferenceData(tx: Tx) {
  for (const r of data) {
    const [region] = await tx
      .insert(regions)
      .values({ code: r.code, name: r.name, sortOrder: r.order })
      .onConflictDoUpdate({ target: regions.code, set: { name: r.name, sortOrder: r.order } })
      .returning({ id: regions.id });
    await tx
      .insert(communes)
      .values(r.communes.map((name) => ({ regionId: region!.id, name })))
      .onConflictDoNothing();
  }
  const [{ n }] = (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM communes`)).rows as [{ n: number }];
  return n;
}
