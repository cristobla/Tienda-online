"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { changeOrderStatus, ORDER_STATUS_LABELS, statusChangeSchema } from "@/modules/orders";

export async function changeStatusAction(orderId: string, to: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("orders:manage");
  const input = statusChangeSchema.safeParse({ ...formObject(fd), to });
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  try {
    const order = await changeOrderStatus(user.id, z.uuid().parse(orderId), input.data);
    revalidatePath("/admin", "layout");
    return done(prev, `Pedido ${order.orderNumber}: ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
  } catch (e) {
    revalidatePath("/admin", "layout"); // la página vuelve con el estado actual si otro lo cambió
    return handleError(e, prev, fd);
  }
}
