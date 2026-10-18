/**
 * Clientes (permiso customers:read). Se compra como invitado y cada pedido guarda su copia del contacto, así que un
 * cliente es un email: sus pedidos, lo que ha gastado y sus datos más recientes se arman desde los pedidos.
 */
import { asc, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { SOLD_STATUSES } from "@/modules/orders";

export const CUSTOMERS_PAGE_SIZE = 50;
export const CUSTOMER_SORTS = { recientes: "Compra más reciente", gasto: "Más gasto", pedidos: "Más pedidos" } as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;

const sold = sql.raw(`"orders"."status" IN (${SOLD_STATUSES.map((x) => `'${x}'`).join(", ")})`);
const asDate = (v: unknown) => new Date(v as string);

/**
 * Un cliente por email. La búsqueda mira cualquiera de sus pedidos (nombre, email, teléfono o RUT, con o sin puntos y
 * guion), pero los totales siempre cuentan todos sus pedidos.
 */
export async function listCustomers(f: { q?: string; sort?: CustomerSort; page?: number }) {
  const match: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.replace(/[\\%_]/g, "\\$&")}%`;
    match.push(ilike(s.orders.email, like), sql`f_unaccent(lower("orders"."customer_name")) LIKE f_unaccent(lower(${like}))`);
    const digits = f.q.replace(/\D/g, "");
    if (digits.length >= 4) match.push(sql`regexp_replace(coalesce("orders"."phone", ''), '\\D', '', 'g') LIKE ${`%${digits}%`}`);
    const rut = f.q.replace(/[^0-9kK]/g, "").toUpperCase();
    if (rut.length >= 5) match.push(sql`regexp_replace(coalesce("orders"."rut", ''), '[^0-9K]', '', 'g') LIKE ${`%${rut}%`}`);
  }
  const page = f.page ?? 1;
  const spent = sql`coalesce(sum("orders"."total") FILTER (WHERE ${sold}), 0)`;
  const order = { recientes: [desc(sql`max("orders"."created_at")`)], gasto: [desc(spent)], pedidos: [desc(sql`count(*)`)] }[f.sort ?? "recientes"];
  const rows = await db
    .select({
      email: sql<string>`lower("orders"."email")`,
      // Los datos del pedido más reciente (el cliente pudo corregirlos entre una compra y otra).
      name: sql<string>`(array_agg("orders"."customer_name" ORDER BY "orders"."created_at" DESC))[1]`,
      phone: sql<string | null>`(array_agg("orders"."phone" ORDER BY "orders"."created_at" DESC) FILTER (WHERE "orders"."phone" IS NOT NULL))[1]`,
      rut: sql<string | null>`(array_agg("orders"."rut" ORDER BY "orders"."created_at" DESC) FILTER (WHERE "orders"."rut" IS NOT NULL))[1]`,
      customerId: sql<string>`(array_agg("orders"."customer_id" ORDER BY "orders"."created_at" DESC))[1]`,
      orders: sql<number>`count(*)::int`,
      paidOrders: sql<number>`count(*) FILTER (WHERE ${sold})::int`,
      spent: sql<number>`${spent}::int`,
      lastOrder: sql<Date>`max("orders"."created_at")`.mapWith(asDate),
      matches: sql<number>`count(*) OVER ()::int`,
    })
    .from(s.orders)
    .groupBy(sql`lower("orders"."email")`)
    .having(match.length ? sql`bool_or(${or(...match)})` : undefined)
    .orderBy(...order, asc(sql`lower("orders"."email")`))
    .limit(CUSTOMERS_PAGE_SIZE)
    .offset((page - 1) * CUSTOMERS_PAGE_SIZE);
  return { items: rows, total: rows[0]?.matches ?? 0 };
}

/** Ficha del cliente a partir de cualquiera de sus registros (el id no expone su email en la URL). */
export async function getCustomer(customerId: string) {
  const [c] = await db.select({ email: s.customers.email }).from(s.customers).where(eq(s.customers.id, customerId));
  if (!c) return null;
  const email = c.email.toLowerCase();
  const orders = await db
    .select({
      id: s.orders.id,
      orderNumber: s.orders.orderNumber,
      createdAt: s.orders.createdAt,
      total: s.orders.total,
      status: s.orders.status,
      paymentStatus: s.orders.paymentStatus,
      customerName: s.orders.customerName,
      phone: s.orders.phone,
      rut: s.orders.rut,
      address: s.orders.shippingAddress,
    })
    .from(s.orders)
    .where(sql`lower("orders"."email") = ${email}`)
    .orderBy(desc(s.orders.createdAt));
  if (!orders.length) return null;
  const paid = orders.filter((o) => (SOLD_STATUSES as readonly string[]).includes(o.status));
  const spent = paid.reduce((t, o) => t + o.total, 0);
  const unique = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null))];
  return {
    email,
    name: orders[0]!.customerName,
    names: unique(orders.map((o) => o.customerName)),
    phones: unique(orders.map((o) => o.phone)),
    ruts: unique(orders.map((o) => o.rut)),
    addresses: unique(orders.map((o) => o.address && `${o.address.street} ${o.address.number}${o.address.apartment ? `, ${o.address.apartment}` : ""}, ${o.address.commune}, ${o.address.region}`)),
    orders,
    stats: { orders: orders.length, paid: paid.length, spent, average: paid.length ? Math.round(spent / paid.length) : 0, first: orders.at(-1)!.createdAt },
  };
}
