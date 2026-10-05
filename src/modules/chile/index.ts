/** Utilidades para el mercado chileno: RUT, teléfono y moneda. Sin dependencias. */

/** Normaliza "12.345.678-k" → "12345678-K". Devuelve null si no es un RUT válido (módulo 11). */
export function normalizeRut(input: string): string | null {
  const clean = input.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{1,8}[\dK]$/.test(clean)) return null;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return rutCheckDigit(body) === dv ? `${Number(body)}-${dv}` : null;
}

export function rutCheckDigit(body: string): string {
  let sum = 0;
  let factor = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

/** "12345678-5" → "12.345.678-5" (para mostrar). */
export function formatRut(normalized: string): string {
  const [body = "", dv = ""] = normalized.split("-");
  return `${Number(body).toLocaleString("es-CL")}-${dv}`;
}

/**
 * Normaliza teléfonos chilenos a E.164 (+56XXXXXXXXX, 9 dígitos tras el 56).
 * Acepta "9 1234 5678", "+56 9 1234 5678", "56912345678", "22 123 4567" (fijo Santiago).
 */
export function normalizeChileanPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("56") && digits.length === 11) digits = digits.slice(2);
  if (digits.length !== 9 || digits.startsWith("0")) return null;
  return `+56${digits}`;
}

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

/** 12990 → "$12.990" */
export function formatCLP(amount: number): string {
  return clp.format(amount);
}

/** IVA Chile: precios se guardan con IVA incluido; el neto se calcula al emitir documento. */
export const IVA_RATE = 0.19;
export function netFromGross(gross: number): { net: number; iva: number } {
  const net = Math.round(gross / (1 + IVA_RATE));
  return { net, iva: gross - net };
}
