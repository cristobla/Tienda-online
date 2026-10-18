import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { DEFAULT_SETTINGS } from "@/lib/site";
import { addToCart } from "@/modules/cart";
import { variantsForExport } from "@/modules/catalog/admin";
import { clearErrors, listErrors, recentErrorCount, recordError } from "@/modules/errors";
import { renderEmail } from "@/modules/mail";
import { changeOrderStatus, createOrderFromCart, orderInputSchema } from "@/modules/orders";
import { saveSettings, settingsSchema } from "@/modules/settings";
import { makeCommune, makeVariant, resetDb } from "./helpers";

let adminId: string;
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
});

describe("reseña en Google al entregar", () => {
  it("solo con el enlace configurado; el correo lleva el enlace", async () => {
    expect(settingsSchema.safeParse({ name: "X", description: "Y", reviewUrl: "https://evil.com/r" }).success).toBe(false);
    const { communeId } = await makeCommune("RS", 0);
    const v = await makeVariant(10);
    const placeAndDeliver = async () => {
      const o = await createOrderFromCart(
        await addToCart(null, { variantId: v.id, quantity: 1 }),
        orderInputSchema.parse({ email: "ana@test.cl", firstName: "Ana", lastName: "P", phone: "912345678", communeId: String(communeId), street: "C", number: "1", expectedTotal: "1000" }),
      );
      // Atajo: el pedido ya pagado y despachado (el pago real se prueba en payments.test.ts); el panel lo entrega.
      await db.update(s.orders).set({ status: "SHIPPED", paymentStatus: "PAID", paidAt: new Date() }).where(eq(s.orders.id, o.id));
      await changeOrderStatus(adminId, o.id, { to: "DELIVERED", note: null });
      return o;
    };
    const a = await placeAndDeliver();
    expect(await db.$count(s.emailOutbox, eq(s.emailOutbox.key, `order.delivered:${a.id}`))).toBe(0);

    await saveSettings(adminId, { ...DEFAULT_SETTINGS, reviewUrl: "https://g.page/r/abc/review" });
    const b = await placeAndDeliver();
    expect(await db.$count(s.emailOutbox, eq(s.emailOutbox.key, `order.delivered:${b.id}`))).toBe(1);
    expect((await renderEmail(db, "order.delivered", b.id))?.text).toContain("https://g.page/r/abc/review");
  });
});

describe("registro de errores", () => {
  it("agrupa el mismo error aunque cambien ids y números, y no falla nunca", async () => {
    await recordError(new Error("Pedido 0f8c2a3e-1111-4222-8333-944455556666 no encontrado (intento 3)"), { route: "/pedido/[id]", method: "GET" });
    await recordError(new Error("Pedido 1a2b3c4d-1111-4222-8333-944455556666 no encontrado (intento 7)"), { route: "/pedido/[id]", method: "GET" });
    await recordError(new Error("Otra cosa"), { route: "/checkout", method: "POST" });
    await recordError("texto suelto", { route: "tareas" });
    const rows = await listErrors();
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.route === "/pedido/[id]")?.count).toBe(2);
    expect(await recentErrorCount()).toBe(3);
    // Un valor raro no lanza.
    await expect(recordError(null, { route: "x".repeat(500) })).resolves.toBeUndefined();

    await clearErrors(adminId);
    expect(await listErrors()).toHaveLength(0);
    expect(await db.$count(s.auditLogs, eq(s.auditLogs.action, "errors.clear"))).toBe(1);
  });
});

describe("exportar productos", () => {
  it("una fila por SKU con disponible = bodega − reservado y enlace a la ficha", async () => {
    const v = await makeVariant(7, "EXP-1");
    await db.update(s.productVariants).set({ stockReserved: 2, minimumStock: 3 }).where(eq(s.productVariants.id, v.id));
    const [row] = await variantsForExport("https://tienda.cl");
    expect(row).toEqual(["EXP-1", null, "Prod", "Único", null, "Test", 1000, null, 7, 2, 5, 3, "Sí", "Sí", 0, "https://tienda.cl/producto/prod-EXP-1"]);
  });
});
