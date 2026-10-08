"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import {
  confirmTransfer,
  incidentSchema,
  type Outcome,
  resolveIncident,
  saveTransferSettings,
  setMethodEnabled,
  transferConfirmationSchema,
  transferSettingsSchema,
} from "@/modules/payments";

const RESULT: Partial<Record<Outcome, string>> = {
  confirmed: "Transferencia confirmada: el pedido quedó pagado y el stock descontado.",
  late_confirmed: "Transferencia confirmada después del vencimiento: se reservó el stock de nuevo y el pedido quedó pagado.",
  review: "Pago registrado como incidencia: NO confirma el pedido. Revisa el motivo en el detalle.",
};

/** Confirmar una transferencia comprobada en la cuenta. Permiso específico; el servicio valida intento, monto y estado. */
export async function confirmTransferAction(paymentId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("payments:manage");
  const input = transferConfirmationSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  try {
    const r = await confirmTransfer(user.id, z.uuid().parse(paymentId), input.data);
    revalidatePath("/admin", "layout");
    return done(prev, r.duplicate ? "Esta confirmación ya se había aplicado." : (RESULT[r.outcome] ?? "Pago registrado."));
  } catch (e) {
    revalidatePath("/admin", "layout"); // la página vuelve con el estado actual si otro administrador ya lo confirmó
    return handleError(e, prev, fd, { unique: { payments_external_ref: "bankReference" } });
  }
}

export async function resolveIncidentAction(paymentId: string, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("payments:manage");
  const input = incidentSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  try {
    await resolveIncident(user.id, z.uuid().parse(paymentId), input.data.note);
    revalidatePath("/admin", "layout");
    return done(prev, "Incidencia cerrada: el pago quedó como devuelto.");
  } catch (e) {
    revalidatePath("/admin", "layout");
    return handleError(e, prev, fd);
  }
}

export async function saveTransferSettingsAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("payments:manage");
  const input = transferSettingsSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, undefined, fieldErrors(input.error));
  await saveTransferSettings(user.id, input.data);
  revalidatePath("/admin", "layout");
  return done(prev, "Datos de la cuenta guardados. Los pedidos ya emitidos conservan las instrucciones que recibieron.");
}

export async function toggleMethodAction(provider: string, enabled: boolean, prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("payments:manage");
  try {
    await setMethodEnabled(user.id, provider, enabled);
    revalidatePath("/admin", "layout");
    return done(prev, enabled ? "Método habilitado." : "Método deshabilitado: no se ofrece en pedidos nuevos.");
  } catch (e) {
    return handleError(e, prev, fd);
  }
}
