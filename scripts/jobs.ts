/**
 * Tareas de pagos para programar (cron, timer de systemd o el scheduler del hosting), p. ej. cada minuto:
 *   npm run jobs
 * Vence los pedidos impagos (libera su stock) y reconcilia pagos: reprocesa eventos guardados sin terminar y
 * consulta al proveedor los intentos inciertos. Idempotente: puede correr junto al servidor o repetirse sin duplicar nada.
 */
import { pool } from "@/db";
import { runPaymentJobs } from "@/modules/payments";

const r = await runPaymentJobs();
console.log(`Pedidos vencidos: ${r.expired} · eventos reprocesados: ${r.events} · intentos consultados: ${r.attempts}`);
await pool.end();
