/**
 * Se ejecuta una vez al iniciar el servidor. Tarea periódica: cancela los pedidos impagos con la reserva
 * vencida y devuelve su stock al disponible (además de la verificación al crear cada pedido).
 * ponytail: temporizador dentro del proceso (despliegue Docker de larga duración; idempotente con varias
 * instancias). Pasar a un cron/cola si se despliega en serverless o se escala.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { expireOrders } = await import("@/modules/orders");
  const g = globalThis as unknown as { orderExpiryTimer?: NodeJS.Timeout };
  // En desarrollo Next recarga módulos: un solo temporizador por proceso, que no impide que el proceso termine.
  g.orderExpiryTimer ??= setInterval(() => expireOrders().catch((e) => console.error("Error al vencer pedidos:", e)), 60_000).unref();
}
