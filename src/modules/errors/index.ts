/**
 * Errores no controlados del servidor (páginas, acciones, rutas y tareas), para verlos en el panel sin abrir los
 * logs. Se agrupan por huella: el mismo error en la misma ruta suma 1 en vez de crear otra fila.
 * shortcut: sin aviso por correo ni servicio externo (Sentry); basta para una tienda chica, revisar el panel a diario.
 */
import { createHash } from "node:crypto";
import { desc, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { appErrors } from "@/db/schema";
import { audit } from "@/modules/audit";

/** Ids, números y correos cambian entre ocurrencias del mismo error: no deben separar la huella. */
const normalize = (m: string) =>
  m
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\S+@\S+/g, "<email>")
    .replace(/\d+/g, "#");

/** Nunca lanza: registrar un error no debe causar otro (p. ej. con la base caída solo queda en la consola). */
export async function recordError(e: unknown, where: { route: string; method?: string | null }) {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const message = (err.message || err.name).slice(0, 500);
    const stack = err.stack?.slice(0, 4000) ?? null;
    const fingerprint = createHash("sha256").update(`${where.route}|${err.name}|${normalize(message)}`).digest("hex");
    await db
      .insert(appErrors)
      .values({ fingerprint, message, stack, route: where.route.slice(0, 200), method: where.method ?? null })
      .onConflictDoUpdate({ target: appErrors.fingerprint, set: { count: sql`${appErrors.count} + 1`, lastAt: new Date(), message, stack } });
  } catch (x) {
    console.error("No se pudo registrar el error:", x);
  }
}

export const listErrors = (limit = 200) => db.select().from(appErrors).orderBy(desc(appErrors.lastAt)).limit(limit);

/** Errores distintos vistos en las últimas 24 horas (para el inicio del panel). */
export const recentErrorCount = () => db.$count(appErrors, gt(appErrors.lastAt, sql`now() - interval '24 hours'`));

/** "Revisados": se borran; si vuelven a ocurrir aparecen de nuevo. */
export async function clearErrors(userId: string) {
  await db.transaction(async (tx) => {
    const gone = await tx.delete(appErrors).returning({ id: appErrors.id });
    await audit(tx, { userId, action: "errors.clear", entityType: "errors", entityId: "todos", after: { borrados: gone.length } });
  });
}
