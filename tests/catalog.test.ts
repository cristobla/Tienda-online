import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { parseCatalogParams } from "@/modules/catalog/params";
import { contentLabel, discountPercent, unitPriceLabel } from "@/modules/catalog/pricing";
import { type Filters, getFacets, getProductBySlug, listProducts, resolveFilters } from "@/modules/catalog/queries";
import { slugify } from "@/lib/slug";
import { getCategoryBySlug, loadCategories, subtreeIds } from "@/modules/categories/queries";
import { resetDb } from "./helpers";

type V = Partial<typeof s.productVariants.$inferInsert> & { sku: string; price: number };

async function cat(name: string, parentId: string | null = null, active = true) {
  const [c] = await db.insert(s.categories).values({ name, slug: name.toLowerCase(), parentId, active }).returning();
  return c!;
}
async function product(name: string, categoryId: string, brandId: string | null, variants: V[], extra: Partial<typeof s.products.$inferInsert> = {}) {
  const slug = slugify(name);
  const [p] = await db.insert(s.products).values({ name, slug, categoryId, brandId, ...extra }).returning();
  for (const [i, v] of variants.entries())
    await db.insert(s.productVariants).values({ productId: p!.id, name: v.sku, isDefault: i === 0, sortOrder: i, ...v });
  return p!;
}

let all: string[];
const names = (r: { items: { name: string }[] }) => r.items.map((p) => p.name).sort();
const list = (f: Filters = {}, q?: string) => listProducts({ categoryIds: all, q }, f);

beforeAll(async () => {
  await resetDb();
  const cuerpo = await cat("Cuerpo");
  const cabello = await cat("Cabello");
  const hogar = await cat("Hogar");
  const cocina = await cat("Cocina", hogar.id);
  const oculta = await cat("Oculta", null, false);
  await cat("Huerfana", oculta.id); // activa, pero su madre no: no visible

  const [alfa, beta, inactiva] = await db
    .insert(s.brands)
    .values([
      { name: "Alfa", slug: "alfa" },
      { name: "Beta", slug: "beta" },
      { name: "Retirada", slug: "retirada", active: false },
    ])
    .returning();

  await db.insert(s.attributeDefinitions).values([
    { code: "aroma", label: "Aroma", filterable: true },
    { code: "hipoalergenico", label: "Hipoalergénico", type: "BOOLEAN", filterable: true },
    { code: "talla", label: "Talla", type: "SELECT", scope: "VARIANT", filterable: true },
    { code: "registro_isp", label: "Registro ISP" },
  ]);

  await product("Jabón de Glicerina", cuerpo.id, alfa!.id, [
    { sku: "JB-1", price: 990, stockOnHand: 10, stockReserved: 3, netContent: "90", contentUnit: "G" },
    { sku: "JB-6", price: 4990, compareAtPrice: 5940, unitsPerPack: 6, netContent: "90", contentUnit: "G" },
  ], { attributes: { aroma: "Neutro", hipoalergenico: true }, featured: true });
  await product("Shampoo Hidratación", cabello.id, beta!.id, [{ sku: "SH-001", barcode: "2000000000017", price: 2990 }], { attributes: { aroma: "Coco" } });
  await product("Lavalozas Limón", cocina.id, alfa!.id, [{ sku: "LV-1", price: 1490, stockOnHand: 5 }], { attributes: { aroma: "Limón" } });
  await product("Guantes de Látex", hogar.id, beta!.id, [
    { sku: "GU-S", price: 1490, stockOnHand: 1, attributes: { talla: "S" } },
    { sku: "GU-M", price: 1490, attributes: { talla: "M" } },
  ]);
  await product("Producto Inactivo", cuerpo.id, alfa!.id, [{ sku: "X-1", price: 100, stockOnHand: 1 }], { active: false });
  await product("En Categoría Oculta", oculta.id, alfa!.id, [{ sku: "X-2", price: 100, stockOnHand: 1 }]);
  await product("Sin Variantes Activas", cuerpo.id, inactiva!.id, [{ sku: "X-3", price: 100, stockOnHand: 1, active: false }]);

  all = (await loadCategories()).visibleIds;
});

describe("categorías", () => {
  it("solo son visibles las activas con ancestros activos", async () => {
    const { bySlug } = await loadCategories();
    expect([...bySlug.keys()].sort()).toEqual(["cabello", "cocina", "cuerpo", "hogar"]);
    expect(await getCategoryBySlug("huerfana")).toBeNull();
  });

  it("entrega la ruta desde la raíz", async () => {
    const r = await getCategoryBySlug("cocina");
    expect(r!.path.map((c) => c.slug)).toEqual(["hogar", "cocina"]);
  });

  it("una categoría incluye los productos de sus subcategorías", async () => {
    const hogar = (await getCategoryBySlug("hogar"))!.category;
    expect(names(await listProducts({ categoryIds: subtreeIds(hogar) }))).toEqual(["Guantes de Látex", "Lavalozas Limón"]);
  });
});

describe("listado", () => {
  it("excluye inactivos, categorías ocultas y productos sin variantes activas", async () => {
    const r = await list();
    expect(r.total).toBe(4);
    expect(names(r)).toEqual(["Guantes de Látex", "Jabón de Glicerina", "Lavalozas Limón", "Shampoo Hidratación"]);
  });

  it("muestra la variante más barata y el rango de precios", async () => {
    const jabon = (await list({}, "jabon")).items[0]!;
    expect(jabon).toMatchObject({ price: 990, maxPrice: 4990, variantCount: 2, inStock: true });
  });

  it("disponible = físico menos reservado", async () => {
    expect(names(await list({ inStock: true }))).toEqual(["Guantes de Látex", "Jabón de Glicerina", "Lavalozas Limón"]);
  });

  it("filtra por marca y rango de precio", async () => {
    const [alfa] = await db.select().from(s.brands).where(eq(s.brands.slug, "alfa"));
    expect(names(await list({ brandIds: [alfa!.id] }))).toEqual(["Jabón de Glicerina", "Lavalozas Limón"]);
    expect(names(await list({ minPrice: 1000, maxPrice: 2000 }))).toEqual(["Guantes de Látex", "Lavalozas Limón"]);
  });

  it("filtra por atributos de producto (OR dentro del atributo), booleanos y de variante", async () => {
    const f = (sp: Record<string, string | string[]>) => resolveFilters(parseCatalogParams(sp));
    expect(names(await list(await f({ a_aroma: ["Coco", "Limón"] })))).toEqual(["Lavalozas Limón", "Shampoo Hidratación"]);
    expect(names(await list(await f({ a_hipoalergenico: "true" })))).toEqual(["Jabón de Glicerina"]);
    expect(names(await list(await f({ a_talla: "M" })))).toEqual(["Guantes de Látex"]);
    // Atributos no filtrables o inexistentes se ignoran.
    expect((await list(await f({ a_registro_isp: "X", a_inventado: "1" }))).total).toBe(4);
  });

  it("ordena por precio y pagina", async () => {
    const asc = await listProducts({ categoryIds: all }, {}, { sort: "precio_asc" });
    expect(asc.items.map((p) => p.price)).toEqual([990, 1490, 1490, 2990]);
    const p2 = await listProducts({ categoryIds: all }, {}, { sort: "precio_desc", page: 2, pageSize: 3 });
    expect(p2).toMatchObject({ total: 4, page: 2 });
    expect(p2.items.map((p) => p.price)).toEqual([990]);
  });
});

describe("búsqueda", () => {
  const search = async (q: string) => names(await list({}, q));

  it("tolera tildes y mayúsculas", async () => {
    expect(await search("JABON")).toEqual(["Jabón de Glicerina"]);
    expect(await search("latex")).toEqual(["Guantes de Látex"]);
  });
  it("tolera errores de tipeo y palabras parciales", async () => {
    expect(await search("shampo")).toEqual(["Shampoo Hidratación"]);
    expect(await search("lavalo")).toEqual(["Lavalozas Limón"]);
  });
  it("encuentra por marca, SKU y código de barras", async () => {
    expect(await search("beta")).toEqual(["Guantes de Látex", "Shampoo Hidratación"]);
    expect(await search("sh-001")).toEqual(["Shampoo Hidratación"]);
    expect(await search("2000000000017")).toEqual(["Shampoo Hidratación"]);
  });
  it("los comodines de LIKE no se interpretan", async () => {
    expect(await search("%")).toEqual([]);
    expect(await search("_")).toEqual([]);
  });
  it("sin resultados no falla", async () => expect(await search("zzzzqqq")).toEqual([]));
});

describe("facetas", () => {
  it("cuenta marcas, valores de atributos y rango de precio dentro del alcance", async () => {
    const f = await getFacets({ categoryIds: all });
    expect(f.brands.map((b) => [b.slug, b.count])).toEqual([["alfa", 2], ["beta", 2]]);
    expect(f.price).toEqual({ min: 990, max: 2990 });
    const aroma = f.attributes.find((a) => a.def.code === "aroma")!;
    expect(aroma.values.map((v) => v.value).sort()).toEqual(["Coco", "Limón", "Neutro"]);
    expect(f.attributes.find((a) => a.def.code === "talla")!.values).toEqual([{ value: "M", count: 1 }, { value: "S", count: 1 }]);
    expect(f.attributes.some((a) => a.def.code === "registro_isp")).toBe(false);
  });
});

describe("ficha de producto", () => {
  it("entrega variantes ordenadas con disponible calculado y la ruta de categorías", async () => {
    const p = (await getProductBySlug("jabon-de-glicerina"))!;
    expect(p.variants.map((v) => [v.sku, v.available])).toEqual([["JB-1", 7], ["JB-6", 0]]);
    expect(p.categoryPath.map((c) => c.slug)).toEqual(["cuerpo"]);
    expect(p.brand?.slug).toBe("alfa");
  });
  it("no muestra productos inactivos, en categorías ocultas ni sin variantes activas", async () => {
    expect(await getProductBySlug("producto-inactivo")).toBeNull();
    expect(await getProductBySlug("en-categoria-oculta")).toBeNull();
    expect(await getProductBySlug("sin-variantes-activas")).toBeNull();
    expect(await getProductBySlug("no-existe")).toBeNull();
  });
});

describe("parámetros de URL", () => {
  it("ignora valores inválidos en vez de fallar", () => {
    const p = parseCatalogParams({ pagina: "-3", orden: "hackeo", precio_min: "abc", q: "  ", disponible: "si" });
    expect(p).toMatchObject({ page: 1, sort: undefined, minPrice: undefined, q: undefined, inStock: false });
  });
  it("lee filtros múltiples", () => {
    const p = parseCatalogParams({ marca: ["a", "b"], a_aroma: "Coco", precio_max: "5000", disponible: "1", pagina: "2" });
    expect(p).toMatchObject({ brandSlugs: ["a", "b"], attrs: { aroma: ["Coco"] }, maxPrice: 5000, inStock: true, page: 2 });
  });
});

describe("precio por unidad de medida", () => {
  const v = { price: 4990, compareAtPrice: null, netContent: "500", contentUnit: "ML" as const, unitsPerPack: 1 };
  it("por litro, kilo y unidad", () => {
    expect(unitPriceLabel(v)).toBe("$9.980 por L");
    expect(unitPriceLabel({ ...v, netContent: "90", contentUnit: "G", unitsPerPack: 6 })).toBe("$9.241 por kg");
    expect(unitPriceLabel({ ...v, netContent: null, contentUnit: "UNIT", unitsPerPack: 4 })).toBe("$1.248 c/u");
    expect(unitPriceLabel({ ...v, netContent: null, contentUnit: "UNIT" })).toBeNull();
  });
  it("describe el contenido", () => {
    expect(contentLabel({ netContent: "1.500", contentUnit: "L", unitsPerPack: 1 })).toBe("1,5 L");
    expect(contentLabel({ netContent: "90.000", contentUnit: "G", unitsPerPack: 6 })).toBe("6 × 90 g");
    expect(contentLabel({ netContent: null, contentUnit: "UNIT", unitsPerPack: 12 })).toBe("12 unidades");
    expect(contentLabel({ netContent: null, contentUnit: "UNIT", unitsPerPack: 1 })).toBeNull();
  });
  it("descuento redondeado hacia abajo", () => {
    expect(discountPercent({ price: 4990, compareAtPrice: 5990 })).toBe(16);
    expect(discountPercent({ price: 4990, compareAtPrice: null })).toBeNull();
  });
});
