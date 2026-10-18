/**
 * Verificación en dos pasos (TOTP, RFC 6238: códigos de 6 dígitos cada 30 s, SHA-1), compatible con Google
 * Authenticator, Microsoft Authenticator, Authy o 1Password. Sin dependencias: HMAC de node:crypto.
 * shortcut: el secreto se guarda en claro en users.totp_secret (como la mayoría de las apps); cifrarlo con una clave
 * del servidor si la base pudiera filtrarse sin el servidor.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { UserError } from "@/lib/form";
import { audit } from "@/modules/audit";
import { verifyPassword } from "./password";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD = 30;

export function base32(buf: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string) {
  const clean = s.replace(/[\s=]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Secreto TOTP inválido");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160 bits aleatorios, en base32 (lo que se escribe en la app). */
export const newTotpSecret = () => base32(randomBytes(20));

export function totpCode(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Paso de tiempo que coincide con el código (se acepta ±30 s por desfase del reloj del celular), o null. */
export function matchTotp(secret: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(now / 1000 / PERIOD);
  for (const step of [current - 1, current, current + 1])
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(clean))) return step;
  return null;
}

/** Enlace para abrir la app de autenticación desde el celular (o escanear como QR). */
export const otpauthUrl = (secret: string, account: string, issuer: string) =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${PERIOD}`;

/**
 * Comprueba el código del ingreso y lo "gasta": el mismo código (o uno anterior) no sirve dos veces, aunque alguien
 * lo haya visto. Atómico: dos ingresos simultáneos con el mismo código, solo uno pasa.
 */
export async function consumeTotp(userId: string, secret: string, code: string, now = Date.now()) {
  const step = matchTotp(secret, code, now);
  if (step === null) return false;
  const [ok] = await db
    .update(users)
    .set({ totpLastStep: step })
    .where(and(eq(users.id, userId), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
    .returning({ id: users.id });
  return !!ok;
}

async function checkPassword(userId: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u?.active || !(await verifyPassword(u.passwordHash, password))) throw new UserError("La contraseña no es correcta.", "currentPassword");
  return u;
}

/** Activa: exige la contraseña y un código válido del secreto recién mostrado (prueba que la app quedó configurada). */
export async function enableTotp(userId: string, data: { secret: string; code: string; currentPassword: string }) {
  const u = await checkPassword(userId, data.currentPassword);
  if (u.totpSecret) throw new UserError("La verificación en dos pasos ya está activa.");
  if (!/^[A-Z2-7]{32}$/.test(data.secret)) throw new UserError("Vuelve a cargar la página e inténtalo de nuevo.");
  const step = matchTotp(data.secret, data.code);
  if (step === null) throw new UserError("El código no coincide. Revisa que la hora del celular esté al día.", "code");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpSecret: data.secret, totpLastStep: step }).where(eq(users.id, userId));
    await audit(tx, { userId, action: "user.2fa_enable", entityType: "user", entityId: userId });
  });
}

/** Desactiva la propia: contraseña y código actual. */
export async function disableTotp(userId: string, data: { code: string; currentPassword: string }) {
  const u = await checkPassword(userId, data.currentPassword);
  if (!u.totpSecret) return;
  if (!(await consumeTotp(userId, u.totpSecret, data.code))) throw new UserError("El código no es correcto.", "code");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpSecret: null, totpLastStep: null }).where(eq(users.id, userId));
    await audit(tx, { userId, action: "user.2fa_disable", entityType: "user", entityId: userId });
  });
}

/** Un super administrador la quita (celular perdido). La persona deberá activarla de nuevo. */
export async function resetTotp(actorId: string, id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.update(users).set({ totpSecret: null, totpLastStep: null }).where(eq(users.id, id)).returning({ id: users.id });
    if (!row) throw new UserError("El usuario no existe.");
    await audit(tx, { userId: actorId, action: "user.2fa_reset", entityType: "user", entityId: id });
  });
}
