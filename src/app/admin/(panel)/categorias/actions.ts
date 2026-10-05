"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { categorySchema, createCategory, deleteCategory, updateCategory } from "@/modules/categories/admin";

const UNIQUE = { slug: "slug" };

/** id = null crea; con id edita. */
export async function saveCategoryAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const parsed = categorySchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    if (id) await updateCategory(user.id, z.uuid().parse(id), parsed.data);
    else await createCategory(user.id, parsed.data);
  } catch (e) {
    return handleError(e, prev, fd, { unique: UNIQUE });
  }
  revalidatePath("/", "layout"); // el menú de la tienda muestra las categorías
  if (!id) redirect("/admin/categorias");
  return done(prev, "Categoría guardada.");
}

export async function deleteCategoryAction(id: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  try {
    await deleteCategory(user.id, z.uuid().parse(id));
  } catch (e) {
    return handleError(e, prev, fd, { restrictMessage: "Tiene productos o subcategorías. Muévelos primero o desactiva la categoría." });
  }
  revalidatePath("/", "layout");
  redirect("/admin/categorias");
}
