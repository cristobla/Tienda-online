import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { productVariants, timestamps } from "./catalog";
import { communes, customers, regions, users } from "./users";

// ───────────── Inventario ─────────────

export const movementType = pgEnum("inventory_movement_type", [
  "INITIAL_STOCK",
  "PURCHASE",
  "SALE",
  "SALE_CANCELLED",
  "RETURN",
  "DAMAGED",
  "MANUAL_ADJUSTMENT",
]);

/** Historial inmutable de cada cambio de stock_on_hand. quantity es el delta con signo. */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    type: movementType("movement_type").notNull(),
    quantity: integer().notNull(),
    previousStock: integer("previous_stock").notNull(),
    resultingStock: integer("resulting_stock").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    reason: text(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movements_variant_idx").on(t.variantId, t.createdAt),
    index("movements_created_idx").on(t.createdAt),
    index("movements_reference_idx").on(t.referenceType, t.referenceId),
    check("movements_quantity_nonzero", sql`${t.quantity} <> 0`),
    check("movements_math", sql`${t.resultingStock} = ${t.previousStock} + ${t.quantity}`),
    check("movements_resulting_nonneg", sql`${t.resultingStock} >= 0`),
    // Un pedido genera su venta una sola vez por producto, aunque lleguen dos confirmaciones a la vez.
    uniqueIndex("movements_one_sale_per_order_line")
      .on(t.referenceId, t.variantId)
      .where(sql`${t.type} = 'SALE' AND ${t.referenceType} = 'ORDER'`),
  ],
);

export const reservationStatus = pgEnum("reservation_status", ["ACTIVE", "CONSUMED", "RELEASED"]);

// ───────────── Pedidos ─────────────

export const orderStatus = pgEnum("order_status", [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
]);

export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  /** Sin respuesta confiable del proveedor (timeout, error de red): se resuelve consultando; nunca se asume rechazo. */
  "UNCERTAIN",
  /** Dinero recibido que NO confirma el pedido (monto distinto, pago tardío sin stock, pago duplicado o sobre un pedido cancelado): revisión / reembolso pendiente. */
  "REVIEW",
]);

export const orderNumberSeq = pgSequence("order_number_seq", { startWith: 1000 });

export type AddressSnapshot = {
  recipientName: string;
  phone?: string | null;
  street: string;
  number: string;
  apartment?: string | null;
  commune: string;
  region: string;
  postalCode?: string | null;
  notes?: string | null;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderNumber: text("order_number")
      .notNull()
      .unique()
      .default(sql`'ORD-' || lpad(nextval('order_number_seq')::text, 6, '0')`),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    email: text().notNull(),
    customerName: text("customer_name").notNull(),
    phone: text(),
    rut: text(),
    shippingCommuneId: integer("shipping_commune_id").references(() => communes.id),
    /** Copia de la dirección al momento de la compra; no cambia si el cliente edita su libreta. */
    shippingAddress: jsonb("shipping_address").$type<AddressSnapshot>(),
    currency: char({ length: 3 }).notNull().default("CLP"),
    subtotal: integer().notNull(),
    discountTotal: integer("discount_total").notNull().default(0),
    shippingTotal: integer("shipping_total").notNull().default(0),
    total: integer().notNull(),
    status: orderStatus().notNull().default("PENDING_PAYMENT"),
    paymentStatus: paymentStatus("payment_status").notNull().default("PENDING"),
    paymentMethod: text("payment_method"),
    notes: text(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_status_idx").on(t.status, t.createdAt),
    index("orders_created_idx").on(t.createdAt),
    check("orders_amounts_nonneg", sql`${t.subtotal} >= 0 AND ${t.discountTotal} >= 0 AND ${t.shippingTotal} >= 0`),
    check("orders_total_math", sql`${t.total} = ${t.subtotal} - ${t.discountTotal} + ${t.shippingTotal}`),
    check("orders_total_nonneg", sql`${t.total} >= 0`),
  ],
);

/** Snapshot de lo vendido: nombre, SKU y precio quedan fijos aunque el producto cambie. */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    productName: text("product_name").notNull(),
    variantName: text("variant_name").notNull(),
    sku: text().notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer().notNull(),
    lineTotal: integer("line_total").notNull(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_variant_idx").on(t.variantId),
    check("order_items_qty_pos", sql`${t.quantity} > 0`),
    check("order_items_price_nonneg", sql`${t.unitPrice} >= 0`),
    check("order_items_line_math", sql`${t.lineTotal} = ${t.unitPrice} * ${t.quantity}`),
  ],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus("from_status"),
    toStatus: orderStatus("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    note: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_history_order_idx").on(t.orderId, t.createdAt)],
);

/** Reserva de stock creada al confirmar checkout; se consume al pagar o se libera al fallar/expirar. */
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid().primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    status: reservationStatus().notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("reservations_status_expires_idx").on(t.status, t.expiresAt),
    index("reservations_order_idx").on(t.orderId),
    check("reservations_qty_pos", sql`${t.quantity} > 0`),
  ],
);

// ───────────── Despacho ─────────────

/** Tarifa de despacho por región (CLP, IVA incluido), editable en el panel. Región sin fila = no se despacha ahí. */
export const shippingRates = pgTable(
  "shipping_rates",
  {
    regionId: integer("region_id")
      .primaryKey()
      .references(() => regions.id, { onDelete: "cascade" }),
    cost: integer().notNull(),
    /** Plazo que se muestra al cliente, p. ej. "2 a 4 días hábiles". */
    eta: text(),
    ...timestamps,
  },
  (t) => [check("shipping_rates_cost_nonneg", sql`${t.cost} >= 0`)],
);

// ───────────── Carrito ─────────────

export const carts = pgTable("carts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    ...timestamps,
  },
  (t) => [unique("cart_items_cart_variant").on(t.cartId, t.variantId), check("cart_items_qty_pos", sql`${t.quantity} > 0`)],
);

// ───────────── Pagos ─────────────

/** Lo que el cliente recibe para pagar un intento. Se guarda congelado en el intento; nunca contiene secretos. */
export type PaymentAction =
  | { kind: "instructions"; title: string; lines: { label: string; value: string }[]; note?: string; example?: boolean }
  | { kind: "redirect"; method: "GET" | "POST"; url: string; fields: Record<string, string> }
  | { kind: "wait"; message: string };

/**
 * Cada intento de pago de un pedido (un pedido puede tener varios). Tres cosas distintas: `status` es el estado del
 * intento; `received_amount`/`received_at`, el dinero verificado como recibido; `orders.status`, el estado operativo.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    /** N.º de intento dentro del pedido (1, 2, …). */
    attempt: integer().notNull().default(1),
    /** Referencia interna del intento ("ORD-001234-2"): corta (cabe en buy_order de Webpay) y única; también es la clave de idempotencia ante el proveedor. */
    reference: text().notNull().unique(),
    provider: text().notNull(),
    /** Ambiente (local, test, integration, production) y cuenta/comercio receptor: el contexto de la referencia externa. */
    environment: text().notNull(),
    account: text().notNull().default(""),
    /** Identificador del proveedor (token, id de pago, n.º de operación bancaria). Siempre texto. */
    providerReference: text("provider_reference"),
    amount: integer().notNull(),
    currency: char({ length: 3 }).notNull().default("CLP"),
    status: paymentStatus().notNull().default("PENDING"),
    /** Acción entregada al cliente, congelada al emitir el intento (p. ej. la cuenta de ese momento). */
    checkout: jsonb().$type<PaymentAction>(),
    /** Último resultado: lo normalizado y lo que respondió el proveedor (o registró el admin), sin secretos. Explica cada transición. */
    raw: jsonb(),
    receivedAmount: integer("received_amount"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Motivo de la revisión / reembolso pendiente, o cómo se resolvió. */
    incident: text(),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.status, t.createdAt),
    unique("payments_order_attempt").on(t.orderId, t.attempt),
    // La misma referencia externa (token, n.º de operación) no se aplica a dos intentos del mismo proveedor, ambiente y cuenta.
    unique("payments_external_ref").on(t.provider, t.environment, t.account, t.providerReference),
    // Un solo intento pendiente por pedido y método: un doble clic o una recarga no crean otro.
    uniqueIndex("payments_one_pending").on(t.orderId, t.provider).where(sql`${t.status} = 'PENDING'`),
    check("payments_amount_pos", sql`${t.amount} > 0`),
    check("payments_received_pos", sql`${t.receivedAmount} IS NULL OR ${t.receivedAmount} > 0`),
  ],
);

export const paymentEventStatus = pgEnum("payment_event_status", ["RECEIVED", "PROCESSED", "FAILED", "IGNORED"]);

/**
 * Entradas de proveedores (webhook, retorno del navegador) y comandos del admin. Las de proveedores se guardan
 * ANTES de procesarse: recibido no es procesado, y una que falló queda para reintentar. (provider, event_id) deduplica.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    /** webhook | return | admin */
    source: text().notNull(),
    /** Id del evento en el proveedor o del comando del admin, cuando existe. */
    eventId: text("event_id"),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    /** Lo que traía la entrada para encontrar el intento (token, referencia). */
    reference: text(),
    payload: jsonb().notNull(),
    status: paymentEventStatus().notNull().default("RECEIVED"),
    tries: integer().notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("payment_events_provider_event").on(t.provider, t.eventId),
    index("payment_events_status_idx").on(t.status, t.createdAt),
    index("payment_events_payment_idx").on(t.paymentId),
  ],
);

/** Métodos de pago: interruptor del admin y configuración NO secreta (cuenta para transferencias). Las credenciales van en el entorno. */
export const paymentMethods = pgTable("payment_methods", {
  provider: text().primaryKey(),
  enabled: boolean().notNull().default(true),
  settings: jsonb().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ───────────── Auditoría ─────────────

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);
