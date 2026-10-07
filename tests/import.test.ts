import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { readWorkbook, XlsxError } from "@/lib/xlsx";
import { can } from "@/modules/auth/rbac";
import { addToCart } from "@/modules/cart";
import { getProductBySlug } from "@/modules/catalog/queries";
import {
  applyImport,
  buildPlan,
  DEFAULT_OPTIONS,
  IMPORTED_VARIANT_NAME,
  type ImportOptions,
  importOptionsEntries,
  parseCatalogFile,
  readImportOptions,
} from "@/modules/catalog/import";
import { reserveStock } from "@/modules/inventory";
import { makeVariant, resetDb } from "./helpers";
import { type FixtureCell, makeXlsx, PREPARED_HEADERS, prepared } from "./xlsx-fixture";

let adminId: string;
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
});

const book = (...rows: FixtureCell[][]) => makeXlsx({ Catalogo: [PREPARED_HEADERS, ...rows], Origen: [["Código"]] });
const opts = (o: Partial<ImportOptions> = {}): ImportOptions => ({ ...DEFAULT_OPTIONS, ...o });
/** Vista previa + confirmación, como el panel (la huella sale de la vista previa). */
async function importFile(bytes: Uint8Array, o: Partial<ImportOptions> = {}, fileHash = crypto.randomUUID().replace(/-/g, "")) {
  const options = opts(o);
  const preview = await buildPlan(parseCatalogFile(bytes), options);
  return applyImport(adminId, { bytes, fileHash, fileName: "prueba.xlsx", options, expectedFingerprint: preview.fingerprint });
}
const variantBySku = async (sku: string) => {
  const [r] = await db
    .select({ v: s.productVariants, p: s.products })
    .from(s.productVariants)
    .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
    .where(eq(s.productVariants.sku, sku));
  return r;
};
async function category(path: string[]) {
  let parentId: string | null = null;
  for (const name of path) {
    const slug = `${name}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const [c]: (typeof s.categories.$inferSelect)[] = await db.insert(s.categories).values({ name, slug, parentId }).returning();
    parentId = c!.id;
  }
  return parentId!;
}

describe("lector xlsx", () => {
  it("devuelve el texto exacto de cada celda: ceros, letras, espacios, códigos largos, texto compartido y t=str", () => {
    const wb = readWorkbook(
      makeXlsx({ Hoja: [["00000789", "000789", { s: "43D9CCICKBF4BQ" }, { str: "69718015 77005" }, "2323333313133313131", { n: "2011.1" }, { n: "1000.0" }, "Jabón & Cía <1>"]] }),
    );
    const [row] = wb.readSheet("Hoja");
    expect(row!.cells.map((c) => c?.text)).toEqual(["00000789", "000789", "43D9CCICKBF4BQ", "69718015 77005", "2323333313133313131", "2011.1", "1000.0", "Jabón & Cía <1>"]);
    expect(row!.cells[5]!.numeric).toBe(true);
    expect(row!.cells[0]!.numeric).toBe(false);
  });

  it("lee archivos con etiquetas prefijadas y BOM (como el Excel real generado con .NET)", () => {
    const bytes = makeXlsx({ Catalogo: [PREPARED_HEADERS, prepared({ sku: { str: "000789" }, nombre: { s: "Confort x6" }, precio_clp: { n: "5200" } })] }, { dotnet: true });
    const p = parseCatalogFile(bytes);
    expect(p.rows[0]).toMatchObject({ sku: "000789", nombre: "Confort x6", precio: 5200, errors: [] });
  });

  it("rechaza archivo vacío, que no es xlsx, dañado o bomba de compresión", () => {
    expect(() => readWorkbook(new Uint8Array())).toThrow(XlsxError);
    expect(() => readWorkbook(new TextEncoder().encode("sku;nombre\n1;x"))).toThrow(/no es un Excel/);
    const good = book(prepared({ sku: "1", nombre: "A", precio_clp: { n: "1000" } }));
    expect(() => readWorkbook(good.slice(0, good.length - 30))).toThrow(XlsxError); // truncado
    // Bomba ZIP: una entrada que declara 100 MB descomprimidos se rechaza antes de descomprimir.
    const bomb = Buffer.from(good);
    const cd = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(100 * 1024 * 1024, cd + 24);
    expect(() => readWorkbook(new Uint8Array(bomb))).toThrow(/demasiado grande/);
  });
});

describe("perfiles y encabezados", () => {
  it("archivo preparado: solo lee la hoja Catalogo (Origen nunca se importa)", () => {
    const p = parseCatalogFile(book(prepared({ sku: "A1", nombre: "Uno", precio_clp: { n: "1000" } })));
    expect(p.profile).toBe("preparado");
    expect(p.rows).toHaveLength(1);
  });

  it("exportación de origen: hoja Productos con encabezados originales", () => {
    const bytes = makeXlsx({
      Productos: [
        ["Código", "Nombre", "Precio de Venta Neto", "Precio de Venta Bruto", "Stock Global", "Activo", "Param.1"],
        [{ n: "7804945060067" }, "Shampoo", { n: "838.66" }, { n: "998" }, { n: "5" }, { n: "1" }, null],
        [{ n: "23232323277712312" }, "Crema", { n: "1" }, { n: "1990" }, null, { n: "1" }, null],
        [{ n: "2.3233333131333131E+18" }, "Barra", { n: "1" }, { n: "1990" }, null, { n: "1" }, null],
      ],
    });
    const p = parseCatalogFile(bytes);
    expect(p.profile).toBe("origen");
    expect(p.rows[0]).toMatchObject({ sku: "7804945060067", precio: 998, stock: 5, errors: [] }); // el neto no es el precio
    expect(p.rows[1]!.errors.join()).toMatch(/más de 15 dígitos/); // 17 dígitos en celda numérica: no se acepta en silencio
    expect(p.rows[2]!.errors.join()).toMatch(/más de 15 dígitos/);
  });

  it("hoja incorrecta, ambas hojas, encabezado faltante o duplicado, sin filas", () => {
    expect(() => parseCatalogFile(makeXlsx({ Hoja1: [["sku"]] }))).toThrow(/No se encontró la hoja/);
    expect(() => parseCatalogFile(makeXlsx({ Catalogo: [PREPARED_HEADERS], Productos: [["Código"]] }))).toThrow(/deja solo/);
    expect(() => parseCatalogFile(makeXlsx({ Catalogo: [["sku", "nombre"], ["1", "x"]] }))).toThrow(/Faltan columnas obligatorias.*precio clp/);
    expect(() => parseCatalogFile(makeXlsx({ Catalogo: [["sku", "nombre", "precio_clp", "SKU"], ["1", "x", { n: "1" }, "2"]] }))).toThrow(/repetido/);
    expect(() => parseCatalogFile(makeXlsx({ Catalogo: [PREPARED_HEADERS] }))).toThrow(/no tiene filas/);
  });
});

describe("validación por fila", () => {
  it("precio: 1000.0 → 1000; 2011.1 bloquea sin redondear; fórmula rechazada; SKU repetido", () => {
    const p = parseCatalogFile(
      book(
        prepared({ sku: "A", nombre: "Ok", precio_clp: { n: "1000.0" }, precio_venta_neto_origen: { n: "840.33" } }),
        prepared({ sku: "B", nombre: "Decimal", precio_clp: { n: "2011.1" } }),
        prepared({ sku: "C", nombre: "Fórmula", precio_clp: { f: "A1*2", v: "2000" } }),
        prepared({ sku: " A ", nombre: "Repetido", precio_clp: { n: "500" } }),
      ),
    );
    expect(p.rows[0]).toMatchObject({ precio: 1000 });
    expect(p.rows[1]!.errors.join()).toMatch(/2011\.1.*no se redondea/);
    expect(p.rows[1]!.precio).toBeNull();
    expect(p.rows[2]!.errors.join()).toMatch(/fórmula/);
    expect(p.rows[0]!.errors.join()).toMatch(/repetido/); // " A " normalizado = "A"
    expect(p.rows[3]!.errors.join()).toMatch(/repetido/);
  });

  it("stock negativo, vacío y cero se distinguen", () => {
    const p = parseCatalogFile(
      book(
        prepared({ sku: "N", nombre: "Neg", precio_clp: { n: "1" }, stock_global_origen: { n: "-2" } }),
        prepared({ sku: "V", nombre: "Vacío", precio_clp: { n: "1" } }),
        prepared({ sku: "Z", nombre: "Cero", precio_clp: { n: "1" }, stock_inicial: { n: "0" }, stock_global_origen: { n: "0" } }),
      ),
    );
    expect(p.rows.map((r) => r.stock)).toEqual([null, null, 0]);
    expect(p.rows[0]!.warnings.join()).toMatch(/negativo/);
    expect(p.rows[1]!.warnings.join()).toMatch(/Sin dato de stock/);
    expect(p.rows[2]!.warnings.join()).not.toMatch(/stock/i);
  });
});

describe("importar", () => {
  const SKUS = ["00000789", "000789", "43D9CCICKBF4BQ", "69718015 77005", "2323333313133313131"];

  it("crea borradores con el SKU exacto, variante «Unidad», sin costo, sin stock ni movimientos, y audita el origen", async () => {
    const rows = SKUS.map((sku, i) =>
      prepared({ sku: { str: sku }, nombre: `Producto ${i}`, precio_clp: { n: `${1000 + i}` }, stock_inicial: { n: "7" }, costo_compra_neto_origen: { n: "500" }, fila_origen: { n: `${i + 2}` }, observaciones: i === 4 ? "codigo_largo, codigo_numerico_mas_15_digitos" : null }),
    );
    // Sin confirmar el código largo de origen numérico, esa fila bloquea.
    expect((await buildPlan(parseCatalogFile(book(...rows)), opts())).counts.bloqueadas).toBe(1);
    const res = await importFile(book(...rows), { confirmLongCodes: true });
    expect(res).toMatchObject({ created: 5, stockMovements: 0 });
    for (const sku of SKUS) {
      const r = (await variantBySku(sku))!;
      expect(r.v).toMatchObject({ sku, name: IMPORTED_VARIANT_NAME, costPrice: null, stockOnHand: 0, stockReserved: 0, barcode: null, isDefault: true });
      expect(r.p).toMatchObject({ active: false, categoryId: null, brandId: null });
    }
    expect(await db.$count(s.inventoryMovements)).toBe(0);
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "product.import"));
    expect(logs).toHaveLength(5);
    expect(JSON.stringify(logs[0]!.after)).toContain('"costoNetoOrigen":"500"');
    expect(await db.$count(s.auditLogs, eq(s.auditLogs.action, "catalog.import"))).toBe(1);
  });

  it("los borradores no se ven ni se pueden comprar; publicar exige categoría y entonces se ven", async () => {
    const cat = await category(["Aseo del hogar", "Cocina"]);
    await importFile(
      book(
        prepared({ sku: "BOR", nombre: "Borrador", precio_clp: { n: "1000" }, publicar_web: { n: "1" } }),
        prepared({ sku: "PUB", nombre: "Publicado", precio_clp: { n: "1000" }, publicar_web: { n: "1" }, categoria_ruta: "aseo del HOGAR > cocina" }),
      ),
    );
    const bor = (await variantBySku("BOR"))!;
    const pub = (await variantBySku("PUB"))!;
    expect(bor.p.active).toBe(false); // publicar_web=1 sin categoría → borrador
    expect(pub.p).toMatchObject({ active: true, categoryId: cat });
    expect(await getProductBySlug(bor.p.slug)).toBeNull();
    expect(await getProductBySlug(pub.p.slug)).not.toBeNull();
    await expect(addToCart(null, { variantId: bor.v.id, quantity: 1 })).rejects.toThrow(/no está disponible/);
    // La base tampoco admite un producto publicado sin categoría.
    await expect(db.update(s.products).set({ active: true }).where(eq(s.products.id, bor.p.id))).rejects.toThrow();
  });

  it("nombres repetidos: slugs distintos y estables; un slug ocupado se respeta", async () => {
    const existing = await makeVariant(0);
    await db.update(s.products).set({ slug: "talco-pies" }).where(eq(s.products.id, existing.productId));
    await importFile(
      book(
        prepared({ sku: "7791274004377", nombre: "Talco pies", precio_clp: { n: "1000" } }),
        prepared({ sku: "7791274187742", nombre: "Talco pies", precio_clp: { n: "1000" } }),
      ),
    );
    const a = (await variantBySku("7791274004377"))!.p.slug;
    const b = (await variantBySku("7791274187742"))!.p.slug;
    expect([a, b]).toEqual(["talco-pies-7791274004377", "talco-pies-7791274187742"]);
  });

  it("stock inicial opcional: exige cantidades revisadas y usa movimientos INITIAL_STOCK en la misma transacción", async () => {
    const file = book(
      prepared({ sku: "S5", nombre: "Cinco", precio_clp: { n: "1000" }, stock_inicial: { n: "5" } }),
      prepared({ sku: "S0", nombre: "Cero", precio_clp: { n: "1000" }, stock_inicial: { n: "0" } }),
      prepared({ sku: "SV", nombre: "Vacío", precio_clp: { n: "1000" } }),
    );
    const plan = await buildPlan(parseCatalogFile(file), opts({ loadStock: true }));
    expect(plan.rows.find((r) => r.sku === "SV")!.blocking.join()).toMatch(/desconocido/);
    await expect(importFile(file, { loadStock: true })).rejects.toThrow(/errores/);
    const res = await importFile(file, { loadStock: true, excludeErrors: true });
    expect(res).toMatchObject({ created: 2, excluded: 1, stockMovements: 1 });
    expect((await variantBySku("S5"))!.v.stockOnHand).toBe(5);
    expect((await variantBySku("S0"))!.v.stockOnHand).toBe(0);
    expect(await variantBySku("SV")).toBeUndefined();
    const moves = await db.select().from(s.inventoryMovements);
    expect(moves).toEqual([expect.objectContaining({ type: "INITIAL_STOCK", quantity: 5, createdBy: adminId })]);
  });

  it("SKU existente: solo el precio por defecto; vacío no borra; no toca stock, reservas, publicación ni imágenes", async () => {
    const v = await makeVariant(10, "EXIST-1");
    await db.update(s.products).set({ description: "Texto del admin" }).where(eq(s.products.id, v.productId));
    await db.insert(s.productImages).values({ productId: v.productId, url: "/media/x.webp" });
    const [c] = await db.insert(s.customers).values({ email: "c@test.cl", firstName: "C", lastName: "D" }).returning();
    const [o] = await db.insert(s.orders).values({ customerId: c!.id, email: "c@test.cl", customerName: "C D", subtotal: 1, total: 1 }).returning();
    await db.transaction((tx) => reserveStock(tx, o!.id, [{ variantId: v.id, quantity: 3 }]));
    const file = book(prepared({ sku: "EXIST-1", nombre: "NOMBRE DEL EXCEL", precio_clp: { n: "1590" }, stock_inicial: { n: "99" }, publicar_web: { n: "0" } }));

    const plan = await buildPlan(parseCatalogFile(file), opts());
    expect(plan.rows[0]!.changes).toEqual([{ field: "Precio", from: "1000", to: "1590" }]);
    await importFile(file, { loadStock: true });
    const r = (await variantBySku("EXIST-1"))!;
    expect(r.v).toMatchObject({ price: 1590, stockOnHand: 10, stockReserved: 3 });
    expect(r.p).toMatchObject({ name: "Prod", description: "Texto del admin", active: true });
    expect(await db.$count(s.productImages)).toBe(1);
    expect(await db.$count(s.inventoryMovements)).toBe(1); // solo el INITIAL_STOCK del helper: reimportar no suma stock

    // Omitir: nada cambia. Otros campos solo si se eligen explícitamente.
    await importFile(book(prepared({ sku: "EXIST-1", nombre: "X", precio_clp: { n: "2000" } })), { existing: "omitir" });
    expect((await variantBySku("EXIST-1"))!.v.price).toBe(1590);
    await importFile(file, { fields: ["nombre"] });
    expect((await variantBySku("EXIST-1"))!.p.name).toBe("NOMBRE DEL EXCEL");
  });

  it("categoría por ruta completa (no confunde ramas homónimas); crear referencias solo con la opción", async () => {
    const hogar = await category(["Hogar", "Accesorios"]);
    await category(["Higiene", "Accesorios"]);
    const file = book(
      prepared({ sku: "R1", nombre: "Uno", precio_clp: { n: "1000" }, categoria_ruta: "Hogar > Accesorios", marca: "Marca Nueva" }),
      prepared({ sku: "R2", nombre: "Dos", precio_clp: { n: "1000" }, categoria_ruta: "Cuidado › Pies" }),
    );
    const plan = await buildPlan(parseCatalogFile(file), opts());
    expect(plan.counts.bloqueadas).toBe(2); // marca y categoría inexistentes sin la opción de crear
    const res = await importFile(file, { createRefs: true });
    expect(res).toMatchObject({ created: 2, brands: 1, categories: 2 });
    expect((await variantBySku("R1"))!.p.categoryId).toBe(hogar);
    const [pies] = await db.select().from(s.categories).where(eq(s.categories.name, "Pies"));
    expect((await variantBySku("R2"))!.p.categoryId).toBe(pies!.id);
  });
});

describe("confirmación segura", () => {
  it("si el catálogo cambió desde la vista previa, no se aplica", async () => {
    const v = await makeVariant(1, "CAMBIA");
    const file = book(prepared({ sku: "CAMBIA", nombre: "x", precio_clp: { n: "1500" } }));
    const options = opts();
    const preview = await buildPlan(parseCatalogFile(file), options);
    await db.update(s.productVariants).set({ price: 1200 }).where(eq(s.productVariants.id, v.id)); // otro admin cambió el precio
    await expect(applyImport(adminId, { bytes: file, fileHash: "a".repeat(64), fileName: "x.xlsx", options, expectedFingerprint: preview.fingerprint })).rejects.toThrow(
      /cambió desde la vista previa/,
    );
    // Huella inventada (confirmación manipulada) tampoco.
    await expect(applyImport(adminId, { bytes: file, fileHash: "b".repeat(64), fileName: "x.xlsx", options, expectedFingerprint: "x" })).rejects.toThrow(UserError);
    expect((await variantBySku("CAMBIA"))!.v.price).toBe(1200);
  });

  it("doble confirmación (doble clic o dos pestañas a la vez): se aplica una sola vez", async () => {
    const file = book(prepared({ sku: "DOBLE", nombre: "x", precio_clp: { n: "1500" } }));
    const options = opts();
    const preview = await buildPlan(parseCatalogFile(file), options);
    const run = () => applyImport(adminId, { bytes: file, fileHash: "c".repeat(64), fileName: "x.xlsx", options, expectedFingerprint: preview.fingerprint });
    const results = await Promise.allSettled([run(), run()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.$count(s.productVariants, eq(s.productVariants.sku, "DOBLE"))).toBe(1);
    await expect(run()).rejects.toThrow(/ya se aplicó|cambió/);
  });

  it("si algo falla a mitad de la escritura, no queda nada (rollback real en PostgreSQL)", async () => {
    await db.execute(sql`CREATE FUNCTION falla_prueba() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.name = 'FALLA' THEN RAISE EXCEPTION 'falla simulada'; END IF; RETURN NEW; END $$`);
    await db.execute(sql`CREATE TRIGGER falla_prueba BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION falla_prueba()`);
    try {
      const file = book(
        prepared({ sku: "OK1", nombre: "Bien", precio_clp: { n: "1000" }, stock_inicial: { n: "4" } }),
        prepared({ sku: "OK2", nombre: "FALLA", precio_clp: { n: "1000" }, stock_inicial: { n: "4" } }),
      );
      // Drizzle envuelve el error de PostgreSQL: el mensaje del trigger viene en `cause`.
      await expect(importFile(file, { loadStock: true })).rejects.toSatisfy((e) => String((e as Error).cause).includes("falla simulada"));
      expect(await db.$count(s.products)).toBe(0);
      expect(await db.$count(s.inventoryMovements)).toBe(0);
      expect(await db.$count(s.auditLogs)).toBe(0);
    } finally {
      await db.execute(sql`DROP TRIGGER falla_prueba ON products; DROP FUNCTION falla_prueba()`);
    }
  });

  it("opciones: la URL y el formulario se leen igual; desmarcar todos los campos no vuelve a marcar el precio", () => {
    const o = opts({ loadStock: true, existing: "actualizar", fields: ["categoria", "precio"], excludeErrors: true });
    const entries = importOptionsEntries({ ...o, fields: ["precio", "categoria"] });
    const back = readImportOptions((k) => entries.filter(([key]) => key === k).map(([, v]) => v));
    expect(back).toEqual({ ...o, fields: ["precio", "categoria"] });
    expect(readImportOptions((k) => (k === "opciones" ? ["1"] : [])).fields).toEqual([]);
    expect(readImportOptions(() => [])).toEqual(DEFAULT_OPTIONS);
  });

  it("solo quien edita el catálogo puede importar", () => {
    expect(can("ADMIN", "catalog:write")).toBe(true);
    expect(can("SALES", "catalog:write")).toBe(false);
    expect(can("WAREHOUSE", "catalog:write")).toBe(false);
    expect(can("CUSTOMER", "catalog:write")).toBe(false);
  });
});
