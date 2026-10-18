"use server";

import { cookies } from "next/headers";
import { done, fail, fieldErrors, type FormState, formObject, handleError, UserError } from "@/lib/form";
import { clearFailures, isBlocked, registerFailure } from "@/modules/auth/rate-limit";
import { isStaff } from "@/modules/auth/rbac";
import { getCurrentUser, SESSION_COOKIE } from "@/modules/auth/session";
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
