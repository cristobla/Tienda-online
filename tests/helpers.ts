import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { applyMovement } from "@/modules/inventory";

export async function resetDb() {
  await db.execute(sql`TRUNCATE
    audit_logs, payment_events, payments, stock_reservations, order_status_history, order_items, orders,
    cart_items, carts, inventory_movements, product_images, product_variants, products,
    attribute_definitions, categories, brands, addresses, customers, sessions, users CASCADE`);
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
