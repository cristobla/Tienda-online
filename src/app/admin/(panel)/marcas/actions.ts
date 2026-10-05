"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { brandSchema, createBrand, deleteBrand, updateBrand } from "@/modules/brands/admin";

/** id = null crea; con id edita. */
export async function saveBrandAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const parsed = brandSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    if (id) await updateBrand(user.id, z.uuid().parse(id), parsed.data);
    else await createBrand(user.id, parsed.data);
  } catch (e) {
    return handleError(e, prev, fd, { unique: { slug: "slug" } });
  }
  revalidatePath("/admin", "layout");
  if (!id) redirect("/admin/marcas");
  return done(prev, "Marca guardada.");
}

export async function deleteBrandAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await deleteBrand(user.id, z.uuid().parse(id));
  } catch (e) {
    return handleError(e, prev, fd, { restrictMessage: "Tiene productos asociados. Desactívala o cambia la marca de esos productos." });
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/marcas");
}
