/**
 * Corre antes de `npm run dev` y `npm run start`: asegura que PostgreSQL responda.
 * Si no responde (típico después de reiniciar el PC), abre Docker Desktop y levanta el contenedor de la base;
 * si aun así no hay base, explica qué hacer en vez de llenar cada página de errores de conexión.
 */
import { execSync } from "node:child_process";
import pg from "pg";

async function ping() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

// Si un comando falla (Docker no instalado, PostgreSQL local sin Docker…), igual se verifica la conexión al final.
const run = (cmd) => {
  try {
    execSync(cmd, { stdio: "inherit", timeout: 180_000 });
  } catch {}
};

// En producción no se levanta nada: docker-compose.yml es la base de DESARROLLO (credenciales de prueba).
const dev = process.env.NODE_ENV !== "production";

if (!(await ping())) {
  if (dev) {
    console.log("La base de datos no responde: iniciando Docker Desktop y el contenedor de PostgreSQL (puede tardar un minuto)…");
    run("docker desktop start --timeout 150");
    run("docker compose up -d --wait");
  }
  if (!(await ping())) {
    console.error(
      dev
        ? "\nNo se pudo conectar a PostgreSQL (DATABASE_URL en .env).\n" +
            '  1. Abre Docker Desktop y espera a que indique "Engine running".\n' +
            "  2. Ejecuta: docker compose up -d\n" +
            "  3. Vuelve a ejecutar el comando.\n"
        : "\nNo se pudo conectar a PostgreSQL: revisa DATABASE_URL y que el servidor de base de datos esté accesible.\n",
    );
    process.exit(1);
  }
  console.log("Base de datos lista.");
}
