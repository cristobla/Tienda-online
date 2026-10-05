"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { attributeCodeSchema, attributeDefSchema, createAttributeDef, deleteAttributeDef, updateAttributeDef } from "@/modules/catalog/attributes";

/** id = null crea; con id edita (el código solo se define al crear). */
export async function saveAttributeAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const raw = formObject(fd);
  const parsed = attributeDefSchema.safeParse(raw);
  const code = id ? null : attributeCodeSchema.safeParse(raw);
  if (!parsed.success || code?.success === false)
    return fail(prev, fd, undefined, { ...(parsed.error && fieldErrors(parsed.error)), ...(code?.error && fieldErrors(code.error)) });
  try {
    if (id) await updateAttributeDef(user.id, z.uuid().parse(id), parsed.data);
    else await createAttributeDef(user.id, code!.data!.code, parsed.data);
  } catch (e) {
    return handleError(e, prev, fd, { unique: { code: "code" } });
  }
  revalidatePath("/admin", "layout");
  if (!id) redirect("/admin/atributos");
  return done(prev, "Atributo guardado.");
}

export async function deleteAttributeAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await deleteAttributeDef(user.id, z.uuid().parse(id));
  } catch (e) {
    return handleError(e, prev, fd);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/atributos");
}
