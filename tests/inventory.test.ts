import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { pgError, UserError } from "@/lib/form";
import { can } from "@/modules/auth/rbac";
import {
  adjustStock,
  applyMovement,
  InsufficientStockError,
  listInventory,
  listMovements,
  releaseExpiredReservations,
  releaseOrderReservations,
  reserveStock,
  stockOperationSchema,
} from "@/modules/inventory";
import { makeVariant, resetDb } from "./helpers";

let userId: string;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "bodega@test.cl", passwordHash: "x", role: "WAREHOUSE" }).returning();
  userId = u!.id;
});

const stock = async (id: string) => {
  const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.id, id));
  return { onHand: v!.stockOnHand, reserved: v!.stockReserved };
};
/** Suma de los movimientos: debe coincidir siempre con stock_on_hand. */
const ledger = async (id: string) => {
  const [r] = await db
    .select({ sum: sql<number>`coalesce(sum(${s.inventoryMovements.quantity}), 0)::int` })
    .from(s.inventoryMovements)
    .where(eq(s.inventoryMovements.variantId, id));
  return r!.sum;
};
const op = (raw: Record<string, string>) => stockOperationSchema.parse(raw);
let orderSeq = 0;
const newOrder = async () => {
  const email = `c${++orderSeq}@test.cl`;
  const [c] = await db.insert(s.customers).values({ email, firstName: "A", lastName: "B" }).returning();
  const [o] = await db.insert(s.orders).values({ customerId: c!.id, email, customerName: "A B", subtotal: 1000, total: 1000 }).returning();
  return o!.id;
};
const reserve = (orderId: string, items: { variantId: string; quantity: number }[], ttl?: number) =>
  db.transaction((tx) => reserveStock(tx, orderId, items, ttl));

describe("applyMovement", () => {
  it("valida cantidad y signo según el tipo", async () => {
    const v = await makeVariant(5);
    const bad = [
      { type: "PURCHASE", quantity: -1 },
      { type: "SALE", quantity: 1 },
      { type: "DAMAGED", quantity: 2 },
      { type: "PURCHASE", quantity: 0 },
      { type: "PURCHASE", quantity: 1.5 },
      { type: "MANUAL_ADJUSTMENT", quantity: 1 }, // sin motivo
    ] as const;
    for (const m of bad) await expect(db.transaction((tx) => applyMovement(tx, { variantId: v.id, ...m }))).rejects.toThrow();
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
    expect(await ledger(v.id)).toBe(5);
  });

  it("si la transacción falla después del movimiento, no queda ni stock ni movimiento", async () => {
    const v = await makeVariant(5);
    await expect(
      db.transaction(async (tx) => {
        await applyMovement(tx, { variantId: v.id, type: "PURCHASE", quantity: 10 });
        throw new Error("falla posterior");
      }),
    ).rejects.toThrow("falla posterior");
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
    expect(await db.$count(s.inventoryMovements)).toBe(1); // solo el INITIAL_STOCK
  });

  it("el historial es inmutable en la base", async () => {
    const v = await makeVariant(5);
    const [m] = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.variantId, v.id));
    await expect(db.update(s.inventoryMovements).set({ reason: "x" }).where(eq(s.inventoryMovements.id, m!.id))).rejects.toSatisfy(
      (e) => pgError(e).code === "23001",
    );
    await expect(db.delete(s.inventoryMovements).where(eq(s.inventoryMovements.id, m!.id))).rejects.toSatisfy((e) => pgError(e).code === "23001");
  });

  it("borrar un usuario deja sus movimientos sin autor (única modificación permitida)", async () => {
    const v = await makeVariant(0);
    await adjustStock(userId, v.id, op({ type: "PURCHASE", quantity: "3" }));
    await db.delete(s.users).where(eq(s.users.id, userId));
    const [m] = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.variantId, v.id));
    expect(m).toMatchObject({ createdBy: null, quantity: 3 });
  });
});

describe("operaciones del panel", () => {
  it("entrada: suma stock y registra documento y usuario", async () => {
    const v = await makeVariant(2);
    const m = await adjustStock(userId, v.id, op({ type: "PURCHASE", quantity: "10", reference: "Factura 123", reason: "" }));
    expect(m).toMatchObject({ type: "PURCHASE", quantity: 10, previousStock: 2, resultingStock: 12, referenceType: "DOCUMENT", referenceId: "Factura 123", createdBy: userId });
    expect(await stock(v.id)).toEqual({ onHand: 12, reserved: 0 });
    expect(await ledger(v.id)).toBe(12);
  });

  it("salida (merma): resta stock y no toca lo reservado", async () => {
    const v = await makeVariant(10);
    await reserve(await newOrder(), [{ variantId: v.id, quantity: 4 }]);
    const m = await adjustStock(userId, v.id, op({ type: "DAMAGED", quantity: "6", reason: "Envases rotos" }));
    expect(m).toMatchObject({ type: "DAMAGED", quantity: -6, previousStock: 10, resultingStock: 4 });
    expect(await stock(v.id)).toEqual({ onHand: 4, reserved: 4 });
  });

  it("salida mayor al disponible: se rechaza sin movimiento (lo reservado no se puede mermar)", async () => {
    const v = await makeVariant(10);
    await reserve(await newOrder(), [{ variantId: v.id, quantity: 4 }]);
    await expect(adjustStock(userId, v.id, op({ type: "DAMAGED", quantity: "7", reason: "x" }))).rejects.toSatisfy(
      (e) => e instanceof UserError && e.field === "quantity" && e.message.includes("Solo hay 6"),
    );
    expect(await stock(v.id)).toEqual({ onHand: 10, reserved: 4 });
    expect(await ledger(v.id)).toBe(10);
  });

  it("ajuste por conteo: fija el stock contado, en ambos sentidos", async () => {
    const v = await makeVariant(10);
    const down = await adjustStock(userId, v.id, op({ type: "COUNT", counted: "7", expectedStock: "10", reason: "Conteo mensual" }));
    expect(down).toMatchObject({ type: "MANUAL_ADJUSTMENT", quantity: -3, resultingStock: 7, referenceType: "COUNT" });
    const up = await adjustStock(userId, v.id, op({ type: "COUNT", counted: "9", expectedStock: "7", reason: "Apareció una caja" }));
    expect(up).toMatchObject({ quantity: 2, resultingStock: 9 });
    expect(await ledger(v.id)).toBe(9);
  });

  it("ajuste por conteo: rechaza stock desactualizado, sin cambios o bajo lo reservado", async () => {
    const v = await makeVariant(10);
    await reserve(await newOrder(), [{ variantId: v.id, quantity: 3 }]);
    const count = (counted: string, expectedStock = "10") => adjustStock(userId, v.id, op({ type: "COUNT", counted, expectedStock, reason: "x" }));
    await expect(count("8", "9")).rejects.toThrow("El stock cambió");
    await expect(count("10")).rejects.toThrow("no hay nada que ajustar");
    await expect(count("2")).rejects.toThrow("bajo lo reservado");
    expect(await stock(v.id)).toEqual({ onHand: 10, reserved: 3 });
    expect(await db.$count(s.inventoryMovements)).toBe(1);
  });

  it("valida cantidades y motivos del formulario", () => {
    const bad = [
      { type: "PURCHASE", quantity: "0" },
      { type: "PURCHASE", quantity: "-2" },
      { type: "PURCHASE", quantity: "1.5" },
      { type: "PURCHASE", quantity: "abc" },
      { type: "DAMAGED", quantity: "1", reason: " " },
      { type: "COUNT", counted: "-1", expectedStock: "0", reason: "x" },
      { type: "COUNT", counted: "1", reason: "x" },
      { type: "SALE", quantity: "1" },
    ];
    for (const raw of bad) expect(stockOperationSchema.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
  });

  it("solo bodega y administración ajustan; ventas solo consulta", () => {
    expect(can("SALES", "inventory:read")).toBe(true);
    expect(can("SALES", "inventory:adjust")).toBe(false);
    expect(can("WAREHOUSE", "inventory:adjust")).toBe(true);
    expect(can("CUSTOMER", "inventory:read")).toBe(false);
  });
});

describe("reservas", () => {
  it("reservar baja el disponible sin tocar el físico ni crear movimientos", async () => {
    const v = await makeVariant(5);
    const [r] = await reserve(await newOrder(), [{ variantId: v.id, quantity: 2 }]);
    expect(r).toMatchObject({ status: "ACTIVE", quantity: 2 });
    expect(r!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 2 });
    expect(await db.$count(s.inventoryMovements)).toBe(1);
  });

  it("stock insuficiente: todo o nada", async () => {
    const a = await makeVariant(5);
    const b = await makeVariant(1);
    const order = await newOrder();
    await expect(reserve(order, [{ variantId: a.id, quantity: 2 }, { variantId: b.id, quantity: 2 }])).rejects.toSatisfy(
      (e) => e instanceof InsufficientStockError && e.variantId === b.id && e.available === 1,
    );
    expect(await stock(a.id)).toEqual({ onHand: 5, reserved: 0 });
    expect(await db.$count(s.stockReservations)).toBe(0);
    await expect(reserve(order, [{ variantId: a.id, quantity: 0 }])).rejects.toThrow();
  });

  it("liberar devuelve el disponible y es idempotente", async () => {
    const v = await makeVariant(5);
    const order = await newOrder();
    await reserve(order, [{ variantId: v.id, quantity: 3 }]);
    expect(await db.transaction((tx) => releaseOrderReservations(tx, order))).toHaveLength(1);
    expect(await db.transaction((tx) => releaseOrderReservations(tx, order))).toHaveLength(0);
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
    const [r] = await db.select().from(s.stockReservations);
    expect(r!.status).toBe("RELEASED");
  });

  it("libera solo las reservas vencidas", async () => {
    const v = await makeVariant(5);
    await reserve(await newOrder(), [{ variantId: v.id, quantity: 1 }], 0); // vence de inmediato
    await reserve(await newOrder(), [{ variantId: v.id, quantity: 2 }], 30);
    const released = await releaseExpiredReservations();
    expect(released.map((r) => r.quantity)).toEqual([1]);
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 2 });
  });
});

describe("concurrencia", () => {
  it("stock 1 y dos clientes a la vez: exactamente uno reserva (sin sobreventa)", async () => {
    const v = await makeVariant(1);
    const [o1, o2] = [await newOrder(), await newOrder()];
    const results = await Promise.allSettled([reserve(o1, [{ variantId: v.id, quantity: 1 }]), reserve(o2, [{ variantId: v.id, quantity: 1 }])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(InsufficientStockError) });
    expect(await stock(v.id)).toEqual({ onHand: 1, reserved: 1 });
  });

  it("pedidos con las mismas variantes en distinto orden no se bloquean mutuamente", async () => {
    const a = await makeVariant(50);
    const b = await makeVariant(50);
    const orders = await Promise.all(Array.from({ length: 6 }, newOrder));
    await Promise.all(
      orders.map((o, i) =>
        reserve(o, i % 2 ? [{ variantId: a.id, quantity: 1 }, { variantId: b.id, quantity: 1 }] : [{ variantId: b.id, quantity: 1 }, { variantId: a.id, quantity: 1 }]),
      ),
    );
    expect(await stock(a.id)).toEqual({ onHand: 50, reserved: 6 });
    expect(await stock(b.id)).toEqual({ onHand: 50, reserved: 6 });
  });

  it("entradas y salidas simultáneas: el stock final y el historial cuadran exactos", async () => {
    const v = await makeVariant(20);
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        adjustStock(userId, v.id, i % 2 ? op({ type: "PURCHASE", quantity: "5" }) : op({ type: "DAMAGED", quantity: "3", reason: "x" })),
      ),
    );
    expect((await stock(v.id)).onHand).toBe(20 + 4 * 5 - 4 * 3);
    expect(await ledger(v.id)).toBe(28);
    // Cada movimiento parte donde terminó el anterior: nadie leyó un stock viejo.
    const chain = (await listMovements(v.id)).map((r) => r.movement).reverse();
    for (let i = 1; i < chain.length; i++) expect(chain[i]!.previousStock).toBe(chain[i - 1]!.resultingStock);
  });

  it("liberar dos veces a la vez descuenta la reserva una sola vez", async () => {
    const v = await makeVariant(5);
    const order = await newOrder();
    await reserve(order, [{ variantId: v.id, quantity: 3 }]);
    await Promise.all([1, 2].map(() => db.transaction((tx) => releaseOrderReservations(tx, order))));
    expect(await stock(v.id)).toEqual({ onHand: 5, reserved: 0 });
  });
});

describe("consultas", () => {
  it("el listado calcula disponible con lo reservado y filtra por SKU, agotado y bajo mínimo", async () => {
    const a = await makeVariant(5, "AAA-1");
    const b = await makeVariant(2, "BBB-1");
    await db.update(s.productVariants).set({ minimumStock: 3 }).where(eq(s.productVariants.id, b.id));
    await reserve(await newOrder(), [{ variantId: a.id, quantity: 5 }]);
    const skus = async (f: Parameters<typeof listInventory>[0]) => (await listInventory(f)).items.map((i) => i.sku);
    expect((await listInventory({})).items.find((i) => i.id === a.id)).toMatchObject({ onHand: 5, reserved: 5, available: 0 });
    expect(await skus({ q: "bbb" })).toEqual(["BBB-1"]);
    expect(await skus({ stock: "agotado" })).toEqual(["AAA-1"]);
    expect(await skus({ stock: "bajo" })).toEqual(["BBB-1"]);
    expect((await listInventory({})).total).toBe(2);
  });
});
