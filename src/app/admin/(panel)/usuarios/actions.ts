"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { createStaffUser, newUserSchema, passwordSchema, setUserPassword, updateStaffUser, userUpdateSchema } from "@/modules/auth/users";

export async function createUserAction(prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("users:manage");
  const parsed = newUserSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    await createStaffUser(actor.id, parsed.data);
  } catch (e) {
    return handleError(e, prev, fd, { unique: { email: "email" } });
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/usuarios");
}

export async function updateUserAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("users:manage");
  const parsed = userUpdateSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    await updateStaffUser(actor.id, z.uuid().parse(id), parsed.data);
  } catch (e) {
    return handleError(e, prev, fd);
  }
  revalidatePath("/admin", "layout");
  return done(prev, "Usuario guardado.");
}

export async function setPasswordAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const actor = await requirePermission("users:manage");
  const parsed = passwordSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    await setUserPassword(actor.id, z.uuid().parse(id), parsed.data.password);
  } catch (e) {
    return handleError(e, prev, fd);
  }
  // Si fue la propia cuenta, su sesión también se cerró.
  if (actor.id === id) redirect("/admin/login");
  return done(prev, "Contraseña cambiada. Sus sesiones abiertas se cerraron.");
}
