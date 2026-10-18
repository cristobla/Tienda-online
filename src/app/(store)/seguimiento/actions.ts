"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { fail, type FormState } from "@/lib/form";
import { isBlocked, registerFailure } from "@/modules/auth/rate-limit";
import { findOrderId } from "@/modules/orders";

/** Número + email → comprobante del pedido. 10 intentos fallidos por conexión en 15 minutos (el número es correlativo). */
export async function trackOrderAction(prev: FormState, fd: FormData): Promise<FormState> {
  const key = `seguimiento:${clientIp(await headers())}`;
  if (isBlocked(key, 10)) return fail(prev, fd, "Demasiados intentos. Espera unos minutos o escríbenos.");
  const id = await findOrderId(String(fd.get("number") ?? "").slice(0, 30), String(fd.get("email") ?? "").slice(0, 200));
  if (!id) {
    registerFailure(key);
    return fail(prev, fd, "No encontramos un pedido con ese número y email. Revisa el correo de confirmación.");
  }
  redirect(`/pedido/${id}`);
}
