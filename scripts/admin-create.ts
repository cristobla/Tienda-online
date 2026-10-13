/**
 * Crea un Super Admin. Sirve para el primer usuario en producción, donde el seed no corre:
 *   npm run admin:create -- correo@dominio.cl
 * Pide la contraseña dos veces sin mostrarla. Si la entrada no es una terminal (p. ej. la consola del hosting),
 * la lee de la primera línea de la entrada estándar. Nunca se pasa como argumento (quedaría en el historial).
 */
import { pool } from "@/db";
import { pgError } from "@/lib/form";
import { createStaffUser, newUserSchema } from "@/modules/auth/users";

/** Lee una línea sin eco en la terminal. */
function askHidden(question: string): Promise<string> {
  process.stdout.write(question);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        value = ch === "\u007f" || ch === "\b" ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword() {
  if (!process.stdin.isTTY) {
    let all = "";
    for await (const chunk of process.stdin) all += chunk;
    return all.split(/\r?\n/)[0] ?? "";
  }
  const first = await askHidden("Contraseña (mínimo 10 caracteres): ");
  if (first !== (await askHidden("Repite la contraseña: "))) throw new Error("Las contraseñas no coinciden.");
  return first;
}

try {
  const email = process.argv[2] ?? "";
  if (!email) throw new Error("Uso: npm run admin:create -- correo@dominio.cl");
  const input = newUserSchema.safeParse({ email, role: "SUPER_ADMIN", password: await readPassword() });
  if (!input.success) throw new Error(input.error.issues.map((i) => i.message).join(" · "));
  const user = await createStaffUser(null, input.data);
  console.log(`Super Admin creado: ${user.email}. Ingresa en /admin/login.`);
} catch (e) {
  console.error(pgError(e).code === "23505" ? "Ya existe un usuario con ese email." : e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
