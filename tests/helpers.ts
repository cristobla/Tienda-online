import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { applyMovement } from "@/modules/inventory";

export async function resetDb() {
  await db.execute(sql`TRUNCATE
    audit_logs, payment_events, payments, stock_reservations, shipping_rates, order_status_history, order_items, orders,
    cart_items, carts, inventory_movements, product_images, product_variants, products,
    attribute_definitions, categories, brands, addresses, customers, sessions, users, payment_methods CASCADE`);
}

/** Crea categoría + producto + una variante con el stock indicado (como movimiento INITIAL_STOCK). */
export async function makeVariant(stock = 10, sku = `T-${crypto.randomUUID().slice(0, 8)}`) {
  const [cat] = await db.insert(s.categories).values({ name: "Test", slug: `test-${sku}` }).returning();
  const [product] = await db.insert(s.products).values({ name: "Prod", slug: `prod-${sku}`, categoryId: cat!.id }).returning();
  const [variant] = await db
    .insert(s.productVariants)
    .values({ productId: product!.id, sku, name: "Único", price: 1000, isDefault: true })
    .returning();
  if (stock > 0) await db.transaction((tx) => applyMovement(tx, { variantId: variant!.id, type: "INITIAL_STOCK", quantity: stock }));
  return { ...variant!, stockOnHand: stock };
}

/** Región + comuna de prueba (las tablas de referencia no se vacían entre tests), con tarifa de despacho (null = sin despacho). */
export async function makeCommune(code: string, cost: number | null = 0) {
  const name = `Región ${code}`;
  const [r] = await db.insert(s.regions).values({ code, name, sortOrder: 99 }).onConflictDoUpdate({ target: s.regions.code, set: { name } }).returning();
  const [c] = await db
    .insert(s.communes)
    .values({ regionId: r!.id, name: `Comuna ${code}` })
    .onConflictDoUpdate({ target: [s.communes.regionId, s.communes.name], set: { name: `Comuna ${code}` } })
    .returning();
  if (cost !== null) await db.insert(s.shippingRates).values({ regionId: r!.id, cost, eta: "2 a 4 días hábiles" });
  return { regionId: r!.id, communeId: c!.id };
}
