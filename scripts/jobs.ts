/**
 * Tareas para programar (cron, timer de systemd o el scheduler del hosting), p. ej. cada minuto:
 *   npm run jobs
 * Vence los pedidos impagos (libera su stock), reconcilia pagos (reprocesa eventos guardados sin terminar y consulta
 * al proveedor los intentos inciertos) y envía los correos en cola. Idempotente: puede correr junto al servidor.
 */
import { pool } from "@/db";
import { sendPendingEmails } from "@/modules/mail";
import { runPaymentJobs } from "@/modules/payments";

const r = await runPaymentJobs();
const m = await sendPendingEmails();
console.log(
  `Pedidos vencidos: ${r.expired} · eventos reprocesados: ${r.events} · intentos consultados: ${r.attempts} · correos enviados: ${m.sent}, fallidos: ${m.failed}, en espera: ${m.waiting}`,
);
await pool.end();
