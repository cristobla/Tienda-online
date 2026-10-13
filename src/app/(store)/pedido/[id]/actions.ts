"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, type FormState, handleError } from "@/lib/form";
import { startPayment } from "@/modules/payments";

/**
 * El cliente elige o reintenta el medio de pago de su pedido. Autoriza lo mismo que ver el pedido: el enlace secreto
 * (UUID). El servicio valida estado, reserva vigente y método disponible; el monto es siempre el total del pedido.
 */
export async function startPaymentAction(orderId: string, provider: string, prev: FormState, fd: FormData): Promise<FormState> {
  const id = z.uuid().parse(orderId);
  try {
    await startPayment(id, z.string().max(40).parse(provider));
  } catch (e) {
    revalidatePath(`/pedido/${id}`);
    return handleError(e, prev, fd);
  }
  revalidatePath(`/pedido/${id}`);
  return done(prev, "Listo: revisa las instrucciones de pago.");
}
