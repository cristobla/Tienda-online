/** Gestión de usuarios del staff (permiso users:manage, solo SUPER_ADMIN) y cambio de la propia contraseña (todo el personal). */
import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sessions, userRole, users } from "@/db/schema";
import { UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password";
import { sessionIdOf } from "./session";

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
// Nombres con "password": así nunca vuelven al navegador si el formulario tiene errores (ver echo en lib/form).
export const ownPasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Obligatorio").max(200), password, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { message: "No coincide con la nueva contraseña", path: ["passwordConfirm"] })
  .refine((d) => d.password !== d.currentPassword, { message: "Debe ser distinta de la actual", path: ["password"] });

// Nunca se audita ni se devuelve el hash.
const safe = ({ passwordHash: _, ...u }: typeof users.$inferSelect) => u;

export async function listStaff() {
  return (await db.select().from(users).where(ne(users.role, "CUSTOMER")).orderBy(asc(users.email))).map(safe);
}

export async function getUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u ? safe(u) : null;
}

/** `actorId` null = sistema (el primer Super Admin, creado con `npm run admin:create`). */
export async function createStaffUser(actorId: string | null, data: z.infer<typeof newUserSchema>) {
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

/**
 * Cualquier usuario del personal cambia SU contraseña: exige la actual y cierra sus sesiones en otros equipos (si
 * alguien más la conocía, queda fuera); este equipo sigue dentro. `currentToken` = token de la cookie de esta sesión.
 */
export async function changeOwnPassword(userId: string, currentToken: string, data: { currentPassword: string; password: string }) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.active || !(await verifyPassword(u.passwordHash, data.currentPassword))) throw new UserError("La contraseña actual no es correcta.", "currentPassword");
  const passwordHash = await hashPassword(data.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, sessionIdOf(currentToken))));
    await audit(tx, { userId, action: "user.password_change", entityType: "user", entityId: userId });
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
