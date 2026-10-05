import { db, pool } from ".";
import { loadReferenceData } from "./reference-data";

const n = await loadReferenceData(db);
console.log(`Datos de referencia cargados: ${n} comunas.`);
await pool.end();
