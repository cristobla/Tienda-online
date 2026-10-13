/**
 * Se ejecuta una vez al iniciar el servidor. Tarea periódica: vence los pedidos impagos (devuelve su stock) y
 * reconcilia pagos, lo mismo que `npm run jobs`. Nada depende de ella: la confirmación de un pago compara el
 * vencimiento con el reloj de la base, y en producción `npm run jobs` se programa aparte (cron).
 * ponytail: temporizador dentro del proceso (cómodo en desarrollo y en un servidor de larga duración; idempotente
 * con varias instancias). En serverless o al escalar, solo el cron.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { runPaymentJobs } = await import("@/modules/payments");
  const g = globalThis as unknown as { orderExpiryTimer?: NodeJS.Timeout };
  // En desarrollo Next recarga módulos: un solo temporizador por proceso, que no impide que el proceso termine.
  // Sin base de datos basta una línea por minuto (no un stack trace); cualquier otro error se muestra completo.
  const report = (e: { code?: string; cause?: { code?: string } }) =>
    console.error("Error en las tareas de pedidos y pagos:", (e?.cause ?? e)?.code === "ECONNREFUSED" ? "la base de datos no responde (ECONNREFUSED)." : e);
  g.orderExpiryTimer ??= setInterval(() => runPaymentJobs().catch(report), 60_000).unref();
}
