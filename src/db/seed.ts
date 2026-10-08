/**
 * Datos de PRUEBA para desarrollo. Todo queda marcado: marcas "Demo …", SKU "DEMO-…",
 * códigos de barra en el rango interno 200-299 (no corresponden a productos reales)
 * y descripciones que comienzan con "[DATO DE PRUEBA]".
 *
 * Borra y vuelve a crear catálogo, pedidos y usuarios. Se niega a correr en producción.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { addToCart, getCart } from "@/modules/cart";
import { applyMovement } from "@/modules/inventory";
import { changeOrderStatus } from "@/modules/orders";
import { confirmTransfer, placeOrder } from "@/modules/payments";
import { quoteShipping } from "@/modules/shipping";
import { db, pool } from ".";
import { loadReferenceData } from "./reference-data";
import * as s from "./schema";

if (process.env.NODE_ENV === "production") throw new Error("El seed de prueba no se ejecuta en producción.");

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? "admin@demo.local").toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
if (ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH)
  throw new Error(`Define SEED_ADMIN_PASSWORD en .env (mínimo ${MIN_PASSWORD_LENGTH} caracteres).`);

type Unit = (typeof s.contentUnit.enumValues)[number];
type V = {
  name: string;
  price: number;
  compare?: number;
  cost?: number;
  net?: number;
  unit?: Unit;
  pack?: number;
  stock: number;
  min?: number;
  attrs?: s.Attributes;
};
type P = { name: string; cat: string; brand: string; featured?: boolean; attrs?: s.Attributes; desc: string; variants: V[] };

const CATEGORIES: [string, string | null][] = [
  ["Higiene personal", null],
  ["Cuidado capilar", "Higiene personal"],
  ["Cuidado corporal", "Higiene personal"],
  ["Cuidado dental", "Higiene personal"],
  ["Desodorantes", "Higiene personal"],
  ["Afeitado", "Higiene personal"],
  ["Higiene femenina", "Higiene personal"],
  ["Aseo del hogar", null],
  ["Cocina", "Aseo del hogar"],
  ["Lavalozas", "Cocina"],
  ["Limpiadores", "Aseo del hogar"],
  ["Lavado de ropa", "Aseo del hogar"],
  ["Desinfectantes y cloro", "Aseo del hogar"],
  ["Papeles", "Aseo del hogar"],
  ["Bolsas de basura", "Aseo del hogar"],
  ["Accesorios", null],
  ["Cepillos y peines", "Accesorios"],
  ["Esponjas y paños", "Accesorios"],
  ["Guantes", "Accesorios"],
];

const BRANDS = ["Demo Aqua", "Demo Brisa", "Demo Hogar Limpio", "Demo Sonrisa", "Demo Natura Sur", "Demo Andes", "Demo Suave"];

const ATTRIBUTES: (typeof s.attributeDefinitions.$inferInsert)[] = [
  { code: "aroma", label: "Aroma", type: "TEXT", scope: "PRODUCT", filterable: true },
  { code: "tipo_cabello", label: "Tipo de cabello", type: "SELECT", scope: "PRODUCT", options: ["Normal", "Seco", "Graso", "Todo tipo"], filterable: true },
  { code: "tipo_piel", label: "Tipo de piel", type: "SELECT", scope: "PRODUCT", options: ["Normal", "Seca", "Grasa", "Sensible", "Todo tipo"], filterable: true },
  { code: "hipoalergenico", label: "Hipoalergénico", type: "BOOLEAN", scope: "PRODUCT", filterable: true },
  { code: "registro_isp", label: "Registro ISP", type: "TEXT", scope: "PRODUCT" },
  { code: "metros_por_rollo", label: "Metros por rollo", type: "NUMBER", scope: "VARIANT", unit: "m" },
  { code: "talla", label: "Talla", type: "SELECT", scope: "VARIANT", options: ["S", "M", "L"], filterable: true },
];

const T = "[DATO DE PRUEBA] ";
const PRODUCTS: P[] = [
  { name: "Shampoo Hidratación", cat: "Cuidado capilar", brand: "Demo Aqua", featured: true, attrs: { tipo_cabello: "Seco", aroma: "Coco" }, desc: "Shampoo hidratante para uso diario.",
    variants: [
      { name: "250 ml", price: 2990, cost: 1500, net: 250, unit: "ML", stock: 40, min: 5 },
      { name: "500 ml", price: 4990, compare: 5990, cost: 2500, net: 500, unit: "ML", stock: 25, min: 5 },
      { name: "1 L", price: 7990, cost: 4000, net: 1, unit: "L", stock: 3, min: 5 },
    ] },
  { name: "Acondicionador Hidratación", cat: "Cuidado capilar", brand: "Demo Aqua", attrs: { tipo_cabello: "Seco", aroma: "Coco" }, desc: "Acondicionador para cabello seco.",
    variants: [{ name: "350 ml", price: 3490, cost: 1700, net: 350, unit: "ML", stock: 30, min: 5 }] },
  { name: "Jabón de Glicerina", cat: "Cuidado corporal", brand: "Demo Natura Sur", featured: true, attrs: { tipo_piel: "Sensible", hipoalergenico: true, aroma: "Neutro" }, desc: "Jabón de glicerina en barra.",
    variants: [
      { name: "1 unidad 90 g", price: 990, cost: 400, net: 90, unit: "G", stock: 120, min: 20 },
      { name: "Pack 6 x 90 g", price: 4990, compare: 5940, cost: 2400, net: 90, unit: "G", pack: 6, stock: 15, min: 5 },
    ] },
  { name: "Crema Corporal Karité", cat: "Cuidado corporal", brand: "Demo Natura Sur", attrs: { tipo_piel: "Seca" }, desc: "Crema corporal nutritiva.",
    variants: [{ name: "400 ml", price: 5490, cost: 2800, net: 400, unit: "ML", stock: 0, min: 5 }] },
  { name: "Pasta Dental Blanqueadora", cat: "Cuidado dental", brand: "Demo Sonrisa", featured: true, desc: "Pasta dental con flúor.",
    variants: [
      { name: "90 g", price: 1990, cost: 900, net: 90, unit: "G", stock: 80, min: 10 },
      { name: "Pack 3 x 90 g", price: 4990, cost: 2600, net: 90, unit: "G", pack: 3, stock: 4, min: 6 },
    ] },
  { name: "Enjuague Bucal Menta", cat: "Cuidado dental", brand: "Demo Sonrisa", attrs: { aroma: "Menta" }, desc: "Enjuague bucal sin alcohol.",
    variants: [{ name: "500 ml", price: 3990, cost: 1900, net: 500, unit: "ML", stock: 22, min: 5 }] },
  { name: "Cepillo Dental Suave", cat: "Cepillos y peines", brand: "Demo Sonrisa", desc: "Cepillo de cerdas suaves.",
    variants: [
      { name: "1 unidad", price: 1290, cost: 500, stock: 60, min: 10 },
      { name: "Pack 2 unidades", price: 2290, cost: 1000, pack: 2, stock: 25, min: 5 },
    ] },
  { name: "Desodorante Spray Hombre", cat: "Desodorantes", brand: "Demo Andes", attrs: { aroma: "Maderas" }, desc: "Desodorante en aerosol 48 h.",
    variants: [{ name: "150 ml", price: 2790, compare: 3290, cost: 1300, net: 150, unit: "ML", stock: 35, min: 5 }] },
  { name: "Desodorante Roll-on Mujer", cat: "Desodorantes", brand: "Demo Brisa", attrs: { aroma: "Floral" }, desc: "Desodorante roll-on sin alcohol.",
    variants: [{ name: "50 ml", price: 2490, cost: 1100, net: 50, unit: "ML", stock: 0, min: 5 }] },
  { name: "Máquina de Afeitar Desechable", cat: "Afeitado", brand: "Demo Andes", desc: "Máquina de afeitar de 3 hojas.",
    variants: [{ name: "Pack 5 unidades", price: 3490, cost: 1600, pack: 5, stock: 18, min: 5 }] },
  { name: "Toallas Higiénicas Nocturnas", cat: "Higiene femenina", brand: "Demo Brisa", desc: "Toallas higiénicas con alas.",
    variants: [{ name: "8 unidades", price: 2290, cost: 1000, pack: 8, stock: 50, min: 10 }] },
  { name: "Lavalozas Limón", cat: "Lavalozas", brand: "Demo Hogar Limpio", featured: true, attrs: { aroma: "Limón" }, desc: "Lavalozas concentrado.",
    variants: [
      { name: "500 ml", price: 1490, cost: 600, net: 500, unit: "ML", stock: 60, min: 10 },
      { name: "750 ml", price: 1990, cost: 850, net: 750, unit: "ML", stock: 40, min: 10 },
      { name: "1,5 L", price: 3490, cost: 1500, net: 1.5, unit: "L", stock: 2, min: 5 },
    ] },
  { name: "Limpiador Multiuso", cat: "Limpiadores", brand: "Demo Hogar Limpio", attrs: { aroma: "Lavanda" }, desc: "Limpiador multiuso para superficies.",
    variants: [{ name: "500 ml", price: 1990, cost: 800, net: 500, unit: "ML", stock: 45, min: 10 }] },
  { name: "Detergente Líquido Ropa", cat: "Lavado de ropa", brand: "Demo Hogar Limpio", featured: true, desc: "Detergente líquido para lavadora.",
    variants: [{ name: "3 L", price: 8990, compare: 10990, cost: 4500, net: 3, unit: "L", stock: 12, min: 4 }] },
  { name: "Cloro Gel", cat: "Desinfectantes y cloro", brand: "Demo Brisa", attrs: { registro_isp: "DEMO-0000" }, desc: "Cloro gel para baño y cocina.",
    variants: [{ name: "900 ml", price: 1690, cost: 700, net: 900, unit: "ML", stock: 70, min: 10 }] },
  { name: "Desinfectante en Aerosol", cat: "Desinfectantes y cloro", brand: "Demo Hogar Limpio", attrs: { registro_isp: "DEMO-0001", aroma: "Original" }, desc: "Desinfectante de ambientes y superficies.",
    variants: [{ name: "360 ml", price: 3990, cost: 1900, net: 360, unit: "ML", stock: 5, min: 10 }] },
  { name: "Papel Higiénico Doble Hoja", cat: "Papeles", brand: "Demo Suave", featured: true, desc: "Papel higiénico doble hoja.",
    variants: [
      { name: "4 rollos", price: 2490, cost: 1200, pack: 4, stock: 40, min: 10, attrs: { metros_por_rollo: 30 } },
      { name: "12 rollos", price: 6490, compare: 7490, cost: 3300, pack: 12, stock: 20, min: 5, attrs: { metros_por_rollo: 30 } },
    ] },
  { name: "Toalla de Papel", cat: "Papeles", brand: "Demo Suave", desc: "Toalla de papel absorbente.",
    variants: [{ name: "2 rollos", price: 2190, cost: 1000, pack: 2, stock: 0, min: 5, attrs: { metros_por_rollo: 12 } }] },
  { name: "Bolsas de Basura 80x110", cat: "Bolsas de basura", brand: "Demo Hogar Limpio", desc: "Bolsas de basura reforzadas.",
    variants: [{ name: "10 unidades", price: 1990, cost: 800, pack: 10, stock: 33, min: 10 }] },
  { name: "Esponja Doble Uso", cat: "Esponjas y paños", brand: "Demo Hogar Limpio", desc: "Esponja con fibra abrasiva.",
    variants: [{ name: "Pack 3 unidades", price: 990, cost: 350, pack: 3, stock: 100, min: 20 }] },
  { name: "Guantes de Látex", cat: "Guantes", brand: "Demo Hogar Limpio", desc: "Guantes de látex para limpieza.",
    variants: [
      { name: "Talla S", price: 1490, cost: 600, stock: 10, min: 5, attrs: { talla: "S" } },
      { name: "Talla M", price: 1490, cost: 600, stock: 3, min: 5, attrs: { talla: "M" } },
      { name: "Talla L", price: 1490, cost: 600, stock: 0, min: 5, attrs: { talla: "L" } },
    ] },
  { name: "Peine de Madera", cat: "Cepillos y peines", brand: "Demo Natura Sur", desc: "Peine de madera de dientes anchos.",
    variants: [{ name: "1 unidad", price: 2490, cost: 900, stock: 15, min: 3 }] },
];

/** EAN-13 válido en el rango 200-299 (uso interno; nunca coincide con un producto real). */
function testBarcode(n: number): string {
  const body = `200${String(n).padStart(9, "0")}`;
  const sum = [...body].reduce((acc, d, i) => acc + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

await db.transaction(async (tx) => {
  await tx.execute(sql`TRUNCATE
    audit_logs, payment_events, payments, stock_reservations, shipping_rates, order_status_history, order_items, orders,
    cart_items, carts, inventory_movements, product_images, product_variants, products,
    attribute_definitions, categories, brands, addresses, customers, sessions, users
    RESTART IDENTITY CASCADE`);
  await loadReferenceData(tx);

  const [admin] = await tx
    .insert(s.users)
    .values({ email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), role: "SUPER_ADMIN" })
    .returning();

  const catIds = new Map<string, string>();
  for (const [i, [name, parent]] of CATEGORIES.entries()) {
    const [c] = await tx
      .insert(s.categories)
      .values({ name, slug: slugify(name), sortOrder: i, parentId: parent ? catIds.get(parent) : null })
      .returning({ id: s.categories.id });
    catIds.set(name, c!.id);
  }

  const brandIds = new Map<string, string>();
  for (const name of BRANDS) {
    const [b] = await tx
      .insert(s.brands)
      .values({ name, slug: slugify(name), description: `${T}Marca ficticia.` })
      .returning({ id: s.brands.id });
    brandIds.set(name, b!.id);
  }

  await tx.insert(s.attributeDefinitions).values(ATTRIBUTES.map((a, i) => ({ ...a, sortOrder: i })));

  let n = 0;
  for (const [pi, p] of PRODUCTS.entries()) {
    const [product] = await tx
      .insert(s.products)
      .values({
        name: `${p.name} ${p.brand}`,
        slug: slugify(`${p.name} ${p.brand}`),
        description: T + p.desc,
        shortDescription: p.desc,
        categoryId: catIds.get(p.cat)!,
        brandId: brandIds.get(p.brand)!,
        attributes: p.attrs ?? {},
        featured: p.featured ?? false,
      })
      .returning({ id: s.products.id });

    for (const [vi, v] of p.variants.entries()) {
      n++;
      const [variant] = await tx
        .insert(s.productVariants)
        .values({
          productId: product!.id,
          sku: `DEMO-${String(pi + 1).padStart(3, "0")}-${vi + 1}`,
          barcode: testBarcode(n),
          name: v.name,
          price: v.price,
          compareAtPrice: v.compare,
          costPrice: v.cost,
          netContent: v.net?.toString(),
          contentUnit: v.unit ?? "UNIT",
          unitsPerPack: v.pack ?? 1,
          attributes: v.attrs ?? {},
          minimumStock: v.min ?? 0,
          isDefault: vi === 0,
          sortOrder: vi,
        })
        .returning({ id: s.productVariants.id });

      // El stock inicial pasa por la misma puerta que cualquier otro movimiento.
      if (v.stock > 0)
        await applyMovement(tx, { variantId: variant!.id, type: "INITIAL_STOCK", quantity: v.stock, reason: "Stock inicial (datos de prueba)", userId: admin!.id });
    }
  }
  // Tarifas de despacho DE PRUEBA (reemplazar por las reales en /admin/despacho): RM, zona central, resto y zonas extremas.
  const RATES: [string[], number, string][] = [
    [["13"], 2990, "1 a 2 días hábiles"],
    [["05", "06"], 3990, "2 a 3 días hábiles"],
    [["04", "07", "16", "08", "09", "14", "10"], 5990, "3 a 5 días hábiles"],
    [["15", "01", "02", "03", "11", "12"], 7990, "5 a 8 días hábiles"],
  ];
  for (const [codes, cost, eta] of RATES)
    for (const r of await tx.select({ id: s.regions.id }).from(s.regions).where(inArray(s.regions.code, codes)))
      await tx.insert(s.shippingRates).values({ regionId: r.id, cost, eta });

  console.log(`Seed listo: ${PRODUCTS.length} productos, ${n} variantes, tarifas de despacho de prueba. Admin: ${ADMIN_EMAIL}`);
});

// Pedidos de prueba: pasan por el carrito, el checkout y el servicio de pagos (transferencia), así reservan stock y
// crean su intento de pago igual que uno real. El pendiente se cancela solo cuando vence su reserva.
const variantId = async (sku: string) => (await db.select({ id: s.productVariants.id }).from(s.productVariants).where(eq(s.productVariants.sku, sku)))[0]!.id;
const [providencia] = await db.select({ id: s.communes.id }).from(s.communes).where(eq(s.communes.name, "Providencia"));
const demoOrder = async (n: number, lines: [string, number][]) => {
  let cart: string | null = null;
  for (const [sku, quantity] of lines) cart = await addToCart(cart, { variantId: await variantId(sku), quantity });
  const { subtotal } = await getCart(cart);
  const ship = (await quoteShipping(providencia!.id))!;
  return placeOrder(cart!, {
    email: `cliente${n}@demo.local`,
    firstName: "Cliente",
    lastName: `Demo ${n}`,
    phone: "+56900000000",
    rut: null,
    communeId: providencia!.id,
    street: "Calle de Prueba",
    number: String(100 + n),
    apartment: null,
    notes: "[DATO DE PRUEBA]",
    expectedTotal: subtotal + ship.cost,
  }, "transferencia");
};
const [admin] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, ADMIN_EMAIL));
await demoOrder(1, [["DEMO-001-2", 2], ["DEMO-003-1", 3]]);
const cancelled = await demoOrder(2, [["DEMO-011-1", 1]]);
await changeOrderStatus(admin!.id, cancelled.id, { to: "CANCELLED", note: "El cliente desistió (dato de prueba)." });
// Pagado: el admin comprueba la transferencia (mismo flujo que en el panel) → venta y stock descontado.
const paid = await demoOrder(3, [["DEMO-002-1", 1]]);
const [attempt] = await db.select().from(s.payments).where(eq(s.payments.orderId, paid.id));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
await confirmTransfer(admin!.id, attempt!.id, { amount: attempt!.amount, receivedOn: today, bankReference: "DEMO-0001", note: "[DATO DE PRUEBA]", commandId: crypto.randomUUID() });
console.log("Pedidos de prueba: 1 pendiente de pago (transferencia), 1 cancelado, 1 pagado (transferencia confirmada).");

await pool.end();
