/**
 * QA: abre una sesión por cuenta de prueba con el mismo authenticate() del login y deja los tokens en un archivo
 * temporal (nunca en pantalla) para recorrer el panel con curl. Solo sobre una base *_qa.
 * Uso: npx tsx --env-file=.env.qa scripts/qa-sesiones.ts <archivo-salida>
 */
import { writeFileSync } from "node:fs";
import { pool } from "../src/db";
import { authenticate, createSession } from "../src/modules/auth/session";

const dbName = new URL(process.env.DATABASE_URL ?? "postgres://x/none").pathname.slice(1);
if (!dbName.endsWith("_qa")) throw new Error(`Base "${dbName}": este script solo corre sobre una base *_qa.`);
const out = process.argv[2];
if (!out) throw new Error("Falta el archivo de salida");

const accounts = [
  ["SUPER_ADMIN", process.env.SEED_ADMIN_EMAIL!, process.env.SEED_ADMIN_PASSWORD!],
  ...(["admin", "sales", "warehouse"] as const).map((r) => [r.toUpperCase(), `qa-rol-${r}@qa.test`, process.env.QA_STAFF_PASSWORD!]),
];
const lines: string[] = [];
for (const [role, email, password] of accounts) {
  const user = await authenticate(email!, password!);
  if (!user || user === "code") throw new Error(`No se pudo ingresar como ${role}`);
  lines.push(`${role}=${(await createSession(user.id)).token}`);
}
writeFileSync(out, lines.join("\n") + "\n");
console.log("sesiones:", lines.map((l) => l.split("=")[0]).join(", "));
await pool.end();
