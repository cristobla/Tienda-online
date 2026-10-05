"use server";

import { revalidatePath } from "next/cache";
import { done, fail, type FormState, formObject } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { listShippingRates, parseShippingForm, saveShippingRates } from "@/modules/shipping";

export async function saveShippingAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("shipping:manage");
  const regionIds = (await listShippingRates()).map((r) => r.regionId);
  const { rates, errors } = parseShippingForm(formObject(fd), regionIds);
  if (Object.keys(errors).length) return fail(prev, fd, undefined, errors);
  await saveShippingRates(user.id, rates);
  revalidatePath("/", "layout"); // checkout y panel muestran las tarifas nuevas
  return done(prev, "Tarifas guardadas.");
}
