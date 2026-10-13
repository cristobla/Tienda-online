"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp } from "@/lib/client-ip";
import { fail, fieldErrors, type FormState, formObject, handleError, UserError } from "@/lib/form";
import { isBlocked, registerFailure } from "@/modules/auth/rate-limit";
import { currentCartId } from "@/modules/cart";
import { orderInputSchema } from "@/modules/orders";
import { placeOrder } from "@/modules/payments";

/**
 * Confirma el pedido. Montos, stock y despacho los recalcula el servicio; el formulario solo aporta datos del
 * cliente y el medio de pago elegido (el servicio vuelve a comprobar que esté disponible).
 */
export async function checkoutAction(prev: FormState, fd: FormData): Promise<FormState> {
  const input = orderInputSchema.safeParse(formObject(fd));
  const method = z.string().min(1).max(40).safeParse(fd.get("paymentMethod"));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  if (!method.success) return fail(prev, fd, "Elige un medio de pago.");
  const cartId = await currentCartId();
  if (!cartId) return fail(prev, fd, "Tu carrito está vacío.");
  // Pedidos por conexión en 15 minutos: cada uno reserva stock mientras espera el pago.
  const key = `checkout:${clientIp(await headers())}`;
  if (isBlocked(key, 10)) return fail(prev, fd, "Demasiados pedidos seguidos desde esta conexión. Intenta de nuevo en unos minutos.");
  let orderId: string;
  try {
    // Compra como invitado: las cuentas de cliente aún no existen (el ingreso actual es solo del personal).
    orderId = (await placeOrder(cartId, input.data, method.data)).id;
    registerFailure(key); // cuenta el pedido creado (mismo contador en memoria que los intentos de ingreso)
  } catch (e) {
    revalidatePath("/checkout"); // el resumen vuelve con los montos actuales
    // La comuna se elige arriba (no es un campo de este formulario): su error va como mensaje general.
    if (e instanceof UserError && e.field === "communeId") return fail(prev, fd, e.message);
    return handleError(e, prev, fd);
  }
  revalidatePath("/", "layout"); // el carrito quedó vacío
  redirect(`/pedido/${orderId}`);
}
