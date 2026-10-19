/**
 * Prepara la base de QA aislada (ver docs/qa/01-revision-funcional.md): cuentas de prueba por rol.
 * Uso: npx tsx --env-file=.env.qa scripts/qa-preparar.ts   (después de migrate, load-reference y seed)
 * Se niega a correr si la base no termina en "_qa": nunca toca la base de la demo ni la de los tests.
 * Idempotente: si una cuenta ya existe, la deja como está.
 */
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as s from "../src/db/schema";
import { createStaffUser, newUserSchema } from "../src/modules/auth/users";

const dbName = new URL(process.env.DATABASE_URL ?? "postgres://x/none").pathname.slice(1);
if (!dbName.endsWith("_qa")) throw new Error(`Base "${dbName}": este script solo corre sobre una base *_qa.`);
const password = process.env.QA_STAFF_PASSWORD;
if (!password) throw new Error("Falta QA_STAFF_PASSWORD en .env.qa");

for (const role of ["ADMIN", "SALES", "WAREHOUSE"] as const) {
  const email = `qa-rol-${role.toLowerCase()}@qa.test`;
  const [exists] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
  if (exists) console.log(`${email}: ya existe`);
  else {
    await createStaffUser(null, newUserSchema.parse({ email, role, password }));
    console.log(`${email}: creada (${role})`);
  }
}
await pool.end();
