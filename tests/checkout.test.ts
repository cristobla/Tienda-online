import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { addToCart, getCart } from "@/modules/cart";
import { createOrderFromCart, getOrder, orderInputSchema } from "@/modules/orders";
import { listDeliveryCommunes, listShippingRates, parseShippingForm, quoteShipping, saveShippingRates } from "@/modules/shipping";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
});

/** Formulario del checkout tal como llega del navegador (todo string). */
const form = (communeId: number, expectedTotal: number, over: Record<string, string> = {}) => ({
  email: " Ana@Test.CL ",
  firstName: "Ana",
  lastName: "Pérez",
  phone: "9 1234 5678",
  rut: "12.345.678-5",
  communeId: String(communeId),
  street: "Av. Siempre Viva",
  number: "742",
  apartment: "",
  notes: "Dejar en conserjería",
  expectedTotal: String(expectedTotal),
  ...over,
});
const cartOf = async (variantId: string, quantity: number) => addToCart(null, { variantId, quantity });

describe("checkout", () => {
  it("suma el despacho de la región, guarda la dirección como copia y el contacto normalizado", async () => {
    const { communeId } = await makeCommune("T1", 3990);
    const v = await makeVariant(10);
    const cart = await cartOf(v.id, 2); // 2000
    const o = await createOrderFromCart(cart, orderInputSchema.parse(form(communeId, 5990)));
    expect(o).toMatchObject({ subtotal: 2000, shippingTotal: 3990, total: 5990, phone: "+56912345678", rut: "12345678-5", email: "ana@test.cl", shippingCommuneId: communeId });
    expect(o.shippingAddress).toMatchObject({ recipientName: "Ana Pérez", street: "Av. Siempre Viva", number: "742", apartment: null, commune: "Comuna T1", region: "Región T1", notes: "Dejar en conserjería" });
    const [c] = await db.select().from(s.customers).where(eq(s.customers.id, o.customerId));
    expect(c).toMatchObject({ phone: "+56912345678", rut: "12345678-5" });
    // La copia no cambia si después se renombra la comuna.
    await db.update(s.communes).set({ name: "Otra" }).where(eq(s.communes.id, communeId));
    expect((await getOrder(o.id))!.order.shippingAddress?.commune).toBe("Comuna T1");
  });

  it("comuna sin despacho o inexistente: no se crea y el carrito queda intacto", async () => {
    const { communeId } = await makeCommune("T2", null);
    const v = await makeVariant(10);
    const cart = await cartOf(v.id, 1);
    for (const id of [communeId, 999_999])
      await expect(createOrderFromCart(cart, orderInputSchema.parse(form(id, 1000)))).rejects.toSatisfy(
        (e) => e instanceof UserError && e.field === "communeId",
      );
    expect(await db.$count(s.orders)).toBe(0);
    expect((await getCart(cart)).count).toBe(1);
  });

  it("si la tarifa cambia entre el resumen y la confirmación, no se crea", async () => {
    const { communeId, regionId } = await makeCommune("T3", 2990);
    const v = await makeVariant(10);
    const cart = await cartOf(v.id, 1);
    const seen = 1000 + 2990;
    await db.update(s.shippingRates).set({ cost: 4990 }).where(eq(s.shippingRates.regionId, regionId));
    await expect(createOrderFromCart(cart, orderInputSchema.parse(form(communeId, seen)))).rejects.toThrow("El total cambió");
    expect((await createOrderFromCart(cart, orderInputSchema.parse(form(communeId, 5990)))).total).toBe(5990);
  });

  it("valida el formulario: teléfono, RUT, dirección, email y comuna", () => {
    const bad: Record<string, string>[] = [
      { phone: "" },
      { phone: "123" },
      { rut: "12.345.678-9" },
      { street: " " },
      { number: "" },
      { email: "no-es-email" },
      { communeId: "x" },
      { firstName: "" },
    ];
    for (const over of bad) expect(orderInputSchema.safeParse(form(1, 0, over)).success, JSON.stringify(over)).toBe(false);
    expect(orderInputSchema.parse(form(1, 0, { rut: "" })).rut).toBeNull(); // el RUT es opcional
  });
});

describe("tarifas de despacho", () => {
  it("se guardan desde el formulario del panel (vacío = sin despacho), con auditoría", async () => {
    const a = await makeCommune("T4", null);
    const b = await makeCommune("T5", 1990);
    const ids = [a.regionId, b.regionId];
    expect(parseShippingForm({ [`cost_${a.regionId}`]: "-1" }, ids).errors).toHaveProperty(`cost_${a.regionId}`);
    const { rates, errors } = parseShippingForm({ [`cost_${a.regionId}`]: "4990", [`eta_${a.regionId}`]: "3 a 5 días", [`cost_${b.regionId}`]: "" }, ids);
    expect(errors).toEqual({});
    await saveShippingRates(adminId, rates);

    expect(await quoteShipping(a.communeId)).toMatchObject({ cost: 4990, eta: "3 a 5 días" });
    expect(await quoteShipping(b.communeId)).toBeNull();
    const regions = (await listShippingRates()).filter((r) => ids.includes(r.regionId));
    expect(regions.map((r) => r.cost)).toEqual([4990, null]);
    expect((await listDeliveryCommunes()).map((g) => g.region)).toEqual(["Región T4"]);
    const [log] = await db.select().from(s.auditLogs);
    expect(log).toMatchObject({ action: "shipping.update", userId: adminId });
  });
});
