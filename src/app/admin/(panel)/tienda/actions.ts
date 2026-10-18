"use server";

import { revalidatePath } from "next/cache";
import { done, fail, fieldErrors, type FormState, formObject } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { saveSettings, settingsSchema } from "@/modules/settings";

export async function saveSettingsAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings:manage");
  const input = settingsSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  await saveSettings(user.id, input.data);
  revalidatePath("/", "layout"); // encabezado, pie, títulos y datos para buscadores con los datos nuevos
  return done(prev, "Datos de la tienda guardados.");
}
