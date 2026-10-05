"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form";
import { clearFailures, isBlocked, registerFailure } from "@/modules/auth/rate-limit";
import { isStaff } from "@/modules/auth/rbac";
import { authenticate, createSession, revokeSession, SESSION_COOKIE, setSessionCookie } from "@/modules/auth/session";

export async function login(prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(fd.get("password") ?? "").slice(0, 200);
  const h = await headers();
  // ponytail: x-forwarded-for es confiable solo detrás de un proxy propio; definir la IP real al desplegar (FASE 8).
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const keys = { ip: `ip:${ip}`, account: `acct:${ip}|${email}` };
  const fail = (error: string): FormState => ({ v: (prev.v ?? 0) + 1, error, values: { email } });

  if (isBlocked(keys.ip, 30) || isBlocked(keys.account, 5)) return fail("Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.");

  const user = email && password ? await authenticate(email, password) : null;
  // Mismo mensaje para email inexistente, clave incorrecta o cuenta de cliente: no revela qué cuentas existen.
  if (!user || !isStaff(user.role)) {
    registerFailure(keys.ip);
    registerFailure(keys.account);
    return fail("Email o contraseña incorrectos.");
  }
  clearFailures(keys.account);
  const { token, expiresAt } = await createSession(user.id, { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? undefined });
  await setSessionCookie(token, expiresAt);
  redirect("/admin");
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  jar.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
