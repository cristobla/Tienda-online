/**
 * Estado que devuelven las server actions del panel a sus formularios.
 * `values` devuelve lo enviado para no perder lo escrito si hay errores; `v` cambia en cada respuesta
 * para que el formulario se vuelva a montar con esos valores.
 */
import { z } from "zod";

export type FormState = {
  v?: number;
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
  message?: string;
};

export class UserError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/** FormData → objeto plano de strings (los archivos se omiten; los checkbox ausentes quedan ausentes). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

/** Lo que se devuelve al navegador para rellenar el formulario: nunca contraseñas. */
function echo(fd: FormData): Record<string, string> {
  const out = formObject(fd);
  for (const k of Object.keys(out)) if (/password/i.test(k)) delete out[k];
  return out;
}

export function fail(prev: FormState, fd: FormData, error?: string, errors?: Record<string, string>): FormState {
  return { v: (prev.v ?? 0) + 1, error: error ?? "Revisa los campos marcados.", errors, values: echo(fd) };
}

export function done(prev: FormState, message: string): FormState {
  return { v: (prev.v ?? 0) + 1, message };
}

/** Primer error de Zod por campo: { price: "Debe ser mayor o igual a 0" }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".")] ??= issue.message;
  return out;
}

/** Código y restricción de un error de PostgreSQL (Drizzle lo envuelve en `cause`). */
export function pgError(e: unknown): { code?: string; constraint?: string } {
  for (let x = e as { code?: unknown; constraint?: string; cause?: unknown } | undefined; x; x = x.cause as typeof x)
    if (typeof x.code === "string" && /^[0-9A-Z]{5}$/.test(x.code)) return { code: x.code, constraint: x.constraint };
  return {};
}

/**
 * Traduce errores conocidos a mensajes para el formulario. Lo desconocido se relanza (error 500 real, no se oculta).
 * `unique` mapea restricción única → campo; `restrictMessage` se usa cuando un FK impide borrar.
 */
export function handleError(
  e: unknown,
  prev: FormState,
  fd: FormData,
  opts: { unique?: Record<string, string>; restrictMessage?: string } = {},
): FormState {
  if (e instanceof UserError) return fail(prev, fd, e.field ? undefined : e.message, e.field ? { [e.field]: e.message } : undefined);
  const { code, constraint } = pgError(e);
  if (code === "23505") {
    const field = Object.entries(opts.unique ?? {}).find(([c]) => constraint?.includes(c))?.[1];
    return field ? fail(prev, fd, undefined, { [field]: "Ya existe otro registro con este valor." }) : fail(prev, fd, "Ya existe un registro con esos datos.");
  }
  if (code === "23503" && opts.restrictMessage) return fail(prev, fd, opts.restrictMessage);
  if (code === "23514") return fail(prev, fd, `Valor no permitido (${constraint}).`);
  throw e;
}

// ── Coerciones para campos de formulario (todo llega como string) ──

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const num = (min: number, max: number) =>
  z.coerce.number({ error: "Debe ser un número" }).int("Debe ser un número entero").min(min, `Mínimo ${min}`).max(max, `Máximo ${max}`);

export const field = {
  text: (max: number) => z.string({ error: "Obligatorio" }).trim().min(1, "Obligatorio").max(max, `Máximo ${max} caracteres`),
  /** Vacío → null. */
  optText: (max: number) => z.preprocess(blank, z.string().trim().max(max, `Máximo ${max} caracteres`).nullish()).transform((v) => v ?? null),
  int: (min = 0, max = 100_000_000) => z.preprocess((v) => blank(v) ?? NaN, num(min, max)),
  /** Vacío → null. */
  optInt: (min = 0, max = 100_000_000) => z.preprocess(blank, num(min, max).nullish()).transform((v) => v ?? null),
  /** Checkbox: presente = true. */
  bool: () => z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  optUuid: () => z.preprocess(blank, z.uuid("Valor inválido").nullish()).transform((v) => v ?? null),
};
