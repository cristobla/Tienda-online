"use server";

import { revalidatePath } from "next/cache";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { infoPageSchema, saveInfoPage } from "@/modules/settings";

export async function savePageAction(slug: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("settings:manage");
  const input = infoPageSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  try {
    await saveInfoPage(user.id, slug, input.data.body);
  } catch (e) {
    return handleError(e, prev, fd);
  }
  revalidatePath("/", "layout");
  return done(prev, input.data.body ? "Página guardada." : "Página vaciada: la tienda vuelve a mostrar «Contenido pendiente».");
}
