/**
 * Se ejecuta una vez al iniciar el servidor. Tarea periódica: vence los pedidos impagos (devuelve su stock),
 * reconcilia pagos y envía los correos en cola, lo mismo que `npm run jobs`. Nada depende de ella: la
 * confirmación de un pago compara el vencimiento con el reloj de la base, y en producción `npm run jobs`
 * se programa aparte (cron).
 * ponytail: temporizador dentro del proceso (cómodo en desarrollo y en un servidor de larga duración; idempotente
 * con varias instancias). En serverless o al escalar, solo el cron.
 */
import type { Instrumentation } from "next";

/** Error no controlado en una página, acción o ruta: queda en /admin/errores (por patrón de ruta, sin ids ni parámetros). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/modules/errors");
  await recordError(err, { route: context.routePath, method: request.method });
};

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { runPaymentJobs } = await import("@/modules/payments");
  const { sendPendingEmails } = await import("@/modules/mail");
  const { purgeExpiredSessions } = await import("@/modules/auth/session");
  const { purgeStaleCarts } = await import("@/modules/cart");
  const g = globalThis as unknown as { orderExpiryTimer?: NodeJS.Timeout };
  // En desarrollo Next recarga módulos: un solo temporizador por proceso, que no impide que el proceso termine.
  // Sin base de datos basta una línea por minuto (no un stack trace); cualquier otro error se muestra completo.
  const { recordError } = await import("@/modules/errors");
  const report = (e: { code?: string; cause?: { code?: string } }) => {
    const down = (e?.cause ?? e)?.code === "ECONNREFUSED";
    console.error("Error en las tareas de pedidos y pagos:", down ? "la base de datos no responde (ECONNREFUSED)." : e);
    if (!down) void recordError(e, { route: "tareas" });
  };
  g.orderExpiryTimer ??= setInterval(
    () =>
      runPaymentJobs()
        .then(() => sendPendingEmails())
        .then(() => purgeExpiredSessions())
        .then(() => purgeStaleCarts())
        .catch(report),
    60_000,
  ).unref();
}
