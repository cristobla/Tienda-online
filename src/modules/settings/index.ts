/**
 * Datos de la tienda (nombre, descripción, contacto, redes y a quién avisar de los pedidos) y textos de las páginas
 * informativas, editables en el panel (permiso settings:manage). Mientras no se guarden rigen los valores por
 * omisión (src/lib/site.ts): nada se inventa y lo vacío no se muestra.
 */
import { eq } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { infoPages, storeSettings } from "@/db/schema";
import { field, UserError } from "@/lib/form";
import { DEFAULT_SETTINGS, type StoreSettings } from "@/lib/site";
import { audit } from "@/modules/audit";
import { normalizeChileanPhone } from "@/modules/chile";

export async function readSettings(tx: Tx = db): Promise<StoreSettings> {
  const [row] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1));
  if (!row) return DEFAULT_SETTINGS;
  const { id: _, updatedBy: __, createdAt: ___, updatedAt: ____, ...data } = row;
  return data;
}

/** Para layouts, páginas y metadatos: una sola lectura por solicitud. */
export const getSettings = cache(() => readSettings());

// Recortar y pasar a minúsculas antes de validar (z.email() valida antes de un .trim() posterior).
const optEmail = field
  .optText(200)
  .transform((v) => v?.toLowerCase() ?? null)
  .pipe(z.email("Email inválido").nullable());

/** Enlace https a la red indicada: el pie no publica enlaces a otros sitios. */
const profile = (host: RegExp, site: string) =>
  field.optText(300).refine((v) => {
    if (v === null) return true;
    const u = URL.canParse(v) ? new URL(v) : null;
    return u?.protocol === "https:" && host.test(u.hostname);
  }, `Debe ser el enlace https de tu perfil en ${site}`);

// google.com/maps, maps.google.com, maps.app.goo.gl (botón "Compartir" de Maps) o g.page (enlaces del perfil).
const GOOGLE = /(^|\.)(google\.(com|cl)|goo\.gl|g\.page)$/;

export const settingsSchema = z.object({
  name: field.text(60),
  description: field.text(200),
  email: optEmail,
  whatsapp: field.optText(30).transform((v, ctx) => {
    if (v === null) return null;
    const n = normalizeChileanPhone(v);
    if (!n?.startsWith("+569")) ctx.addIssue({ code: "custom", message: "Debe ser un celular chileno (ej. 9 1234 5678)" });
    return n;
  }),
  hours: field.optText(120),
  instagram: profile(/(^|\.)instagram\.com$/, "Instagram"),
  facebook: profile(/(^|\.)(facebook|fb)\.com$/, "Facebook"),
  tiktok: profile(/(^|\.)tiktok\.com$/, "TikTok"),
  orderNotifyEmail: optEmail,
  storeAddress: field.optText(120),
  storeCommune: field.optText(60),
  storeRegion: field.optText(60),
  mapsUrl: profile(GOOGLE, "Google Maps"),
  // Perfil de Empresa → «Pedir reseñas» (g.page/r/…) o el enlace de reseñas de Maps.
  reviewUrl: profile(GOOGLE, "Google"),
  pickupEnabled: field.bool(),
})
  .refine((d) => !d.pickupEnabled || d.storeAddress, { path: ["storeAddress"], message: "Para ofrecer retiro, completa la dirección del local" }) satisfies z.ZodType<EditableSettings>;

/** Lo que se edita en /admin/tienda (el despacho gratis se edita en Promociones). */
export type EditableSettings = Omit<StoreSettings, "freeShippingFrom">;

export async function saveSettings(userId: string, data: EditableSettings) {
  await db.transaction(async (tx) => {
    const before = await readSettings(tx);
    await tx
      .insert(storeSettings)
      .values({ id: 1, ...data, updatedBy: userId })
      .onConflictDoUpdate({ target: storeSettings.id, set: { ...data, updatedBy: userId } });
    await audit(tx, { userId, action: "settings.update", entityType: "settings", entityId: "tienda", before, after: data });
  });
}

/** Despacho gratis desde un monto (null = apagado). Solo toca ese dato. */
export async function saveFreeShipping(userId: string, freeShippingFrom: number | null) {
  await db.transaction(async (tx) => {
    const before = await readSettings(tx);
    await tx
      .insert(storeSettings)
      .values({ id: 1, ...before, freeShippingFrom, updatedBy: userId })
      .onConflictDoUpdate({ target: storeSettings.id, set: { freeShippingFrom, updatedBy: userId } });
    await audit(tx, { userId, action: "settings.update", entityType: "settings", entityId: "despacho-gratis", before: { freeShippingFrom: before.freeShippingFrom }, after: { freeShippingFrom } });
  });
}

// ───────────── Páginas informativas ─────────────

/** Las páginas son fijas (el pie enlaza a estas); su texto se edita en el panel. */
export const INFO_PAGES = {
  ayuda: "Preguntas frecuentes",
  despacho: "Despacho y retiro",
  cambios: "Cambios y devoluciones",
  contacto: "Contacto",
  terminos: "Términos y condiciones",
  privacidad: "Política de privacidad",
} as const;
export type InfoSlug = keyof typeof INFO_PAGES;

export const isInfoSlug = (slug: string): slug is InfoSlug => Object.hasOwn(INFO_PAGES, slug);

/** Una lectura por solicitud (la piden los metadatos y la página). */
export const getInfoPage = cache(async (slug: string) => {
  if (!isInfoSlug(slug)) return null;
  const [row] = await db.select().from(infoPages).where(eq(infoPages.slug, slug));
  return { slug, title: INFO_PAGES[slug], body: row?.body ?? "", updatedAt: row?.updatedAt ?? null };
});

export async function listInfoPages() {
  const rows = new Map((await db.select().from(infoPages)).map((r) => [r.slug, r]));
  return Object.entries(INFO_PAGES).map(([slug, title]) => {
    const row = rows.get(slug);
    return { slug, title, filled: !!row?.body.trim(), updatedAt: row?.updatedAt ?? null };
  });
}

export const infoPageSchema = z.object({ body: z.string().trim().max(20_000, "Máximo 20.000 caracteres") });

/** Texto vacío = la página vuelve a "contenido pendiente". */
export async function saveInfoPage(userId: string, slug: string, body: string) {
  if (!isInfoSlug(slug)) throw new UserError("Esa página no existe.");
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ body: infoPages.body }).from(infoPages).where(eq(infoPages.slug, slug));
    await tx.insert(infoPages).values({ slug, body, updatedBy: userId }).onConflictDoUpdate({ target: infoPages.slug, set: { body, updatedBy: userId } });
    await audit(tx, { userId, action: "page.update", entityType: "page", entityId: slug, before: before ?? null, after: { body } });
  });
}
