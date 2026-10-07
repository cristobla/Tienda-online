"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import * as catalog from "@/modules/catalog/admin";
import { validateAttributes } from "@/modules/catalog/attributes";
import { loadAttributeDefinitions } from "@/modules/catalog/queries";

// Restricciones únicas → campo del formulario donde mostrar el error.
const UNIQUE = { products_slug: "slug", sku_unique: "v.sku", barcode_unique: "v.barcode" };
const HAS_HISTORY = "Tiene movimientos de inventario o ventas, así que no se puede eliminar (se perdería el historial). Desactívalo en su lugar.";

const uuid = (v: string) => z.uuid().parse(v);
type Raw = Record<string, string>;
const sub = (raw: Raw, prefix: string): Raw =>
  Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (k.startsWith(prefix) ? [[k.slice(prefix.length), v]] : [])));
const pre = (errors: Record<string, string>, prefix: string) => Object.fromEntries(Object.entries(errors).map(([k, v]) => [prefix + k, v]));

async function parseProduct(raw: Raw) {
  const defs = await loadAttributeDefinitions();
  const p = catalog.productSchema.safeParse(raw);
  const a = validateAttributes(defs, "PRODUCT", raw);
  return { data: p.data, attrs: a.ok ? a.value : {}, errors: { ...(p.success ? {} : fieldErrors(p.error)), ...(a.ok ? {} : a.errors) } };
}

async function parseVariant(raw: Raw, withInitialStock: boolean) {
  const r = sub(raw, "v.");
  const defs = await loadAttributeDefinitions();
  const v = catalog.variantSchema.safeParse(r);
  const st = withInitialStock ? catalog.initialStockSchema.safeParse(r) : { success: true as const, data: { initialStock: 0 } };
  const a = validateAttributes(defs, "VARIANT", r);
  const errors = {
    ...(v.success ? {} : fieldErrors(v.error)),
    ...(st.success ? {} : fieldErrors(st.error)),
    ...(a.ok ? {} : a.errors),
  };
  return { data: v.data, attrs: a.ok ? a.value : {}, initialStock: st.data?.initialStock ?? 0, errors: pre(errors, "v.") };
}

const refresh = () => revalidatePath("/admin", "layout");

// ───────────── Productos ─────────────

export async function createProductAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const raw = formObject(fd);
  const [p, v] = await Promise.all([parseProduct(raw), parseVariant(raw, true)]);
  const errors = { ...p.errors, ...v.errors };
  if (Object.keys(errors).length || !p.data || !v.data) return fail(prev, fd, undefined, errors);
  let id: string;
  try {
    id = (await catalog.createProduct(user.id, { product: p.data, attributes: p.attrs, variant: v.data, variantAttributes: v.attrs, initialStock: v.initialStock })).id;
  } catch (e) {
    return handleError(e, prev, fd, { unique: UNIQUE });
  }
  refresh();
  redirect(`/admin/productos/${id}?creado=1`);
}

export async function updateProductAction(productId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const p = await parseProduct(formObject(fd));
  if (Object.keys(p.errors).length || !p.data) return fail(prev, fd, undefined, p.errors);
  try {
    await catalog.updateProduct(user.id, uuid(productId), p.data, p.attrs);
  } catch (e) {
    return handleError(e, prev, fd, { unique: UNIQUE });
  }
  refresh();
  return done(prev, "Producto guardado.");
}

export async function deleteProductAction(productId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await catalog.deleteProduct(user.id, uuid(productId));
  } catch (e) {
    return handleError(e, prev, fd, { restrictMessage: HAS_HISTORY });
  }
  refresh();
  redirect("/admin/productos");
}

// ───────────── Variantes ─────────────

export async function createVariantAction(productId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const v = await parseVariant(formObject(fd), true);
  if (Object.keys(v.errors).length || !v.data) return fail(prev, fd, undefined, v.errors);
  try {
    await catalog.createVariant(user.id, uuid(productId), v.data, v.attrs, v.initialStock);
  } catch (e) {
    return handleError(e, prev, fd, { unique: UNIQUE });
  }
  refresh();
  redirect(`/admin/productos/${productId}#variantes`);
}

export async function updateVariantAction(variantId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const v = await parseVariant(formObject(fd), false);
  if (Object.keys(v.errors).length || !v.data) return fail(prev, fd, undefined, v.errors);
  try {
    await catalog.updateVariant(user.id, uuid(variantId), v.data, v.attrs);
  } catch (e) {
    return handleError(e, prev, fd, { unique: UNIQUE });
  }
  refresh();
  return done(prev, "Variante guardada.");
}

export async function setDefaultVariantAction(variantId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await catalog.setDefaultVariant(user.id, uuid(variantId));
  } catch (e) {
    return handleError(e, prev, fd);
  }
  refresh();
  return done(prev, "Ahora es la variante principal.");
}

export async function deleteVariantAction(productId: string, variantId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await catalog.deleteVariant(user.id, uuid(variantId));
  } catch (e) {
    return handleError(e, prev, fd, {
      restrictMessage: "Tiene movimientos de inventario o ventas, así que no se puede eliminar. Desmarca «Variante a la venta» en su lugar.",
    });
  }
  refresh();
  redirect(`/admin/productos/${uuid(productId)}#variantes`);
}

// ───────────── Imágenes ─────────────

export async function uploadImagesAction(productId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const alt = String(fd.get("alt") ?? "").trim().slice(0, 200);
  try {
    await catalog.addImages(user.id, uuid(productId), files, alt);
  } catch (e) {
    return handleError(e, prev, fd);
  }
  refresh();
  return done(prev, files.length === 1 ? "Imagen subida." : `${files.length} imágenes subidas.`);
}

export async function updateImageAction(imageId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const parsed = catalog.imageSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    await catalog.updateImage(user.id, uuid(imageId), parsed.data);
  } catch (e) {
    return handleError(e, prev, fd);
  }
  refresh();
  return done(prev, "Imagen guardada.");
}

export async function makeImagePrimaryAction(imageId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await catalog.makeImagePrimary(user.id, uuid(imageId));
  } catch (e) {
    return handleError(e, prev, fd);
  }
  refresh();
  return done(prev, "Ahora es la imagen principal.");
}

export async function deleteImageAction(imageId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await catalog.deleteImage(user.id, uuid(imageId));
  } catch (e) {
    return handleError(e, prev, fd);
  }
  refresh();
  return done(prev, "Imagen eliminada.");
}
