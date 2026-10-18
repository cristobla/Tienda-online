import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { addToCart } from "@/modules/cart";
import { listProducts } from "@/modules/catalog/queries";
import { createOrderFromCart, findOrderId, normalizeOrderNumber, orderInputSchema } from "@/modules/orders";
import { makeCommune, makeVariant, resetDb } from "./helpers";

beforeEach(resetDb);

describe("seguimiento de pedido", () => {
  it("normaliza el número y exige número + email del mismo pedido", async () => {
    expect(["1003", "001003", "ord 1003", "ORD-001003", " ord-1003 "].map(normalizeOrderNumber)).toEqual(Array(5).fill("ORD-001003"));
    expect(normalizeOrderNumber("abc")).toBeNull();

    const { communeId } = await makeCommune("SG", 0);
    const v = await makeVariant(5);
    const o = await createOrderFromCart(
      await addToCart(null, { variantId: v.id, quantity: 1 }),
      orderInputSchema.parse({ email: "ana@test.cl", firstName: "Ana", lastName: "P", phone: "912345678", communeId: String(communeId), street: "C", number: "1", expectedTotal: "1000" }),
    );
    const digits = o.orderNumber.replace(/\D/g, "");
    expect(await findOrderId(digits, " ANA@test.cl ")).toBe(o.id);
    expect(await findOrderId(o.orderNumber, "otra@test.cl")).toBeNull();
    expect(await findOrderId("999999", "ana@test.cl")).toBeNull();
  });
});

describe("ofertas", () => {
  it("solo productos cuya variante mostrada tiene precio anterior (la base exige que sea mayor)", async () => {
    const sale = await makeVariant(5);
    const plain = await makeVariant(5);
    await db.update(s.productVariants).set({ compareAtPrice: 1500 }).where(eq(s.productVariants.id, sale.id));
    const categoryIds = (await db.select({ id: s.categories.id }).from(s.categories)).map((c) => c.id);
    await db.update(s.products).set({ active: true });
    const r = await listProducts({ categoryIds, onSale: true });
    expect(r.items.map((p) => p.variantId)).toEqual([sale.id]);
    expect(r.items[0]).toMatchObject({ sku: sale.sku, compareAtPrice: 1500 });
    expect((await listProducts({ categoryIds })).items.map((p) => p.variantId).sort()).toEqual([sale.id, plain.id].sort());
  });
});
