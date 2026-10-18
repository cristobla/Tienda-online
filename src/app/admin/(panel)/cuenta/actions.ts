"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { done, fail, fieldErrors, type FormState, formObject, handleError, UserError } from "@/lib/form";
import { clearFailures, isBlocked, registerFailure } from "@/modules/auth/rate-limit";
import { isStaff } from "@/modules/auth/rbac";
import { getCurrentUser, SESSION_COOKIE } from "@/modules/auth/session";
import { disableTotp, enableTotp } from "@/modules/auth/totp";
import { changeOwnPassword, ownPasswordSchema } from "@/modules/auth/users";

/** Cambio de la propia contraseña. Con la sesión de otro (equipo prestado), 5 intentos fallidos bloquean 15 minutos. */
export async function changeOwnPasswordAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!user || !isStaff(user.role) || !token) return fail(prev, fd, "Tu sesión expiró: vuelve a ingresar.");
  const key = `pwd:${user.id}`;
  if (isBlocked(key, 5)) return fail(prev, fd, "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.");
  const input = ownPasswordSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  try {
    await changeOwnPassword(user.id, token, input.data);
  } catch (e) {
    if (e instanceof UserError) registerFailure(key);
    return handleError(e, prev, fd);
  }
  clearFailures(key);
  return done(prev, "Contraseña cambiada. Cerramos tus sesiones abiertas en otros equipos.");
}

/** Activar o desactivar la verificación en dos pasos propia (contraseña + código). Mismo límite de intentos. */
export async function totpAction(mode: "activar" | "desactivar", prev: FormState, fd: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) return fail(prev, fd, "Tu sesión expiró: vuelve a ingresar.");
  const key = `pwd:${user.id}`;
  if (isBlocked(key, 5)) return fail(prev, fd, "Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.");
  const data = { secret: String(fd.get("secret") ?? ""), code: String(fd.get("code") ?? ""), currentPassword: String(fd.get("currentPassword") ?? "") };
  try {
    await (mode === "activar" ? enableTotp(user.id, data) : disableTotp(user.id, data));
  } catch (e) {
    if (e instanceof UserError) registerFailure(key);
    return handleError(e, prev, fd);
  }
  clearFailures(key);
  revalidatePath("/admin", "layout");
  return done(prev, mode === "activar" ? "Verificación en dos pasos activada. Desde ahora, al ingresar se pide el código." : "Verificación en dos pasos desactivada.");
}
