/** Definiciones de atributos (administrables) y validación de valores contra ellas. */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type Attributes, attributeDefinitions, attributeScope, attributeType } from "@/db/schema";
import { audit } from "@/modules/audit";
import { field, UserError } from "@/lib/form";

export type AttributeDef = typeof attributeDefinitions.$inferSelect;
type Scope = (typeof attributeScope.enumValues)[number];

/** Nombre de los inputs de atributos en los formularios: attr.aroma, attr.talla… */
export const ATTR_FIELD = "attr.";

/** Solo al crear: el código no se cambia después. */
export const attributeCodeSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, "Minúsculas, números y _ (ej. tipo_piel)"),
});

export const attributeDefSchema = z
  .object({
    label: field.text(60),
    type: z.enum(attributeType.enumValues),
    scope: z.enum(attributeScope.enumValues),
    unit: field.optText(10),
    // Una opción por línea.
    options: z
      .string()
      .optional()
      .transform((v) => [...new Set((v ?? "").split("\n").map((o) => o.trim()).filter(Boolean))]),
    filterable: field.bool(),
    sortOrder: field.int(0, 10_000),
  })
  .refine((d) => d.type !== "SELECT" || d.options.length > 0, { path: ["options"], message: "Agrega al menos una opción" })
  .transform((d) => ({ ...d, options: d.type === "SELECT" ? d.options : null }));
export type AttributeDefInput = z.infer<typeof attributeDefSchema>;

export async function createAttributeDef(userId: string, code: string, data: AttributeDefInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(attributeDefinitions).values({ ...data, code }).returning();
    await audit(tx, { userId, action: "attribute.create", entityType: "attribute", entityId: row!.id, after: row });
    return row!;
  });
}

/** El código no se cambia: los valores guardados en productos lo usan como clave. */
export async function updateAttributeDef(userId: string, id: string, data: AttributeDefInput) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(attributeDefinitions).where(eq(attributeDefinitions.id, id)).for("update");
    if (!before) throw new UserError("El atributo no existe.");
    const [row] = await tx.update(attributeDefinitions).set(data).where(eq(attributeDefinitions.id, id)).returning();
    await audit(tx, { userId, action: "attribute.update", entityType: "attribute", entityId: id, before, after: row });
    return row!;
  });
}

/** Los valores ya guardados quedan en el JSON pero dejan de mostrarse y filtrarse. */
export async function deleteAttributeDef(userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [before] = await tx.delete(attributeDefinitions).where(eq(attributeDefinitions.id, id)).returning();
    if (before) await audit(tx, { userId, action: "attribute.delete", entityType: "attribute", entityId: id, before });
  });
}

/**
 * Valida los valores enviados (raw["attr.<code>"]) contra las definiciones del alcance indicado.
 * Vacío = sin valor. Devuelve el JSON a guardar o errores por campo.
 */
export function validateAttributes(
  defs: AttributeDef[],
  scope: Scope,
  raw: Record<string, string | undefined>,
): { ok: true; value: Attributes } | { ok: false; errors: Record<string, string> } {
  const value: Attributes = {};
  const errors: Record<string, string> = {};
  for (const d of defs.filter((x) => x.scope === scope)) {
    const name = ATTR_FIELD + d.code;
    const v = raw[name]?.trim();
    if (!v) continue;
    if (d.type === "NUMBER") {
      const n = Number(v.replace(",", "."));
      if (Number.isFinite(n)) value[d.code] = n;
      else errors[name] = "Debe ser un número";
    } else if (d.type === "BOOLEAN") {
      if (v === "true" || v === "false") value[d.code] = v === "true";
      else errors[name] = "Valor inválido";
    } else if (d.type === "SELECT") {
      if (d.options?.includes(v)) value[d.code] = v;
      else errors[name] = "Elige una opción de la lista";
    } else if (v.length > 200) errors[name] = "Máximo 200 caracteres";
    else value[d.code] = v;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
