"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { changeOrderStatus, ORDER_STATUS_LABELS, statusChangeSchema } from "@/modules/orders";
import { type RefundOutcome, refundOrder, refundSchema } from "@/modules/payments";

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

const REFUND_TEXT: Record<RefundOutcome["result"], string> = {
  REFUNDED: "dinero devuelto por el medio de pago",
  PENDING: "reembolso aceptado y en proceso",
  MANUAL: "devuelve el dinero desde el banco y regístralo en el pago",
  FAILED: "el reembolso automático no se completó: reintenta desde el pago",
};

/**
 * Anular un pedido pagado o registrar su devolución, con el reembolso: toca dinero y stock, por eso exige
 * payments:manage (lo tienen Administrador y Super administrador).
 */
export async function reverseOrderAction(orderId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("payments:manage");
  const input = refundSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  try {
    const { order, restocked, refunds } = await refundOrder(user.id, z.uuid().parse(orderId), input.data);
    revalidatePath("/admin", "layout");
    const money = refunds.map((r) => `${r.reference}: ${REFUND_TEXT[r.result]}${r.result === "FAILED" && r.message ? ` (${r.message})` : ""}`).join("; ");
    return done(prev, `Pedido ${order.orderNumber} ${order.status === "REFUNDED" ? "devuelto" : "anulado"}${restocked ? "; los productos volvieron al stock" : ""}. ${money}.`);
  } catch (e) {
    revalidatePath("/admin", "layout");
    return handleError(e, prev, fd);
  }
}
