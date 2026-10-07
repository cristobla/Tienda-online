/** Gestión de usuarios del staff (permiso users:manage, solo SUPER_ADMIN). */
import { asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, userRole, users } from "@/db/schema";
import { UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./password";

export const STAFF_ROLES = userRole.enumValues.filter((r) => r !== "CUSTOMER");

export const ROLE_LABELS: Record<(typeof userRole.enumValues)[number], string> = {
  CUSTOMER: "Cliente",
  SALES: "Ventas",
  WAREHOUSE: "Bodega",
  ADMIN: "Administrador",
  SUPER_ADMIN: "Super administrador",
};

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(200, "Máximo 200 caracteres");

export const newUserSchema = z.object({
  // Primero recortar y pasar a minúsculas, después validar: z.email().trim() valida antes de recortar.
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  role: z.enum(STAFF_ROLES, "Elige un rol"),
  password,
});
export const userUpdateSchema = z.object({ role: z.enum(STAFF_ROLES, "Elige un rol"), active: z.preprocess((v) => v === "on", z.boolean()) });
export const passwordSchema = z.object({ password });

// Nunca se audita ni se devuelve el hash.
const safe = ({ passwordHash: _, ...u }: typeof users.$inferSelect) => u;

export async function listStaff() {
  return (await db.select().from(users).where(ne(users.role, "CUSTOMER")).orderBy(asc(users.email))).map(safe);
}

export async function getUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ? safe(u) : null;
}

export async function createStaffUser(actorId: string, data: z.infer<typeof newUserSchema>) {
  const passwordHash = await hashPassword(data.password);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(users).values({ email: data.email, role: data.role, passwordHash }).returning();
    await audit(tx, { userId: actorId, action: "user.create", entityType: "user", entityId: row!.id, after: safe(row!) });
    return safe(row!);
  });
}

/**
 * Cambia rol o estado. Nadie se cambia a sí mismo (evita quedarse fuera o sin super administrador:
 * quien edita es un SUPER_ADMIN activo, así que siempre queda al menos uno).
 * Al desactivar o cambiar de rol se cierran sus sesiones.
 */
export async function updateStaffUser(actorId: string, id: string, data: z.infer<typeof userUpdateSchema>) {
  if (actorId === id) throw new UserError("No puedes cambiar tu propio rol ni desactivarte.");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(users).where(eq(users.id, id)).for("update");
    if (!before) throw new UserError("El usuario no existe.");
    const [row] = await tx.update(users).set(data).where(eq(users.id, id)).returning();
    if (!data.active || data.role !== before.role) await tx.delete(sessions).where(eq(sessions.userId, id));
    await audit(tx, { userId: actorId, action: "user.update", entityType: "user", entityId: id, before: safe(before), after: safe(row!) });
  });
}

/** Nueva contraseña: cierra todas las sesiones de ese usuario. */
export async function setUserPassword(actorId: string, id: string, plain: string) {
  const passwordHash = await hashPassword(plain);
  await db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ passwordHash }).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) throw new UserError("El usuario no existe.");
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await audit(tx, { userId: actorId, action: "user.password_reset", entityType: "user", entityId: id });
  });
}
