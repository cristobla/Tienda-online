import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reutiliza el pool entre recargas en desarrollo (Next recarga módulos).
const g = globalThis as unknown as { pgPool?: Pool };
export const pool = g.pgPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 10 });
if (env.NODE_ENV !== "production") g.pgPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type DB = typeof db;
/** Solo transacción: para operaciones que deben ser atómicas con lo que las rodea (p. ej. stock + movimiento). */
export type Transaction = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Transacción o conexión: los servicios aceptan cualquiera de los dos para poder componerse. */
export type Tx = Transaction | DB;
