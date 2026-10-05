import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "./password";
import { can, ForbiddenError, type Permission, type Role } from "./rbac";

export const SESSION_COOKIE = "session";

export type SessionUser = { id: string; email: string; role: Role };

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Devuelve el token en claro (va a la cookie); en BD solo queda su hash. */
export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, ...meta });
  return { token, expiresAt };
}

export async function validateSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date()), eq(users.active, true)));
  return row ?? null;
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

// Hash fijo para igualar el tiempo de respuesta cuando el email no existe (evita enumerar usuarios).
let dummyHash: Promise<string> | undefined;

/** Verifica credenciales. Mismo error y tiempo similar si falla el email o la contraseña. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user || !user.active) {
    await verifyPassword(await (dummyHash ??= hashPassword("dummy-password")), password);
    return null;
  }
  if (!(await verifyPassword(user.passwordHash, password))) return null;
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { id: user.id, email: user.email, role: user.role };
}

// ── Integración con Next (cookies). Solo usable en Server Components, Server Actions y Route Handlers. ──

export async function getCurrentUser(): Promise<SessionUser | null> {
  const { cookies } = await import("next/headers");
  return validateSession((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Autorización en el servidor: lanza si no hay sesión o falta el permiso. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || !can(user.role, permission)) throw new ForbiddenError(permission);
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const { cookies } = await import("next/headers");
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
