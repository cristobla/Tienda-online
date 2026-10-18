/**
 * Tareas para programar (cron, timer de systemd o el scheduler del hosting), p. ej. cada minuto:
 *   npm run jobs
 * Vence los pedidos impagos (libera su stock), reconcilia pagos (reprocesa eventos guardados sin terminar y consulta
 * al proveedor los intentos inciertos), envía los correos en cola y borra sesiones vencidas y carritos abandonados. Idempotente: puede correr junto al servidor.
 */
import { pool } from "@/db";
import { purgeExpiredSessions } from "@/modules/auth/session";
import { purgeStaleCarts } from "@/modules/cart";
import { sendPendingEmails } from "@/modules/mail";
import { runPaymentJobs } from "@/modules/payments";

const r = await runPaymentJobs();
const m = await sendPendingEmails();
await purgeExpiredSessions();
const carts = await purgeStaleCarts();
console.log(
  `Pedidos vencidos: ${r.expired} · eventos reprocesados: ${r.events} · intentos consultados: ${r.attempts} · correos enviados: ${m.sent}, fallidos: ${m.failed}, en espera: ${m.waiting} · carritos abandonados borrados: ${carts}`,
);
await pool.end();
