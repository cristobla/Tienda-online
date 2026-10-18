/**
 * Reportes de ventas (permiso reports:read). Una venta es un pedido pagado (pagado, en preparación, despachado o
 * entregado) y se cuenta en la fecha de su pago, en hora de Chile. Lo anulado o devuelto después de pagar sale de
 * las ventas y se informa aparte. Montos en CLP con IVA incluido; el neto se calcula por pedido (como cada boleta).
 */
import { and, asc, desc, eq, inArray, isNotNull, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as s from "@/db/schema";
import { netFromGross } from "@/modules/chile";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, SOLD_STATUSES } from "@/modules/orders";
import { getProvider } from "@/modules/payments";

const TZ = "America/Santiago";

/** Rango de fechas de Chile, ambos días incluidos (YYYY-MM-DD). */
export type ReportRange = { from: string; to: string; group: "dia" | "mes" };

/** "Hoy" en Chile como YYYY-MM-DD. */
export const chileDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** Suma días a una fecha YYYY-MM-DD (calendario, sin zona horaria). */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const day = z.preprocess(one, z.iso.date().optional()).catch(undefined);

/** Parámetros de la URL (?desde=&hasta=&agrupar=). Por omisión, los últimos 30 días; más de 2 meses se agrupa por mes. */
export function parseReportRange(sp: Record<string, unknown>, today = chileDate()): ReportRange {
  const p = z.object({ desde: day, hasta: day, agrupar: z.preprocess(one, z.enum(["dia", "mes"]).optional()).catch(undefined) }).parse(sp);
  let to = p.hasta ?? today;
  let from = p.desde ?? addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -3660)) from = addDays(to, -3660); // a lo más 10 años
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  return { from, to, group: p.agrupar ?? (days > 62 ? "mes" : "dia") };
}

/** Momento (timestamptz) dentro del rango: desde las 00:00 del primer día hasta antes de las 00:00 del día siguiente al último, hora de Chile. */
const within = (col: SQL, r: ReportRange) =>
  sql`${col} >= (${r.from}::date)::timestamp AT TIME ZONE ${TZ} AND ${col} < ((${r.to}::date + 1)::timestamp AT TIME ZONE ${TZ})`;

const soldIn = (r: ReportRange) => and(inArray(s.orders.status, [...SOLD_STATUSES]), within(sql`"orders"."paid_at"`, r));

export async function salesSummary(r: ReportRange) {
  const [[sales], [items], [reversed]] = await Promise.all([
    db
      .select({
        orders: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum("orders"."total"), 0)::int`,
        shipping: sql<number>`coalesce(sum("orders"."shipping_total"), 0)::int`,
        // Neto por pedido, como cada boleta: el IVA es la diferencia.
        net: sql<number>`coalesce(sum(round("orders"."total" / 1.19)), 0)::int`,
      })
      .from(s.orders)
      .where(soldIn(r)),
    db
      .select({ units: sql<number>`coalesce(sum("order_items"."quantity"), 0)::int` })
      .from(s.orderItems)
      .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
      .where(soldIn(r)),
    db
      .select({ orders: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum("orders"."total"), 0)::int` })
      .from(s.orders)
      .where(and(inArray(s.orders.status, ["CANCELLED", "REFUNDED"]), isNotNull(s.orders.paidAt), within(sql`"orders"."cancelled_at"`, r))),
  ]);
  return {
    ...sales!,
    iva: sales!.total - sales!.net,
    average: sales!.orders ? Math.round(sales!.total / sales!.orders) : 0,
    units: items!.units,
    reversed: reversed!,
  };
}

/** Ventas por día o por mes, con los períodos sin ventas en cero (para el gráfico). */
export async function salesByPeriod(r: ReportRange) {
  const unit = sql.raw(r.group === "mes" ? "'month'" : "'day'"); // literal fijo: no viene del usuario
  const rows = await db
    .select({
      period: sql<string>`to_char(date_trunc(${unit}, "orders"."paid_at" AT TIME ZONE ${TZ}), 'YYYY-MM-DD')`,
      orders: sql<number>`count(*)::int`,
      total: sql<number>`sum("orders"."total")::int`,
    })
    .from(s.orders)
    .where(soldIn(r))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const found = new Map(rows.map((x) => [x.period, x]));
  const out: { period: string; orders: number; total: number }[] = [];
  for (let p = r.group === "mes" ? `${r.from.slice(0, 7)}-01` : r.from; p <= r.to; ) {
    out.push(found.get(p) ?? { period: p, orders: 0, total: 0 });
    p = r.group === "mes" ? addMonth(p) : addDays(p, 1);
  }
  return out;
}

function addMonth(date: string) {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Productos más vendidos del período (por unidades). Nombre y SKU del momento de la venta. */
export async function topProducts(r: ReportRange, limit = 10) {
  return db
    .select({
      variantId: s.orderItems.variantId,
      productName: sql<string>`max("order_items"."product_name")`,
      variantName: sql<string>`max("order_items"."variant_name")`,
      sku: sql<string>`max("order_items"."sku")`,
      units: sql<number>`sum("order_items"."quantity")::int`,
      total: sql<number>`sum("order_items"."line_total")::int`,
      orders: sql<number>`count(DISTINCT "order_items"."order_id")::int`,
    })
    .from(s.orderItems)
    .innerJoin(s.orders, eq(s.orders.id, s.orderItems.orderId))
    .where(soldIn(r))
    .groupBy(s.orderItems.variantId)
    .orderBy(desc(sql`sum("order_items"."quantity")`), desc(sql`sum("order_items"."line_total")`))
    .limit(limit);
}

// ───────────── Exportación ─────────────

export type ExportKind = "pagados" | "todos";

const stamp = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
/** Fecha y hora de Chile que Excel reconoce: "2026-10-18 14:05". */
const excelDate = (d: Date | null) => (d ? stamp.format(d) : null);
/** "+56912345678" → "9 1234 5678": sin "+" inicial (Excel lo tomaría como fórmula). */
const nationalPhone = (p: string | null) => p?.replace(/^\+56(\d)(\d{4})(\d{4})$/, "$1 $2 $3") ?? null;

export const EXPORT_HEAD = ["Pedido", "Creado", "Pagado", "Estado", "Pago", "Medio de pago", "Cliente", "Email", "Teléfono", "RUT", "Comuna", "Región", "Unidades", "Productos", "Despacho", "Total", "Neto", "IVA"];

/** Pedidos pagados en el período (por fecha de pago) o todos los creados en el período (por fecha de creación). */
export async function ordersForExport(r: ReportRange, kind: ExportKind) {
  const rows = await db
    .select({
      o: s.orders,
      units: sql<number>`(SELECT coalesce(sum(i.quantity), 0)::int FROM order_items i WHERE i.order_id = "orders"."id")`,
    })
    .from(s.orders)
    .where(kind === "pagados" ? soldIn(r) : within(sql`"orders"."created_at"`, r))
    .orderBy(kind === "pagados" ? asc(s.orders.paidAt) : asc(s.orders.createdAt), asc(s.orders.orderNumber));
  return rows.map(({ o, units }) => {
    const { net, iva } = netFromGross(o.total);
    return [
      o.orderNumber,
      excelDate(o.createdAt),
      excelDate(o.paidAt),
      ORDER_STATUS_LABELS[o.status],
      PAYMENT_STATUS_LABELS[o.paymentStatus],
      o.paymentMethod ? (getProvider(o.paymentMethod)?.label ?? o.paymentMethod) : null,
      o.customerName,
      o.email,
      nationalPhone(o.phone),
      o.rut,
      o.shippingAddress?.commune ?? null,
      o.shippingAddress?.region ?? null,
      units,
      o.subtotal - o.discountTotal,
      o.shippingTotal,
      o.total,
      net,
      iva,
    ];
  });
}

/**
 * CSV para Excel en español: separador ";", UTF-8 con BOM y fin de línea CRLF. Un texto que empieza con = + - @ o
 * tabulador se antepone con ' : Excel lo ejecutaría como fórmula (nombres y emails los escribe el cliente).
 */
export function toCsv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    let t = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `﻿${rows.map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}
