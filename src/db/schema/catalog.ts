import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
export { timestamps };

export type Attributes = Record<string, string | number | boolean>;

export const brands = pgTable("brands", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  logoUrl: text("logo_url"),
  active: boolean().notNull().default(true),
  ...timestamps,
});

/** Árbol de profundidad libre: categoría raíz = parent_id NULL. */
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "restrict" }),
    name: text().notNull(),
    slug: text().notNull().unique(),
    description: text(),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean().notNull().default(true),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ...timestamps,
  },
  (t) => [
    index("categories_parent_idx").on(t.parentId, t.sortOrder),
    check("categories_not_own_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

export const attributeType = pgEnum("attribute_type", ["TEXT", "NUMBER", "BOOLEAN", "SELECT"]);
export const attributeScope = pgEnum("attribute_scope", ["PRODUCT", "VARIANT"]);

/** Atributos extensibles (aroma, tipo de piel, registro ISP…) definidos desde el panel. */
export const attributeDefinitions = pgTable("attribute_definitions", {
  id: uuid().primaryKey().defaultRandom(),
  code: text().notNull().unique(),
  label: text().notNull(),
  type: attributeType().notNull().default("TEXT"),
  scope: attributeScope().notNull().default("PRODUCT"),
  unit: text(),
  options: jsonb().$type<string[]>(),
  filterable: boolean().notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    shortDescription: text("short_description"),
    description: text(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    /** NULL = borrador sin clasificar (p. ej. recién importado); para publicar se exige categoría (CHECK abajo). */
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "restrict" }),
    attributes: jsonb().$type<Attributes>().notNull().default({}),
    active: boolean().notNull().default(true),
    featured: boolean().notNull().default(false),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    ...timestamps,
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brandId),
    index("products_active_featured_idx").on(t.active, t.featured),
    index("products_created_idx").on(t.createdAt),
    index("products_attributes_gin").using("gin", t.attributes),
    check("products_active_needs_category", sql`NOT ${t.active} OR ${t.categoryId} IS NOT NULL`),
  ],
);

/** Unidad del contenido neto de UNA unidad del producto. */
export const contentUnit = pgEnum("content_unit", ["UNIT", "ML", "L", "G", "KG", "CM", "M"]);

/**
 * Unidad vendible. Todo producto tiene al menos una variante (la "por defecto").
 * Precios en CLP enteros, IVA incluido.
 * Stock en unidades vendibles de ESTA variante (si es pack, packs).
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text().notNull().unique(),
    barcode: text().unique(),
    name: text().notNull(),
    price: integer().notNull(),
    compareAtPrice: integer("compare_at_price"),
    costPrice: integer("cost_price"),
    netContent: numeric("net_content", { precision: 12, scale: 3 }),
    contentUnit: contentUnit("content_unit").notNull().default("UNIT"),
    unitsPerPack: integer("units_per_pack").notNull().default(1),
    attributes: jsonb().$type<Attributes>().notNull().default({}),
    stockOnHand: integer("stock_on_hand").notNull().default(0),
    stockReserved: integer("stock_reserved").notNull().default(0),
    minimumStock: integer("minimum_stock").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean().notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("variants_product_idx").on(t.productId, t.sortOrder),
    index("variants_price_idx").on(t.price),
    uniqueIndex("variants_one_default_per_product").on(t.productId).where(sql`${t.isDefault}`),
    check("variants_price_nonneg", sql`${t.price} >= 0`),
    check("variants_compare_gt_price", sql`${t.compareAtPrice} IS NULL OR ${t.compareAtPrice} > ${t.price}`),
    check("variants_cost_nonneg", sql`${t.costPrice} IS NULL OR ${t.costPrice} >= 0`),
    check("variants_net_content_pos", sql`${t.netContent} IS NULL OR ${t.netContent} > 0`),
    check("variants_units_per_pack_pos", sql`${t.unitsPerPack} >= 1`),
    // Garantías de inventario a nivel de base de datos: nunca negativo, nunca reservar más de lo físico.
    check("variants_stock_nonneg", sql`${t.stockOnHand} >= 0`),
    check("variants_reserved_nonneg", sql`${t.stockReserved} >= 0`),
    check("variants_reserved_le_stock", sql`${t.stockReserved} <= ${t.stockOnHand}`),
    check("variants_min_stock_nonneg", sql`${t.minimumStock} >= 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    url: text().notNull(),
    alt: text().notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
);
