"use server";

import { revalidatePath } from "next/cache";
import { done, type FormState } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { clearErrors } from "@/modules/errors";

export async function clearErrorsAction(prev: FormState): Promise<FormState> {
  const user = await requirePermission("audit:read");
  await clearErrors(user.id);
  revalidatePath("/admin", "layout");
  return done(prev, "Errores marcados como revisados.");
}
