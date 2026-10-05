import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { can } from "@/modules/auth/rbac";
import { addItemSchema, addToCart, getCart, setItemQuantity, setItemSchema } from "@/modules/cart";
import { adjustStock, InsufficientStockError, reserveStock, stockOperationSchema } from "@/modules/inventory";
import { changeOrderStatus, createOrderFromCart, expireOrders, getOrder, listOrders, manualTransitions, type OrderStatus, orderStats } from "@/modules/orders";
import { makeVariant, resetDb } from "./helpers";

let staffId: string;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "ventas@test.cl", passwordHash: "x", role: "SALES" }).returning();
  staffId = u!.id;
});

const stock = async (id: string) => {
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, id));
  return { onHand: v!.stockOnHand, reserved: v!.stockReserved };
};
const qtyOf = async (cartId: string) => Object.fromEntries((await getCart(cartId)).lines.map((l) => [l.variantId, l.quantity]));
const add = (cartId: string | null, variantId: string, quantity = 1) => addToCart(cartId, { variantId, quantity });
/** Carrito con las líneas indicadas. */
const cartWith = async (...lines: [string, number][]) => {
  let id: string | null = null;
  for (const [v, q] of lines) id = await add(id, v, q);
  return id!;
};
const contact = { email: "Cliente@Test.cl", firstName: "Ana", lastName: "Pérez" };
/** Crea el pedido confirmando el total que el cliente ve en el carrito en ese momento. */
const order = async (cartId: string, userId: string | null = null) =>
  createOrderFromCart(cartId, { ...contact, email: contact.email.toLowerCase(), expectedTotal: (await getCart(cartId)).subtotal }, userId);
const setPrice = (variantId: string, price: number) => db.update(s.productVariants).set({ price }).where(eq(s.productVariants.id, variantId));
const damage = (variantId: string, quantity: number) =>
  adjustStock(staffId, variantId, stockOperationSchema.parse({ type: "DAMAGED", quantity: String(quantity), reason: "Prueba" }));
const counts = async () => ({
  orders: await db.$count(s.orders),
  items: await db.$count(s.orderItems),
  customers: await db.$count(s.customers),
  reservations: await db.$count(s.stockReservations),
});
const setStatus = (id: string, status: OrderStatus) => db.update(s.orders).set({ status }).where(eq(s.orders.id, id));
/** Espera (sin adivinar tiempos) a que otra conexión quede bloqueada esperando una fila. */
async function waitForLockWait() {
  for (let i = 0; i < 250; i++) {
    const r = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`);
    if (r.rows[0]!.n > 0) return;
    await new Promise((ok) => setTimeout(ok, 20));
  }
  throw new Error("Ninguna transacción quedó esperando el bloqueo.");
}

describe("carrito", () => {
  it("agrega un producto, suma si se repite y calcula totales con el precio de la base", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(10);
    await setPrice(b.id, 2490);
    const cart = await add(null, a.id, 2);
    expect(await add(cart, a.id, 1)).toBe(cart);
    await add(cart, b.id, 3);
    const c = await getCart(cart);
    expect(c.lines.map((l) => [l.quantity, l.lineTotal])).toEqual([
      [3, 3000],
      [3, 7470],
    ]);
    expect(c).toMatchObject({ subtotal: 10_470, count: 6, ready: true });
  });

  it("el carrito no reserva stock", async () => {
    const v = await makeVariant(5);
    await add(null, v.id, 5);
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
  });

  it("modifica la cantidad y elimina con cantidad 0", async () => {
    const v = await makeVariant(10);
    const cart = await add(null, v.id, 1);
    await setItemQuantity(cart, { variantId: v.id, quantity: 7 });
    expect(await qtyOf(cart)).toEqual({ [v.id]: 7 });
    await setItemQuantity(cart, { variantId: v.id, quantity: 0 });
    expect(await getCart(cart)).toMatchObject({ lines: [], subtotal: 0, count: 0, ready: false });
    await expect(setItemQuantity(cart, { variantId: v.id, quantity: 2 })).rejects.toThrow("ya no está en tu carrito");
  });

  it("producto o variante inexistente, inactivo o en categoría oculta: no se agrega", async () => {
    const v = await makeVariant(10);
    await expect(add(null, crypto.randomUUID())).rejects.toThrow("no existe o ya no está disponible");
    await db.update(s.productVariants).set({ active: false }).where(eq(s.productVariants.id, v.id));
    await expect(add(null, v.id)).rejects.toThrow(UserError);
    await db.update(s.productVariants).set({ active: true }).where(eq(s.productVariants.id, v.id));
    await db.update(s.products).set({ active: false }).where(eq(s.products.id, v.productId));
    await expect(add(null, v.id)).rejects.toThrow(UserError);
    await db.update(s.products).set({ active: true }).where(eq(s.products.id, v.productId));
    await db.update(s.categories).set({ active: false });
    await expect(add(null, v.id)).rejects.toThrow(UserError);
    expect(await db.$count(s.cartItems)).toBe(0);
  });

  it("valida cantidades y variante del formulario", () => {
    const id = crypto.randomUUID();
    for (const quantity of ["0", "-1", "1.5", "abc", "", "100"])
      expect(addItemSchema.safeParse({ variantId: id, quantity }).success, quantity).toBe(false);
    expect(addItemSchema.safeParse({ variantId: "no-es-uuid", quantity: "1" }).success).toBe(false);
    expect(setItemSchema.safeParse({ variantId: id, quantity: "-1" }).success).toBe(false);
    expect(setItemSchema.parse({ variantId: id, quantity: "0" }).quantity).toBe(0);
  });

  it("stock insuficiente: no supera el disponible (descontando lo reservado) ni el máximo por producto", async () => {
    const v = await makeVariant(5);
    const cart = await add(null, v.id, 4);
    await expect(add(cart, v.id, 2)).rejects.toSatisfy(
      (e) => e instanceof InsufficientStockError && e.available === 5 && e.message === "Solo quedan 5 disponibles y ya tienes 4 en tu carrito.",
    );
    expect(await qtyOf(cart)).toEqual({ [v.id]: 4 }); // la suma fallida se revirtió
    await expect(setItemQuantity(cart, { variantId: v.id, quantity: 6 })).rejects.toThrow(InsufficientStockError);
    // Otro cliente reserva 3 al crear su pedido: ahora quedan 2 disponibles.
    await order(await cartWith([v.id, 3]));
    await expect(setItemQuantity(cart, { variantId: v.id, quantity: 5 })).rejects.toSatisfy((e) => e instanceof InsufficientStockError && e.available === 2);
    // Bajar siempre se permite, aunque siga sobre el disponible; la línea queda marcada.
    await setItemQuantity(cart, { variantId: v.id, quantity: 3 });
    expect((await getCart(cart)).lines[0]).toMatchObject({ quantity: 3, problem: "Solo quedan 2" });
    const big = await makeVariant(500);
    await expect(add(null, big.id, 100)).rejects.toThrow("Máximo 99");
  });

  it("cookie de un carrito que ya no existe: se crea uno nuevo", async () => {
    const v = await makeVariant(5);
    const stale = crypto.randomUUID();
    const cart = await add(stale, v.id);
    expect(cart).not.toBe(stale);
    expect(await qtyOf(cart)).toEqual({ [v.id]: 1 });
  });

  it("marca las líneas que dejaron de venderse o quedaron sin stock", async () => {
    const a = await makeVariant(5);
    const b = await makeVariant(5);
    const cart = await cartWith([a.id, 2], [b.id, 1]);
    await db.update(s.productVariants).set({ active: false }).where(eq(s.productVariants.id, a.id));
    await damage(b.id, 5);
    const c = await getCart(cart);
    expect(c.lines.map((l) => l.problem)).toEqual(["Ya no está disponible", "Sin stock"]);
    expect(c.ready).toBe(false);
  });
});

describe("crear pedido", () => {
  it("crea el pedido con snapshot, totales y reservas, y vacía el carrito", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(10);
    await setPrice(b.id, 2490);
    const cart = await cartWith([a.id, 2], [b.id, 3]);
    const o = await order(cart);

    expect(o).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "PENDING", subtotal: 9470, discountTotal: 0, shippingTotal: 0, total: 9470 });
    expect(o).toMatchObject({ email: "cliente@test.cl", customerName: "Ana Pérez" });
    expect(o.orderNumber).toMatch(/^ORD-\d{6}$/);
    const d = (await getOrder(o.id))!;
    expect(d.items.map((i) => ({ sku: i.sku, productName: i.productName, variantName: i.variantName, unitPrice: i.unitPrice, quantity: i.quantity, lineTotal: i.lineTotal }))).toEqual(
      expect.arrayContaining([
        { sku: a.sku, productName: "Prod", variantName: "Único", unitPrice: 1000, quantity: 2, lineTotal: 2000 },
        { sku: b.sku, productName: "Prod", variantName: "Único", unitPrice: 2490, quantity: 3, lineTotal: 7470 },
      ]),
    );
    expect(d.reservations.map((r) => [r.variantId, r.quantity, r.status]).sort()).toEqual(
      [
        [a.id, 2, "ACTIVE"],
        [b.id, 3, "ACTIVE"],
      ].sort(),
    );
    expect(d.history.map((h) => [h.entry.fromStatus, h.entry.toStatus])).toEqual([[null, "PENDING_PAYMENT"]]);
    expect(d.hasAccount).toBe(false);
    expect(await stock(a.id)).toEqual({ onHand: 10, reserved: 2 });
    expect(await stock(b.id)).toEqual({ onHand: 10, reserved: 3 });
    expect(await db.$count(s.inventoryMovements)).toBe(2); // solo los INITIAL_STOCK: reservar no mueve el físico
    expect(await db.$count(s.carts)).toBe(0);
  });

  it("el snapshot no cambia si después cambia el producto", async () => {
    const v = await makeVariant(10);
    const o = await order(await cartWith([v.id, 1]));
    await setPrice(v.id, 5000);
    await db.update(s.products).set({ name: "Otro nombre" }).where(eq(s.products.id, v.productId));
    expect((await getOrder(o.id))!.items[0]).toMatchObject({ productName: "Prod", unitPrice: 1000, lineTotal: 1000 });
  });

  it("precio modificado entre carrito y pedido: no se crea y el carrito queda intacto", async () => {
    const v = await makeVariant(10);
    const cart = await cartWith([v.id, 2]);
    const seen = (await getCart(cart)).subtotal; // 2000
    await setPrice(v.id, 1200);
    await expect(createOrderFromCart(cart, { ...contact, expectedTotal: seen })).rejects.toThrow("Los precios de tu carrito cambiaron");
    expect(await counts()).toEqual({ orders: 0, items: 0, customers: 0, reservations: 0 });
    expect(await qtyOf(cart)).toEqual({ [v.id]: 2 });
    // Al confirmar el total nuevo se crea con el precio actual, nunca con el que envía el navegador.
    expect((await createOrderFromCart(cart, { ...contact, expectedTotal: 2400 })).total).toBe(2400);
  });

  it("stock modificado entre carrito y pedido: todo o nada", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(5);
    const cart = await cartWith([a.id, 2], [b.id, 4]);
    await damage(b.id, 2); // quedan 3, el carrito pide 4
    await expect(order(cart)).rejects.toThrow("Solo quedan 3");
    expect(await counts()).toEqual({ orders: 0, items: 0, customers: 0, reservations: 0 });
    expect(await stock(a.id)).toEqual({ onHand: 10, reserved: 0 });
    expect(await qtyOf(cart)).toEqual({ [a.id]: 2, [b.id]: 4 });
  });

  it("si la reserva falla dentro de la transacción no queda pedido, cliente, ítems ni reservas", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(1);
    const mine = await cartWith([a.id, 1], [b.id, 1]);
    const [c] = await db.insert(s.customers).values({ email: "otro@test.cl", firstName: "O", lastName: "T" }).returning();
    const [other] = await db.insert(s.orders).values({ customerId: c!.id, email: "otro@test.cl", customerName: "O T", subtotal: 1000, total: 1000 }).returning();
    let pending!: Promise<unknown>;
    // Otro pedido reserva la última unidad y aún no confirma: el nuestro lee stock 1, inserta pedido e ítems
    // y queda esperando la fila; cuando el otro confirma, su reserva falla y debe revertirse todo.
    await db.transaction(async (tx) => {
      await reserveStock(tx, other!.id, [{ variantId: b.id, quantity: 1 }]);
      pending = order(mine).catch((e: unknown) => e);
      await waitForLockWait();
    });
    expect(await pending).toBeInstanceOf(InsufficientStockError);
    expect(await counts()).toEqual({ orders: 1, items: 0, customers: 1, reservations: 1 }); // solo los del otro pedido
    expect(await stock(a.id)).toEqual({ onHand: 10, reserved: 0 });
    expect(await stock(b.id)).toEqual({ onHand: 1, reserved: 1 });
    expect(await qtyOf(mine)).toEqual({ [a.id]: 1, [b.id]: 1 });
  });

  it("producto retirado, carrito vacío o inexistente: no se crea", async () => {
    const v = await makeVariant(10);
    const cart = await cartWith([v.id, 1]);
    await db.update(s.products).set({ active: false }).where(eq(s.products.id, v.productId));
    await expect(order(cart)).rejects.toThrow("Ya no está disponible");
    await setItemQuantity(cart, { variantId: v.id, quantity: 0 });
    await expect(order(cart)).rejects.toThrow("Tu carrito está vacío");
    await expect(createOrderFromCart(crypto.randomUUID(), { ...contact, expectedTotal: 0 })).rejects.toThrow("Tu carrito está vacío");
    expect((await counts()).orders).toBe(0);
  });

  it("cliente con cuenta: sus pedidos comparten la ficha de cliente; invitados tienen una por pedido", async () => {
    const v = await makeVariant(10);
    const [u] = await db.insert(s.users).values({ email: "ana@test.cl", passwordHash: "x" }).returning();
    const o1 = await order(await cartWith([v.id, 1]), u!.id);
    const o2 = await order(await cartWith([v.id, 1]), u!.id);
    expect(o1.customerId).toBe(o2.customerId);
    expect((await getOrder(o1.id))!.hasAccount).toBe(true);
    const g1 = await order(await cartWith([v.id, 1]));
    const g2 = await order(await cartWith([v.id, 1]));
    expect(new Set([o1.customerId, g1.customerId, g2.customerId]).size).toBe(3);
  });

  it("listado del panel: cuenta las unidades de cada pedido y filtra por texto y estado", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(10);
    const o = await order(await cartWith([a.id, 2], [b.id, 3]));
    await order(await cartWith([a.id, 1]));
    const list = await listOrders({});
    expect(list.total).toBe(2);
    expect(list.items.find((i) => i.id === o.id)).toMatchObject({ orderNumber: o.orderNumber, items: 5, total: 5000 });
    expect((await listOrders({ q: o.orderNumber.toLowerCase() })).items.map((i) => i.id)).toEqual([o.id]);
    expect((await listOrders({ q: "cliente@test" })).total).toBe(2);
    expect((await listOrders({ status: "CANCELLED" })).total).toBe(0);
    expect(await orderStats()).toEqual({ pending: 2, paid: 0 });
    await setStatus(o.id, "PAID");
    expect(await orderStats()).toEqual({ pending: 1, paid: 1 });
  });

  it("la imagen de la línea del carrito es la del propio producto", async () => {
    const a = await makeVariant(10);
    const b = await makeVariant(10);
    await db.insert(s.productImages).values({ productId: b.productId, url: "/media/b.webp" });
    const lines = (await getCart(await cartWith([a.id, 1], [b.id, 1]))).lines;
    expect(Object.fromEntries(lines.map((l) => [l.variantId, l.imageUrl]))).toEqual({ [a.id]: null, [b.id]: "/media/b.webp" });
  });

  it("la base rechaza totales inconsistentes aunque el código falle", async () => {
    const v = await makeVariant(10);
    const o = await order(await cartWith([v.id, 1]));
    await expect(db.update(s.orders).set({ total: 1 }).where(eq(s.orders.id, o.id))).rejects.toThrow();
    await expect(db.update(s.orderItems).set({ lineTotal: 1 }).where(eq(s.orderItems.orderId, o.id))).rejects.toThrow();
  });
});

describe("estados", () => {
  it("cancelar antes del pago libera la reserva y queda en historial y auditoría", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 3]));
    const row = await changeOrderStatus(staffId, o.id, { to: "CANCELLED", note: "Cliente desistió" });
    expect(row).toMatchObject({ status: "CANCELLED", paymentStatus: "CANCELLED" });
    expect(row.cancelledAt).toBeInstanceOf(Date);
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
    const d = (await getOrder(o.id))!;
    expect(d.reservations[0]!.status).toBe("RELEASED");
    expect(d.history.at(-1)).toMatchObject({ entry: { fromStatus: "PENDING_PAYMENT", toStatus: "CANCELLED", note: "Cliente desistió", changedBy: staffId } });
    const [log] = await db.select().from(s.auditLogs);
    expect(log).toMatchObject({ action: "order.status", entityId: o.id, before: { status: "PENDING_PAYMENT" }, after: { status: "CANCELLED" } });
  });

  it("cancelar exige motivo", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 1]));
    await expect(changeOrderStatus(staffId, o.id, { to: "CANCELLED", note: null })).rejects.toSatisfy((e) => e instanceof UserError && e.field === "note");
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 1 });
  });

  it("rechaza transiciones no permitidas y las que mueven dinero (solo el módulo de pagos)", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 1]));
    const to = (status: OrderStatus, note: string | null = "x") => changeOrderStatus(staffId, o.id, { to: status, note });
    await expect(to("PAID")).rejects.toThrow("módulo de pagos");
    await expect(to("SHIPPED")).rejects.toThrow("no puede pasar");
    expect(manualTransitions(o)).toEqual(["CANCELLED"]);

    // Simula un pedido ya pagado (lo hará la FASE 7): desde aquí el personal avanza el despacho.
    await setStatus(o.id, "PAID");
    await expect(to("CANCELLED")).rejects.toThrow("módulo de pagos");
    await to("PROCESSING", null);
    await to("SHIPPED", null);
    await expect(to("PROCESSING")).rejects.toThrow("no puede pasar");
    await to("DELIVERED", null);
    await expect(to("REFUNDED")).rejects.toThrow("módulo de pagos");
    expect(manualTransitions({ status: "DELIVERED", paymentStatus: "PAID" })).toEqual([]);
    expect((await getOrder(o.id))!.history.map((h) => h.entry.toStatus)).toEqual(["PENDING_PAYMENT", "PROCESSING", "SHIPPED", "DELIVERED"]);
  });

  it("un pedido cancelado no cambia más", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 1]));
    await changeOrderStatus(staffId, o.id, { to: "CANCELLED", note: "x" });
    await expect(changeOrderStatus(staffId, o.id, { to: "CANCELLED", note: "x" })).rejects.toThrow("no puede pasar");
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
  });
});

describe("vencimiento", () => {
  const expire = (orderId: string) =>
    db.update(s.stockReservations).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(s.stockReservations.orderId, orderId));

  it("cancela solo los pedidos impagos con la reserva vencida y es idempotente", async () => {
    const v = await makeVariant(10);
    const old = await order(await cartWith([v.id, 2]));
    const fresh = await order(await cartWith([v.id, 3]));
    await expire(old.id);
    expect(await expireOrders()).toBe(1);
    expect(await expireOrders()).toBe(0);
    const d = (await getOrder(old.id))!;
    expect(d.order).toMatchObject({ status: "CANCELLED", paymentStatus: "EXPIRED" });
    expect(d.history.at(-1)!.entry).toMatchObject({ toStatus: "CANCELLED", changedBy: null, note: expect.stringContaining("Reserva vencida") });
    expect((await getOrder(fresh.id))!.order.status).toBe("PENDING_PAYMENT");
    expect(await stock(v.id)).toEqual({ onHand: 10, reserved: 3 });
  });

  it("una reserva vencida no bloquea un pedido nuevo (verificación al crear)", async () => {
    const v = await makeVariant(1);
    const first = await cartWith([v.id, 1]);
    const second = await cartWith([v.id, 1]); // el carrito no reserva: ambos caben
    const o = await order(first);
    await expire(o.id);
    const o2 = await order(second);
    expect(o2.status).toBe("PENDING_PAYMENT");
    expect((await getOrder(o.id))!.order.status).toBe("CANCELLED");
    expect(await stock(v.id)).toEqual({ onHand: 1, reserved: 1 });
  });

  it("no vence un pedido con un pago en curso", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 1]));
    await db.update(s.orders).set({ paymentStatus: "AUTHORIZED" }).where(eq(s.orders.id, o.id));
    await expire(o.id);
    expect(await expireOrders()).toBe(0);
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 1 });
  });
});

describe("concurrencia", () => {
  it("última unidad y dos clientes a la vez: un pedido; el otro sin rastros y con su carrito", async () => {
    const v = await makeVariant(1);
    const [c1, c2] = [await cartWith([v.id, 1]), await cartWith([v.id, 1])];
    const results = await Promise.allSettled([order(c1), order(c2)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    // Según quién lea primero: falla la reserva atómica (InsufficientStockError) o la validación previa ("Sin stock").
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(UserError) });
    expect(await counts()).toEqual({ orders: 1, items: 1, customers: 1, reservations: 1 });
    expect(await stock(v.id)).toEqual({ onHand: 1, reserved: 1 });
    expect(await db.$count(s.carts)).toBe(1);
  });

  it("doble envío del mismo carrito: un solo pedido", async () => {
    const v = await makeVariant(10);
    const cart = await cartWith([v.id, 2]);
    const results = await Promise.allSettled([order(cart), order(cart), order(cart)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await counts()).orders).toBe(1);
    expect(await stock(v.id)).toEqual({ onHand: 10, reserved: 2 });
  });

  it("agregar al mismo carrito a la vez suma exacto", async () => {
    const v = await makeVariant(50);
    const cart = await add(null, v.id, 1);
    await Promise.all(Array.from({ length: 8 }, () => add(cart, v.id, 1)));
    expect(await qtyOf(cart)).toEqual({ [v.id]: 9 });
  });

  it("cancelar y vencer a la vez libera la reserva una sola vez", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 3]));
    await db.update(s.stockReservations).set({ expiresAt: sql`now() - interval '1 minute'` });
    await Promise.allSettled([changeOrderStatus(staffId, o.id, { to: "CANCELLED", note: "x" }), expireOrders()]);
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
    expect((await getOrder(o.id))!.history.filter((h) => h.entry.toStatus === "CANCELLED")).toHaveLength(1);
  });
});

describe("permisos", () => {
  it("ventas gestiona pedidos; bodega solo los ve; clientes no entran al panel", () => {
    expect(can("SALES", "orders:manage")).toBe(true);
    expect(can("ADMIN", "orders:manage")).toBe(true);
    expect(can("WAREHOUSE", "orders:read")).toBe(true);
    expect(can("WAREHOUSE", "orders:manage")).toBe(false);
    expect(can("CUSTOMER", "orders:read")).toBe(false);
  });

  it("los cambios desde el panel quedan a nombre de quien los hizo", async () => {
    const v = await makeVariant(5);
    const o = await order(await cartWith([v.id, 1]));
    await changeOrderStatus(staffId, o.id, { to: "CANCELLED", note: "x" });
    const [log] = await db.select().from(s.auditLogs);
    expect(log!.userId).toBe(staffId);
  });
});
