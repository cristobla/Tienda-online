/**
 * Feed de productos (RSS 2.0 con atributos g:) para Google Merchant Center y el catálogo de Meta (Instagram y
 * Facebook Shops): ambos lo aceptan como fuente programada. Una entrada por variante a la venta de un producto
 * publicado y con foto (los dos la exigen). Precios en CLP con IVA, como en la tienda.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { loadCategories } from "@/modules/categories/queries";
import { readSettings } from "@/modules/settings";

/** GTIN real (EAN-8, UPC-12, EAN-13, GTIN-14) con dígito verificador; los códigos internos (prefijo 2) no se informan. */
export function validGtin(code: string | null): code is string {
  if (!code || !/^(\d{8}|\d{12,14})$/.test(code) || (code.length === 13 && code.startsWith("2"))) return false;
  const digits = [...code].map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((t, d, i) => t + d * (i % 2 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export async function feedItems() {
  const { visibleIds } = await loadCategories();
  if (!visibleIds.length) return [];
  // Foto de la variante si tiene, si no la principal del producto. Tablas calificadas: es una subconsulta.
  const image = sql<string | null>`(SELECT i.url FROM product_images i WHERE i.product_id = "products"."id"
    ORDER BY (i.variant_id = "product_variants"."id") DESC NULLS LAST, i.sort_order LIMIT 1)`;
  return db
    .select({
      productId: s.products.id,
      slug: s.products.slug,
      name: s.products.name,
      description: s.products.shortDescription,
      variants: sql<number>`count(*) OVER (PARTITION BY "products"."id")::int`,
      sku: s.productVariants.sku,
      variant: s.productVariants.name,
      price: s.productVariants.price,
      compareAt: s.productVariants.compareAtPrice,
      barcode: s.productVariants.barcode,
      available: sql<number>`"product_variants"."stock_on_hand" - "product_variants"."stock_reserved"`,
      brand: s.brands.name,
      image,
    })
    .from(s.productVariants)
    .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
    .leftJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .where(and(eq(s.products.active, true), eq(s.productVariants.active, true), inArray(s.products.categoryId, visibleIds), sql`${image} IS NOT NULL`))
    .orderBy(asc(s.products.name), asc(s.productVariants.sortOrder));
}

export async function productFeedXml() {
  const items = (await feedItems()).map((p) => {
    const link = `${env.APP_URL}/producto/${p.slug}?variante=${encodeURIComponent(p.sku)}`;
    const onSale = p.compareAt !== null && p.compareAt > p.price;
    const tags: [string, string | null | undefined][] = [
      ["g:id", p.sku],
      ["g:item_group_id", p.variants > 1 ? p.productId : null],
      ["title", (p.variants > 1 ? `${p.name} - ${p.variant}` : p.name).slice(0, 150)],
      ["description", p.description || p.name],
      ["link", link],
      ["g:image_link", new URL(p.image!, env.APP_URL).href],
      ["g:availability", p.available > 0 ? "in_stock" : "out_of_stock"],
      ["g:price", `${onSale ? p.compareAt : p.price} CLP`],
      ["g:sale_price", onSale ? `${p.price} CLP` : null],
      ["g:brand", p.brand],
      ["g:gtin", validGtin(p.barcode) ? p.barcode : null],
      ["g:identifier_exists", validGtin(p.barcode) ? null : "no"],
      ["g:condition", "new"],
    ];
    return `<item>${tags.map(([k, v]) => (v ? `<${k}>${esc(v)}</${k}>` : "")).join("")}</item>`;
  });
  const st = await readSettings();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>',
    `<title>${esc(st.name)}</title><link>${esc(env.APP_URL)}</link><description>${esc(st.description)}</description>`,
    ...items,
    "</channel></rss>",
  ].join("\n");
}
