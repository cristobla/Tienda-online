/**
 * Límite de intentos fallidos de login por clave (IP+email y solo IP).
 * ponytail: en memoria de un proceso; con varias instancias, mover a la base de datos o a Redis.
 */
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; resetAt: number }>();

export function isBlocked(key: string, max: number, now = Date.now()): boolean {
  const f = failures.get(key);
  if (f && f.resetAt <= now) failures.delete(key);
  return (failures.get(key)?.count ?? 0) >= max;
}

export function registerFailure(key: string, now = Date.now()) {
  const f = failures.get(key);
  if (!f || f.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else f.count++;
  if (failures.size > 10_000) for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
}

export function clearFailures(key: string) {
  failures.delete(key);
}
