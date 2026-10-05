"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { adjustStock, stockOperationSchema } from "@/modules/inventory";

// Refresca también si falla: el formulario de conteo vuelve con el stock actual.
const refresh = () => revalidatePath("/admin", "layout");

export async function stockOperationAction(variantId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("inventory:adjust");
  const op = stockOperationSchema.safeParse(formObject(fd));
  if (!op.success) return fail(prev, fd, undefined, fieldErrors(op.error));
  try {
    const m = await adjustStock(user.id, z.uuid().parse(variantId), op.data);
    refresh();
    return done(prev, `Listo: stock en bodega ${m.previousStock} → ${m.resultingStock}.`);
  } catch (e) {
    refresh();
    return handleError(e, prev, fd);
  }
}
