import { existsSync } from "node:fs";
import { join } from "node:path";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import * as s from "@/db/schema";
import { env } from "@/lib/env";
import { saveImage } from "@/lib/storage";
import { attachPhotoBySku, photoKeys, photoOrder, productsWithoutPhotos } from "@/modules/catalog/photos";
import { makeVariant, resetDb } from "./helpers";

let adminId: string;
beforeEach(async () => {
  await resetDb();
  const [u] = await db.insert(s.users).values({ email: "admin@test.cl", passwordHash: "x", role: "ADMIN" }).returning();
  adminId = u!.id;
});

const jpg = async (name: string, side = 400, exif = false) => {
  let img = sharp({ create: { width: side, height: side, channels: 3, background: "#ffffff" } }).jpeg();
  if (exif) img = img.withExif({ IFD0: { Copyright: "celular" } });
  return new File([new Uint8Array(await img.toBuffer())], name, { type: "image/jpeg" });
};
const fileOf = (url: string) => join(env.UPLOAD_DIR, url.replace("/media/", ""));
const imagesOf = (productId: string) => db.select().from(s.productImages).where(eq(s.productImages.productId, productId)).orderBy(asc(s.productImages.sortOrder));

describe("nombres de archivo", () => {
  it("SKU, número de orden y orden de subida", () => {
    expect(photoKeys("DET-500.jpg")).toEqual(["DET-500"]);
    expect(photoKeys("DET-500-2.JPG")).toEqual(["DET-500-2", "DET-500"]);
    expect(photoKeys("DET-500 (3).png")).toEqual(["DET-500 (3)", "DET-500"]);
    expect(photoKeys("7801234567890_2.webp")).toEqual(["7801234567890_2", "7801234567890"]);
    expect(["A-2.jpg", "A-10.jpg", "A.jpg", "A-3.png"].sort(photoOrder)).toEqual(["A.jpg", "A-2.jpg", "A-3.png", "A-10.jpg"]);
  });
});

describe("carga masiva por SKU", () => {
  it("asocia por SKU (sin distinguir mayúsculas) o código de barras; la principal primero; sin coincidencia no guarda", async () => {
    const v = await makeVariant(0, "DET-500");
    await db.update(s.productVariants).set({ barcode: "7801234567890" }).where(eq(s.productVariants.id, v.id));
    const r1 = await attachPhotoBySku(adminId, await jpg("det-500.jpg"), "si-vacio");
    expect(r1).toMatchObject({ status: "added", variantId: v.id, sku: "DET-500" });
    const r2 = await attachPhotoBySku(adminId, await jpg("7801234567890-2.jpg"), "si-vacio", [v.id]);
    expect(r2.status).toBe("added");
    expect((await imagesOf(v.productId)).map((i) => i.sortOrder)).toEqual([0, 1]);
    expect(await attachPhotoBySku(adminId, await jpg("NO-EXISTE.jpg"), "agregar")).toMatchObject({ status: "unmatched" });
    expect(await db.$count(s.productImages)).toBe(2);
  });

  it("«solo si no tiene fotos» no duplica al repetir la carga; «reemplazar» borra las anteriores y sus archivos", async () => {
    const v = await makeVariant(0, "SKU-1");
    await attachPhotoBySku(adminId, await jpg("SKU-1.jpg"), "si-vacio");
    expect(await attachPhotoBySku(adminId, await jpg("SKU-1.jpg"), "si-vacio")).toMatchObject({ status: "skipped" });
    const [old] = await imagesOf(v.productId);
    expect(existsSync(fileOf(old!.url))).toBe(true);

    expect(await attachPhotoBySku(adminId, await jpg("SKU-1.jpg"), "reemplazar")).toMatchObject({ status: "added", note: "Reemplazó 1." });
    const now = await imagesOf(v.productId);
    expect(now).toHaveLength(1);
    expect(now[0]!.url).not.toBe(old!.url);
    expect(existsSync(fileOf(old!.url))).toBe(false);
    const logs = await db.select({ action: s.auditLogs.action }).from(s.auditLogs);
    expect(logs.map((l) => l.action).sort()).toEqual(["image.add", "image.add", "image.delete"]);
  });

  it("con varios formatos la foto queda en el formato del SKU", async () => {
    const v = await makeVariant(0, "BASE-1");
    const [v2] = await db.insert(s.productVariants).values({ productId: v.productId, sku: "BASE-2", name: "Grande", price: 2000 }).returning();
    await attachPhotoBySku(adminId, await jpg("BASE-2.jpg"), "si-vacio");
    // El otro formato aún no tiene foto: no se omite.
    expect((await attachPhotoBySku(adminId, await jpg("BASE-1.jpg"), "si-vacio")).status).toBe("added");
    expect((await imagesOf(v.productId)).map((i) => i.variantId).sort()).toEqual([v.id, v2!.id].sort());
    expect((await productsWithoutPhotos()).total).toBe(0);
  });

  it("las fotos grandes o con metadatos se reducen y se guardan sin EXIF", async () => {
    const url = await saveImage(await jpg("grande.jpg", 2600, true));
    expect(url).toMatch(/\.webp$/);
    const meta = await sharp(fileOf(url)).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBe(2000);
    expect(meta.exif).toBeUndefined();
    // Una foto chica y limpia se guarda tal cual.
    expect(await saveImage(await jpg("chica.jpg"))).toMatch(/\.jpg$/);
  });
});
