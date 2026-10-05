import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { makeVariant, resetDb } from "./helpers";

/** Garantías que la base de datos impone aunque el código de la aplicación falle. */
describe("restricciones de base de datos", () => {
  beforeEach(resetDb);

  it("el stock físico nunca queda negativo", async () => {
    const v = await makeVariant(1);
    await expect(
      db.update(s.productVariants).set({ stockOnHand: sql`stock_on_hand - 2` }).where(eq(s.productVariants.id, v.id)),
    ).rejects.toThrow();
  });

  it("no se puede reservar más que el stock físico", async () => {
    const v = await makeVariant(2);
    await expect(db.update(s.productVariants).set({ stockReserved: 3 }).where(eq(s.productVariants.id, v.id))).rejects.toThrow();
  });

  it("el movimiento de inventario debe cuadrar", async () => {
    const v = await makeVariant(5);
    await expect(
      db.insert(s.inventoryMovements).values({ variantId: v.id, type: "MANUAL_ADJUSTMENT", quantity: 3, previousStock: 5, resultingStock: 9 }),
    ).rejects.toThrow();
  });

  it("solo una variante por defecto por producto", async () => {
    const v = await makeVariant(1);
    await expect(
      db.insert(s.productVariants).values({ productId: v.productId, sku: "OTRA", name: "x", price: 1, isDefault: true }),
    ).rejects.toThrow();
  });

  it("el precio anterior debe ser mayor al precio", async () => {
    const v = await makeVariant(1);
    await expect(db.update(s.productVariants).set({ compareAtPrice: 1000 }).where(eq(s.productVariants.id, v.id))).rejects.toThrow();
  });

  it("los números de pedido son correlativos y legibles", async () => {
    const [c] = await db.insert(s.customers).values({ email: "a@b.cl", firstName: "A", lastName: "B" }).returning();
    const mk = () => db.insert(s.orders).values({ customerId: c!.id, email: "a@b.cl", customerName: "A B", subtotal: 1000, total: 1000 }).returning();
    const [[o1], [o2]] = await Promise.all([mk(), mk()]);
    expect(o1!.orderNumber).toMatch(/^ORD-\d{6}$/);
    expect(o1!.orderNumber).not.toBe(o2!.orderNumber);
  });

  it("el total del pedido debe cuadrar", async () => {
    const [c] = await db.insert(s.customers).values({ email: "a@b.cl", firstName: "A", lastName: "B" }).returning();
    await expect(
      db.insert(s.orders).values({ customerId: c!.id, email: "a@b.cl", customerName: "A B", subtotal: 1000, shippingTotal: 500, total: 1000 }),
    ).rejects.toThrow();
  });
});
