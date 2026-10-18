"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { done, fail, field, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { couponSchema, saveCoupon } from "@/modules/promotions";
import { saveFreeShipping } from "@/modules/settings";

/** id null = cupón nuevo. */
export async function saveCouponAction(id: string | null, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("promotions:manage");
  const parsed = couponSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  try {
    await saveCoupon(user.id, id === null ? null : z.uuid().parse(id), parsed.data);
  } catch (e) {
    return handleError(e, prev, fd, { unique: { coupons_code: "code" } });
  }
  revalidatePath("/admin/promociones");
  redirect("/admin/promociones");
}

const freeSchema = z.object({ freeShippingFrom: field.optInt(1, 100_000_000) });

export async function saveFreeShippingAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("promotions:manage");
  const parsed = freeSchema.safeParse(formObject(fd));
  if (!parsed.success) return fail(prev, fd, undefined, fieldErrors(parsed.error));
  await saveFreeShipping(user.id, parsed.data.freeShippingFrom);
  revalidatePath("/", "layout"); // tienda (franja y checkout) y panel
  return done(prev, parsed.data.freeShippingFrom ? "Despacho gratis activado." : "Despacho gratis desactivado.");
}
