import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { type FormState, handleError, pgError, UserError } from "@/lib/form";
import { createSession, validateSession } from "@/modules/auth/session";
import { createStaffUser, setUserPassword, updateStaffUser } from "@/modules/auth/users";
import { createBrand, deleteBrand } from "@/modules/brands/admin";
import {
  addImages,
  createProduct,
  createVariant,
  deleteImage,
  deleteProduct,
  deleteVariant,
  listAdminProducts,
  productSchema,
  setDefaultVariant,
  updateProduct,
  variantSchema,
} from "@/modules/catalog/admin";
import { validateAttributes } from "@/modules/catalog/attributes";
import { categorySchema, createCategory, deleteCategory, updateCategory } from "@/modules/categories/admin";
import { applyMovement } from "@/modules/inventory";
import { resetDb } from "./helpers";

let adminId: string;
let categoryId: string;

beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "SUPER_ADMIN" }).returning();
  adminId = u!.id;
  categoryId = (await createCategory(adminId, categorySchema.parse({ name: "Cuidado capilar", sortOrder: "0", active: "on" }))).id;
});

const variant = (over: Record<string, string> = {}) =>
  variantSchema.parse({ sku: "SKU-1", barcode: "", name: "500 ml", price: "4990", netContent: "500", contentUnit: "ML", unitsPerPack: "1", minimumStock: "5", sortOrder: "0", active: "on", ...over });

async function newProduct(stock = 10, sku = "SKU-1", name = `Shampoo Ñandú Hidratación ${sku === "SKU-1" ? "" : sku}`) {
  return createProduct(adminId, {
    product: productSchema.parse({ name, categoryId, active: "on" }),
    attributes: {},
    variant: variant({ sku }),
    variantAttributes: {},
    initialStock: stock,
  });
}

describe("esquemas de formulario", () => {
  it("convierte strings del formulario y valida reglas de negocio", () => {
    const v = variant({ compareAtPrice: "", costPrice: "2500", netContent: "1,5", barcode: "7801234567890" });
    expect(v).toMatchObject({ price: 4990, compareAtPrice: null, costPrice: 2500, netContent: "1.5", barcode: "7801234567890", active: true });
    expect(variantSchema.safeParse({ ...v, price: "1000", compareAtPrice: "900" }).success).toBe(false);
    expect(variantSchema.safeParse({ ...v, price: "", compareAtPrice: "" }).success).toBe(false);
    expect(variantSchema.safeParse({ ...v, price: "10.5" }).success).toBe(false);
    expect(variantSchema.safeParse({ ...v, barcode: "123" }).success).toBe(false);
    expect(variantSchema.safeParse({ ...v, sku: "con espacio" }).success).toBe(false);
    expect(productSchema.parse({ name: " Jabón ", categoryId, slug: "" })).toMatchObject({ name: "Jabón", slug: null, active: false });
  });

  it("valida atributos contra sus definiciones y alcance", () => {
    const defs = [
      { code: "aroma", type: "TEXT", scope: "PRODUCT" },
      { code: "peso", type: "NUMBER", scope: "PRODUCT" },
      { code: "hipo", type: "BOOLEAN", scope: "PRODUCT" },
      { code: "piel", type: "SELECT", scope: "PRODUCT", options: ["Seca", "Grasa"] },
      { code: "talla", type: "SELECT", scope: "VARIANT", options: ["S"] },
    ] as Parameters<typeof validateAttributes>[0];
    expect(validateAttributes(defs, "PRODUCT", { "attr.aroma": " Coco ", "attr.peso": "1,5", "attr.hipo": "false", "attr.piel": "Seca", "attr.talla": "S" })).toEqual({
      ok: true,
      value: { aroma: "Coco", peso: 1.5, hipo: false, piel: "Seca" },
    });
    const bad = validateAttributes(defs, "PRODUCT", { "attr.peso": "mucho", "attr.piel": "Mixta" });
    expect(bad).toEqual({ ok: false, errors: { "attr.peso": "Debe ser un número", "attr.piel": "Elige una opción de la lista" } });
  });
});

describe("productos y variantes", () => {
  it("crea producto con variante por defecto, slug, movimiento de stock inicial y auditoría", async () => {
    const p = await newProduct(12);
    expect(p.slug).toBe("shampoo-nandu-hidratacion");
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, p.id));
    expect(v).toMatchObject({ isDefault: true, stockOnHand: 12, stockReserved: 0 });
    const [m] = await db.select().from(s.inventoryMovements).where(eq(s.inventoryMovements.variantId, v!.id));
    expect(m).toMatchObject({ type: "INITIAL_STOCK", quantity: 12, previousStock: 0, resultingStock: 12, createdBy: adminId });
    const logs = await db.select().from(s.auditLogs);
    expect(logs.map((l) => l.action)).toEqual(["category.create", "product.create"]);
  });

  it("si falla la creación no queda nada a medias (ni producto, ni movimiento, ni auditoría)", async () => {
    await newProduct(5);
    await expect(newProduct(5, "SKU-1", "Otro nombre")).rejects.toSatisfy((e) => pgError(e).constraint === "product_variants_sku_unique");
    expect(await db.$count(s.products)).toBe(1);
    expect(await db.$count(s.inventoryMovements)).toBe(1);
    expect(await db.$count(s.auditLogs, eq(s.auditLogs.action, "product.create"))).toBe(1);
  });

  it("traduce errores de base de datos a mensajes del formulario", async () => {
    await newProduct();
    const fd = new FormData();
    fd.set("sku", "SKU-1");
    let err: unknown;
    await newProduct(0, "SKU-1", "Otro nombre").catch((e) => (err = e));
    const state = handleError(err, {} as FormState, fd, { unique: { sku: "sku" } });
    expect(state).toMatchObject({ errors: { sku: "Ya existe otro registro con este valor." }, values: { sku: "SKU-1" }, v: 1 });
    expect(handleError(new UserError("Ojo", "name"), {}, fd)).toMatchObject({ errors: { name: "Ojo" } });
    expect(() => handleError(new Error("bug"), {}, fd)).toThrow("bug");
  });

  it("la segunda variante no es la por defecto; cambiar la principal deja solo una", async () => {
    const p = await newProduct();
    const v2 = await createVariant(adminId, p.id, variant({ sku: "SKU-2", name: "1 L" }), {}, 0);
    expect(v2.isDefault).toBe(false);
    await setDefaultVariant(adminId, v2.id);
    const rows = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, p.id));
    expect(rows.filter((r) => r.isDefault).map((r) => r.sku)).toEqual(["SKU-2"]);
  });

  it("no borra la variante por defecto ni lo que tiene historial; sí lo que nunca tuvo stock", async () => {
    const p = await newProduct(10);
    const [def] = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, p.id));
    await expect(deleteVariant(adminId, def!.id)).rejects.toThrow(UserError);

    const withStock = await createVariant(adminId, p.id, variant({ sku: "SKU-2" }), {}, 3);
    await expect(deleteVariant(adminId, withStock.id)).rejects.toSatisfy((e) => pgError(e).code === "23503");

    const empty = await createVariant(adminId, p.id, variant({ sku: "SKU-3" }), {}, 0);
    await deleteVariant(adminId, empty.id);
    expect(await db.$count(s.productVariants, eq(s.productVariants.productId, p.id))).toBe(2);

    await expect(deleteProduct(adminId, p.id)).rejects.toSatisfy((e) => pgError(e).code === "23503");
    const blank = await newProduct(0, "SKU-9");
    await deleteProduct(adminId, blank.id);
    expect(await db.$count(s.products)).toBe(1);
  });

  it("applyMovement nunca deja stock negativo (la base lo rechaza)", async () => {
    const p = await newProduct(2);
    const [v] = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, p.id));
    await expect(db.transaction((tx) => applyMovement(tx, { variantId: v!.id, type: "DAMAGED", quantity: -3 }))).rejects.toSatisfy(
      (e) => pgError(e).code === "23514",
    );
    const m = await db.transaction((tx) => applyMovement(tx, { variantId: v!.id, type: "DAMAGED", quantity: -2, reason: "Roto" }));
    expect(m).toMatchObject({ previousStock: 2, resultingStock: 0 });
  });

  it("el listado del panel incluye inactivos y filtra por texto, SKU, categoría madre y stock", async () => {
    const child = await createCategory(adminId, categorySchema.parse({ name: "Shampoo", parentId: categoryId, sortOrder: "0", active: "on" }));
    const p = await newProduct(0);
    await updateProduct(adminId, p.id, productSchema.parse({ name: "Shampoo Ñandú", categoryId: child.id }), {});
    const list = (f: Parameters<typeof listAdminProducts>[0]) => listAdminProducts(f).then((r) => r.items.map((i) => i.name));
    expect(await list({ q: "nandu" })).toEqual(["Shampoo Ñandú"]);
    expect(await list({ q: "sku-1" })).toEqual(["Shampoo Ñandú"]);
    expect(await list({ categoryId })).toEqual(["Shampoo Ñandú"]);
    expect(await list({ status: "inactivos" })).toEqual(["Shampoo Ñandú"]);
    expect(await list({ status: "activos" })).toEqual([]);
    expect(await list({ stock: "agotado" })).toEqual(["Shampoo Ñandú"]);
    expect((await listAdminProducts({})).total).toBe(1);
  });
});

describe("categorías y marcas", () => {
  it("impide ciclos en el árbol y borrar categorías con productos o hijas", async () => {
    const child = await createCategory(adminId, categorySchema.parse({ name: "Shampoo", parentId: categoryId, sortOrder: "0" }));
    const base = categorySchema.parse({ name: "Cuidado capilar", sortOrder: "0", parentId: child.id });
    await expect(updateCategory(adminId, categoryId, base)).rejects.toThrow(UserError);
    await expect(updateCategory(adminId, categoryId, { ...base, parentId: categoryId })).rejects.toThrow(UserError);
    await expect(deleteCategory(adminId, categoryId)).rejects.toSatisfy((e) => pgError(e).code === "23503");
    await deleteCategory(adminId, child.id);
  });

  it("marca con productos no se borra", async () => {
    const b = await createBrand(adminId, { name: "Demo Aqua", slug: null, description: null, active: true });
    expect(b.slug).toBe("demo-aqua");
    const p = await newProduct();
    await updateProduct(adminId, p.id, productSchema.parse({ name: "X", categoryId, brandId: b.id }), {});
    await expect(deleteBrand(adminId, b.id)).rejects.toSatisfy((e) => pgError(e).code === "23503");
  });
});

describe("imágenes", () => {
  const png = () => new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], "foto.png");

  it("guarda solo imágenes reales y no deja archivos huérfanos si una falla", async () => {
    const p = await newProduct();
    const [img] = await addImages(adminId, p.id, [png()], "Frente");
    const file = path.resolve(env.UPLOAD_DIR, img!.url.replace("/media/", ""));
    expect(img!.url).toMatch(/^\/media\/[0-9a-f-]{36}\.png$/);
    expect(existsSync(file)).toBe(true);

    const before = await db.$count(s.productImages);
    const fake = new File(["<svg onload=alert(1)>"], "x.png", { type: "image/png" });
    await expect(addImages(adminId, p.id, [png(), fake], "")).rejects.toThrow(/no es JPG/);
    expect(await db.$count(s.productImages)).toBe(before);

    await deleteImage(adminId, img!.id);
    expect(existsSync(file)).toBe(false);
  });
});

describe("usuarios del staff", () => {
  it("nadie se cambia a sí mismo; desactivar o cambiar contraseña cierra sesiones; el hash no se audita", async () => {
    await expect(updateStaffUser(adminId, adminId, { role: "ADMIN", active: true })).rejects.toThrow(UserError);
    const u = await createStaffUser(adminId, { email: "bodega@test.cl", role: "WAREHOUSE", password: "clave-larga-123" });
    const { token } = await createSession(u.id);
    await setUserPassword(adminId, u.id, "otra-clave-larga-456");
    expect(await validateSession(token)).toBeNull();

    const second = await createSession(u.id);
    await updateStaffUser(adminId, u.id, { role: "WAREHOUSE", active: false });
    expect(await validateSession(second.token)).toBeNull();

    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityType, "user"));
    expect(JSON.stringify(logs)).not.toContain("argon2");
    expect(logs.map((l) => l.action)).toEqual(["user.create", "user.password_reset", "user.update"]);
  });
});
