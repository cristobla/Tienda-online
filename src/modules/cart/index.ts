/**
 * Carrito en servidor. Guarda solo variante + cantidad: precio, nombre y stock se leen siempre de la variante,
 * así ningún total depende de lo que envía el navegador.
 * El carrito NO reserva stock: valida el disponible al agregar y el pedido reserva al crearse (modules/orders).
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction, type Tx } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { field, UserError } from "@/lib/form";
import { loadCategories } from "@/modules/categories/queries";
import { InsufficientStockError } from "@/modules/inventory";

export const CART_COOKIE = "cart";
export const MAX_ITEM_QTY = 99;

export const addItemSchema = z.object({ variantId: z.uuid("Producto inválido"), quantity: field.int(1, MAX_ITEM_QTY) });
/** Cantidad 0 = quitar del carrito. */
export const setItemSchema = z.object({ variantId: z.uuid("Producto inválido"), quantity: field.int(0, MAX_ITEM_QTY) });

const v = s.productVariants;
const p = s.products;
const available = sql<number>`${v.stockOnHand} - ${v.stockReserved}`;
/** Vendible = lo mismo que muestra el catálogo: variante y producto activos, en una categoría visible. */
const sellable = async () =>
  sql<boolean>`(${v.active} AND ${p.active} AND ${p.categoryId} = ANY(${sql.param((await loadCategories()).visibleIds)}::uuid[]))`;

/** Líneas del carrito con precio y stock actuales. También las usa el pedido, dentro de su transacción. */
export async function cartLines(tx: Tx, cartId: string) {
  const rows = await tx
    .select({
      variantId: v.id,
      quantity: s.cartItems.quantity,
      sku: v.sku,
      variantName: v.name,
      price: v.price,
      productName: p.name,
      slug: p.slug,
      brandName: s.brands.name,
      imageUrl: sql<string | null>`(SELECT i.url FROM product_images i WHERE i.product_id = "products"."id" ORDER BY i.sort_order LIMIT 1)`,
      available,
      sellable: await sellable(),
    })
    .from(s.cartItems)
    .innerJoin(v, eq(v.id, s.cartItems.variantId))
    .innerJoin(p, eq(p.id, v.productId))
    .leftJoin(s.brands, eq(s.brands.id, p.brandId))
    .where(eq(s.cartItems.cartId, cartId))
    .orderBy(asc(s.cartItems.createdAt), asc(s.cartItems.id));
  return rows.map((r) => ({
    ...r,
    lineTotal: r.price * r.quantity,
    problem: !r.sellable ? "Ya no está disponible" : r.available < r.quantity ? (r.available > 0 ? `Solo quedan ${r.available}` : "Sin stock") : null,
  }));
}
export type CartLine = Awaited<ReturnType<typeof cartLines>>[number];

export async function getCart(cartId: string | null) {
  const lines = cartId ? await cartLines(db, cartId) : [];
  return {
    lines,
    subtotal: lines.reduce((t, l) => t + l.lineTotal, 0),
    count: lines.reduce((n, l) => n + l.quantity, 0),
    /** Se puede pedir: hay líneas y ninguna tiene problemas de stock o disponibilidad. */
    ready: lines.length > 0 && lines.every((l) => !l.problem),
  };
}

export async function cartItemCount(cartId: string | null) {
  if (!cartId) return 0;
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${s.cartItems.quantity}), 0)::int` })
    .from(s.cartItems)
    .where(eq(s.cartItems.cartId, cartId));
  return r!.n;
}

/**
 * Bloquea el carrito y marca su última actividad. Todas las escrituras de un carrito (y la creación del pedido)
 * pasan por este bloqueo, así nunca se cruzan. null si no existe (cookie vieja o ya convertido en pedido).
 */
async function lockCart(tx: Transaction, cartId: string | null) {
  if (!cartId) return null;
  const [c] = await tx.update(s.carts).set({ updatedAt: new Date() }).where(eq(s.carts.id, cartId)).returning({ id: s.carts.id });
  return c?.id ?? null;
}

async function sellableStock(tx: Transaction, variantId: string) {
  const [row] = await tx
    .select({ available, sellable: await sellable() })
    .from(v)
    .innerJoin(p, eq(p.id, v.productId))
    .where(eq(v.id, variantId));
  if (!row?.sellable) throw new UserError("Este producto no existe o ya no está disponible.");
  return row.available;
}

/** Agrega (o suma a lo que ya había). Devuelve el id del carrito: uno nuevo si no existía. */
export async function addToCart(cartId: string | null, item: z.infer<typeof addItemSchema>) {
  return db.transaction(async (tx) => {
    const id = (await lockCart(tx, cartId)) ?? (await tx.insert(s.carts).values({}).returning({ id: s.carts.id }))[0]!.id;
    const stock = await sellableStock(tx, item.variantId);
    const [row] = await tx
      .insert(s.cartItems)
      .values({ cartId: id, variantId: item.variantId, quantity: item.quantity })
      .onConflictDoUpdate({
        target: [s.cartItems.cartId, s.cartItems.variantId],
        set: { quantity: sql`${s.cartItems.quantity} + excluded.quantity`, updatedAt: new Date() },
      })
      .returning({ quantity: s.cartItems.quantity });
    // Si la suma no cabe, el throw revierte la transacción: el carrito queda como estaba.
    if (row!.quantity > MAX_ITEM_QTY) throw new UserError(`Máximo ${MAX_ITEM_QTY} unidades por producto.`);
    if (row!.quantity > stock) {
      const e = new InsufficientStockError(item.variantId, stock);
      const inCart = row!.quantity - item.quantity;
      if (inCart > 0) e.message = `Solo quedan ${stock} disponibles y ya tienes ${inCart} en tu carrito.`;
      throw e;
    }
    return id;
  });
}

/** Fija la cantidad de una línea; 0 la quita. Bajar siempre se permite; subir exige stock disponible. */
export async function setItemQuantity(cartId: string | null, item: z.infer<typeof setItemSchema>) {
  await db.transaction(async (tx) => {
    const id = await lockCart(tx, cartId);
    if (!id && item.quantity === 0) return; // quitar de un carrito que ya no existe: nada que hacer
    if (!id) throw new UserError("Ese producto ya no está en tu carrito.");
    const where = and(eq(s.cartItems.cartId, id), eq(s.cartItems.variantId, item.variantId));
    if (item.quantity === 0) return void (await tx.delete(s.cartItems).where(where));
    const [current] = await tx.select({ quantity: s.cartItems.quantity }).from(s.cartItems).where(where);
    if (!current) throw new UserError("Ese producto ya no está en tu carrito.");
    if (item.quantity > current.quantity) {
      const stock = await sellableStock(tx, item.variantId);
      if (item.quantity > stock) throw new InsufficientStockError(item.variantId, stock);
    }
    await tx.update(s.cartItems).set({ quantity: item.quantity }).where(where);
  });
}

// ── Cookie del carrito. Solo en Server Components, Server Actions y Route Handlers. ──

/** Id del carrito del navegador (un UUID aleatorio: no se puede adivinar el de otro). */
export async function currentCartId(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const value = (await cookies()).get(CART_COOKIE)?.value;
  return z.uuid().safeParse(value).success ? value! : null;
}

export async function setCartCookie(cartId: string) {
  const { cookies } = await import("next/headers");
  (await cookies()).set(CART_COOKIE, cartId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86_400,
  });
}
