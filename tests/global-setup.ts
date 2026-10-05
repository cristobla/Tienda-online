import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Recrea el esquema de la base de tests y aplica todas las migraciones. */
export default async function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("Define DATABASE_URL_TEST en .env (ver .env.example).");
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
}
