/**
 * Carga productos desde un manifiesto JSON + carpeta de fotos (src/modules/catalog/manifest.ts):
 *   npm run catalogo:cargar -- <catalogo.json> [otro.json…] <carpeta-fotos> [--descuento 0.15] [--stock 0] [--publicar]
 * --stock crea ese stock inicial (movimiento INITIAL_STOCK) en cada producto nuevo; --publicar publica los que
 * tienen categoría. Audita como el primer Super Admin. Los SKU que ya existen no se tocan.
 */
import { readFile } from "node:fs/promises";
import { asc, eq } from "drizzle-orm";
import { db, pool } from "@/db";
import * as s from "@/db/schema";
import { loadManifest, manifestSchema } from "@/modules/catalog/manifest";

const args = process.argv.slice(2);
const flagAt = args.findIndex((a) => a.startsWith("--"));
const positional = flagAt < 0 ? args : args.slice(0, flagAt);
const rest = flagAt < 0 ? [] : args.slice(flagAt);
const files = positional.filter((a) => a.endsWith(".json"));
const dir = positional.find((a) => !a.endsWith(".json"));
if (!files.length || !dir) {
  console.error("Uso: npm run catalogo:cargar -- <catalogo.json> <carpeta-fotos> [--descuento 0.15] [--stock 0] [--publicar]");
  process.exit(1);
}
const flag = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};
const descuento = Number(flag("--descuento") ?? "0.15");
const stock = Number(flag("--stock") ?? "0");
if (!(descuento >= 0 && descuento < 0.9) || !Number.isInteger(stock) || stock < 0) {
  console.error("--descuento entre 0 y 0.9; --stock entero ≥ 0.");
  process.exit(1);
}

const parsed = manifestSchema.safeParse((await Promise.all(files.map(async (f) => JSON.parse(await readFile(f, "utf8"))))).flat());
if (!parsed.success) {
  console.error("El manifiesto no es válido:");
  for (const i of parsed.error.issues.slice(0, 20)) console.error(`  [${i.path.join(".")}] ${i.message}`);
  process.exit(1);
}
const [admin] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, "SUPER_ADMIN")).orderBy(asc(s.users.createdAt)).limit(1);
if (!admin) {
  console.error("No hay un Super Admin (npm run admin:create).");
  process.exit(1);
}
const results = await loadManifest(admin.id, parsed.data, dir, { descuento, stock, publicar: rest.includes("--publicar") });
for (const r of results) {
  console.log(`${r.estado.toUpperCase().padEnd(9)} ${r.sku.padEnd(28)} ${r.detalle}`);
  if (r.revisar) console.log(`          ⚠ REVISAR: ${r.revisar}`);
}
const n = (e: string) => results.filter((r) => r.estado === e).length;
console.log(`\nCreados: ${n("creado")} · ya existían: ${n("existente")} · con error: ${n("error")}`);
await pool.end();
