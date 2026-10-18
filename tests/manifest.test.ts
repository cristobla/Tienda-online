import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { loadManifest, manifestSchema, priceFrom, skuFor } from "@/modules/catalog/manifest";
import { resetDb } from "./helpers";

let adminId: string;
const dir = join(tmpdir(), "tienda-test-manifiesto");
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "SUPER_ADMIN" }).returning();
  adminId = u!.id;
  const [root] = await db.insert(s.categories).values({ name: "Higiene personal", slug: "higiene-personal" }).returning();
  await db.insert(s.categories).values({ name: "Cuidado capilar", slug: "cuidado-capilar", parentId: root!.id });
  await mkdir(dir, { recursive: true });
  for (const f of ["foto1.jpg", "foto2.jpg"])
    await writeFile(join(dir, f), await sharp({ create: { width: 400, height: 400, channels: 3, background: "#fff" } }).jpeg().toBuffer());
});

const item = (over: Record<string, unknown> = {}) =>
  manifestSchema.parse([
    {
      archivo: "foto1.jpg",
      nombre: "Shampoo Hidratante",
      marca: "Marca Uno",
      categoria: "Higiene personal > Cuidado capilar",
      formato: "400 ml",
      contenido: 400,
      unidad: "ML",
      precio_referencia: 3990,
      fuente: "https://ejemplo.cl/shampoo",
      codigo_barras: null,
      descripcion: "Shampoo para uso diario.",
      ...over,
    },
  ]);

describe("carga desde manifiesto (Codex)", () => {
  it("precio 15 % bajo la referencia redondeado a $10 y SKU legible o código de barras", () => {
    expect(priceFrom(3990, 0.15)).toBe(3390); // 3391,5 → 3390
    expect(priceFrom(100, 0.15)).toBe(80);
    expect(skuFor(item()[0]!)).toBe("P-MARCA-UNO-SHAMPOO-HIDRATANTE-400-ML");
    expect(skuFor(item({ codigo_barras: "7801234567890" })[0]!)).toBe("7801234567890");
    // Nombres largos que comparten el comienzo no chocan (pasó con dos jabones Simond's).
    const largo = (v: string) => skuFor(item({ nombre: `Jabón de glicerina Simond's Dermo Care ${v}`, marca: "Simond's", formato: "750 ml" })[0]!);
    expect(largo("Cremoso")).not.toBe(largo("Jalea Real"));
    expect(largo("Cremoso").length).toBeLessThanOrEqual(42);
  });

  it("crea producto, marca, variante, stock y foto; publica solo con categoría; repetir no duplica", async () => {
    const opts = { descuento: 0.15, stock: 10, publicar: true };
    const [r] = await loadManifest(adminId, item(), dir, opts);
    expect(r).toMatchObject({ estado: "creado" });
    expect(r!.detalle).toContain("con foto");
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.sku, r!.sku));
    expect(v).toMatchObject({ price: 3390, stockOnHand: 10, name: "400 ml", compareAtPrice: null });
    const [p] = await db.select().from(s.products).where(eq(s.products.id, v!.productId));
    expect(p).toMatchObject({ active: true, name: "Shampoo Hidratante" });
    expect(await db.$count(s.productImages, eq(s.productImages.productId, p!.id))).toBe(1);
    expect(await db.$count(s.inventoryMovements, eq(s.inventoryMovements.variantId, v!.id))).toBe(1);

    expect((await loadManifest(adminId, item(), dir, opts))[0]!.estado).toBe("existente");
    const [sinCat] = await loadManifest(adminId, item({ nombre: "Otro", categoria: "No existe" }), dir, opts);
    expect(sinCat!.detalle).toContain("SIN CATEGORÍA (borrador)");
    expect(await db.$count(s.brands)).toBe(1);
  });

  it("el mismo producto en varias fotos es un solo producto con todas sus fotos; «revisar» se informa", async () => {
    const [base] = item({ revisar: "formato supuesto" });
    const r = await loadManifest(adminId, [base!, { ...base!, archivo: "foto2.jpg" }], dir, { descuento: 0.15, stock: 0, publicar: false });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ estado: "creado", revisar: "formato supuesto" });
    expect(r[0]!.detalle).toContain("con 2 fotos");
    expect(await db.$count(s.productImages)).toBe(2);
  });
});
