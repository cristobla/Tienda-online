import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { addToCart } from "@/modules/cart";
import { changeOrderStatus, createOrderFromCart, orderInputSchema } from "@/modules/orders";
import { applyCoupon, couponSchema, discountFor, saveCoupon } from "@/modules/promotions";
import { readSettings, saveFreeShipping, saveSettings, settingsSchema } from "@/modules/settings";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;
let communeId: number;
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
  ({ communeId } = await makeCommune("PR", 3000));
});

const coupon = (over: Record<string, string> = {}) =>
  saveCoupon(adminId, null, couponSchema.parse({ code: "bienvenida 10", kind: "PERCENT", value: "10", active: "on", ...over }));
const order = async (variantId: string, qty: number, expectedTotal: number, over: Record<string, string> = {}) =>
  createOrderFromCart(
    await addToCart(null, { variantId, quantity: qty }),
    orderInputSchema.parse({
      email: "ana@test.cl",
      firstName: "Ana",
      lastName: "Pérez",
      phone: "912345678",
      communeId: String(communeId),
      street: "Calle",
      number: "1",
      couponCode: "BIENVENIDA10",
      expectedTotal: String(expectedTotal),
      ...over,
    }),
  );
const couponError = (msg: string) => (e: unknown) => e instanceof UserError && e.field === "couponCode" && e.message.includes(msg);

describe("cupones", () => {
  it("normaliza el código, valida el formulario y calcula en pesos enteros", () => {
    expect(couponSchema.parse({ code: " hola mundo ", kind: "FIXED", value: "500" }).code).toBe("HOLAMUNDO");
    const bad = couponSchema.safeParse({ code: "ñu", kind: "PERCENT", value: "95", startsOn: "2026-10-10", endsOn: "2026-10-01" });
    expect(Object.keys(bad.error!.flatten().fieldErrors).sort()).toEqual(["code", "endsOn", "value"]);
    expect(discountFor({ kind: "PERCENT", value: 15 }, 999)).toBe(149); // hacia abajo
    expect(discountFor({ kind: "FIXED", value: 5000 }, 3000)).toBe(3000); // nunca más que los productos
  });

  it("el pedido guarda descuento y código; el total lo recalcula el servidor", async () => {
    await coupon();
    const v = await makeVariant(10);
    // 2 × 1000 = 2000 − 10 % = 1800 + despacho 3000
    await expect(order(v.id, 2, 5000)).rejects.toThrow("El total cambió");
    const o = await order(v.id, 2, 4800);
    expect(o).toMatchObject({ subtotal: 2000, discountTotal: 200, shippingTotal: 3000, total: 4800, couponCode: "BIENVENIDA10" });
  });

  it("vigencia, mínimo, máximo de usos, uno por cliente y pedidos cancelados que devuelven su uso", async () => {
    const v = await makeVariant(50);
    await coupon({ code: "FUTURO", startsOn: "2999-01-01" });
    await coupon({ code: "PASADO", endsOn: "2000-01-01" });
    await coupon({ code: "PAUSADO", active: "" });
    for (const code of ["FUTURO", "PASADO", "PAUSADO", "NOEXISTE"])
      await expect(applyCoupon(db, code, { subtotal: 5000, email: null })).rejects.toSatisfy(couponError("no está vigente"));

    await coupon({ code: "MINIMO", kind: "FIXED", value: "500", minSubtotal: "3000" });
    await expect(applyCoupon(db, "minimo", { subtotal: 2999, email: null })).rejects.toSatisfy(couponError("desde $3.000"));
    expect((await applyCoupon(db, "minimo", { subtotal: 3000, email: null })).discount).toBe(500);

    await coupon({ code: "DOS", kind: "FIXED", value: "100", maxUses: "2" });
    const a = await order(v.id, 1, 3900, { couponCode: "DOS", email: "a@test.cl" });
    await order(v.id, 1, 3900, { couponCode: "DOS", email: "b@test.cl" });
    await expect(order(v.id, 1, 3900, { couponCode: "DOS", email: "c@test.cl" })).rejects.toSatisfy(couponError("agotó"));
    await changeOrderStatus(adminId, a.id, { to: "CANCELLED", note: "cliente desistió" });
    expect((await order(v.id, 1, 3900, { couponCode: "DOS", email: "c@test.cl" })).couponCode).toBe("DOS");

    await coupon({ code: "UNAVEZ", kind: "FIXED", value: "100", oncePerEmail: "on" });
    await order(v.id, 1, 3900, { couponCode: "UNAVEZ", email: "d@test.cl" });
    await expect(order(v.id, 1, 3900, { couponCode: "unavez", email: " D@Test.cl " })).rejects.toSatisfy(couponError("Ya usaste"));
  });

  it("dos pedidos a la vez con el último uso: solo uno lo obtiene", async () => {
    await coupon({ code: "ULTIMO", kind: "FIXED", value: "100", maxUses: "1" });
    const v = await makeVariant(10);
    const results = await Promise.allSettled([
      order(v.id, 1, 3900, { couponCode: "ULTIMO", email: "x@test.cl" }),
      order(v.id, 1, 3900, { couponCode: "ULTIMO", email: "y@test.cl" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.$count(s.orders, eq(s.orders.couponCode, "ULTIMO"))).toBe(1);
  });

  it("cambios auditados", async () => {
    const c = await coupon();
    await saveCoupon(adminId, c.id, couponSchema.parse({ code: c.code, kind: "PERCENT", value: "20", active: "on" }));
    const logs = await db.select({ action: s.auditLogs.action }).from(s.auditLogs).where(eq(s.auditLogs.entityId, c.id));
    expect(logs.map((l) => l.action)).toEqual(["coupon.create", "coupon.update"]);
  });
});

describe("despacho gratis", () => {
  it("desde el monto de productos ya descontados; guardar los datos de la tienda no lo borra", async () => {
    await saveFreeShipping(adminId, 2000);
    const v = await makeVariant(10);
    expect((await order(v.id, 2, 2000, { couponCode: "" })).shippingTotal).toBe(0); // 2000 ≥ 2000
    await coupon();
    // 2000 − 10 % = 1800 < 2000: se cobra el despacho.
    expect((await order(v.id, 2, 4800)).shippingTotal).toBe(3000);

    await saveSettings(adminId, settingsSchema.parse({ name: "Otra", description: "Y" }));
    expect(await readSettings()).toMatchObject({ name: "Otra", freeShippingFrom: 2000 });
    await saveFreeShipping(adminId, null);
    expect((await readSettings()).freeShippingFrom).toBeNull();
  });
});
