import { eq, inArray } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { bulkSchema, bulkUpdateProducts } from "@/modules/catalog/admin";
import { makeVariant, resetDb } from "./helpers";

let adminId: string;
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
});

const productIds = async (n: number) => {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push((await makeVariant(1)).productId);
  return ids;
};

describe("acciones masivas en productos", () => {
  it("valida la entrada: al menos uno, acción conocida y la categoría o marca cuando corresponde", () => {
    expect(bulkSchema.safeParse({ ids: [], action: "ocultar" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: [crypto.randomUUID()], action: "borrar" }).success).toBe(false);
    const r = bulkSchema.safeParse({ ids: [crypto.randomUUID()], action: "categoria", categoryId: "" });
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(["categoryId"]);
  });

  it("publicar salta los que no tienen categoría y lo informa; cada cambio queda auditado", async () => {
    const ids = await productIds(3);
    await db.update(s.products).set({ active: false }).where(inArray(s.products.id, ids));
    await db.update(s.products).set({ categoryId: null }).where(eq(s.products.id, ids[2]!));
    expect(await bulkUpdateProducts(adminId, bulkSchema.parse({ ids, action: "publicar" }))).toEqual({ updated: 2, skipped: 1 });
    const rows = await db.select({ id: s.products.id, active: s.products.active }).from(s.products).where(inArray(s.products.id, ids));
    expect(rows.filter((r) => r.active).map((r) => r.id).sort()).toEqual([ids[0], ids[1]].sort());
    expect(await db.$count(s.auditLogs, eq(s.auditLogs.action, "product.bulk"))).toBe(2);
  });

  it("asignar categoría y marca (que existan), ocultar y destacar", async () => {
    const ids = await productIds(2);
    const [cat] = await db.insert(s.categories).values({ name: "Nueva", slug: "nueva" }).returning();
    const [brand] = await db.insert(s.brands).values({ name: "Marca X", slug: "marca-x" }).returning();
    await bulkUpdateProducts(adminId, bulkSchema.parse({ ids, action: "categoria", categoryId: cat!.id }));
    await bulkUpdateProducts(adminId, bulkSchema.parse({ ids, action: "marca", brandId: brand!.id }));
    await bulkUpdateProducts(adminId, bulkSchema.parse({ ids, action: "destacar" }));
    await bulkUpdateProducts(adminId, bulkSchema.parse({ ids: [ids[0]!], action: "ocultar" }));
    const rows = await db.select().from(s.products).where(inArray(s.products.id, ids));
    expect(rows.every((r) => r.categoryId === cat!.id && r.brandId === brand!.id && r.featured)).toBe(true);
    expect(rows.find((r) => r.id === ids[0])?.active).toBe(false);
    await expect(bulkUpdateProducts(adminId, bulkSchema.parse({ ids, action: "categoria", categoryId: crypto.randomUUID() }))).rejects.toThrow("no existe");
  });
});
