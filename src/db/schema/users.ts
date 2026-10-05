import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./catalog";

/** SALES y WAREHOUSE quedan definidos para uso futuro; sus permisos viven en src/modules/auth/rbac.ts. */
export const userRole = pgEnum("user_role", ["CUSTOMER", "SALES", "WAREHOUSE", "ADMIN", "SUPER_ADMIN"]);

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRole().notNull().default("CUSTOMER"),
    active: boolean().notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

/** Se guarda el SHA-256 del token, nunca el token: una filtración de la tabla no permite secuestrar sesiones. */
export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const regions = pgTable("regions", {
  id: serial().primaryKey(),
  /** Código CUT de la región (ej. "13" = Metropolitana). */
  code: text().notNull().unique(),
  name: text().notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const communes = pgTable(
  "communes",
  {
    id: serial().primaryKey(),
    regionId: integer("region_id")
      .notNull()
      .references(() => regions.id, { onDelete: "restrict" }),
    name: text().notNull(),
  },
  (t) => [unique("communes_region_name").on(t.regionId, t.name)],
);

/** Cliente separado del usuario: permite compra como invitado (user_id NULL). */
export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    email: text().notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** RUT normalizado sin puntos, con guion: 12345678-5. Opcional. */
    rut: text(),
    /** E.164: +56912345678 */
    phone: text(),
    ...timestamps,
  },
  (t) => [index("customers_email_idx").on(t.email), index("customers_rut_idx").on(t.rut)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid().primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text(),
    recipientName: text("recipient_name").notNull(),
    phone: text(),
    street: text().notNull(),
    number: text().notNull(),
    apartment: text(),
    communeId: integer("commune_id")
      .notNull()
      .references(() => communes.id, { onDelete: "restrict" }),
    postalCode: text("postal_code"),
    notes: text(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("addresses_customer_idx").on(t.customerId)],
);
