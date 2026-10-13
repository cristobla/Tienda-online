import { env } from "@/lib/env";

/**
 * IP del cliente para los límites de intentos. Cada proxy propio agrega al final de X-Forwarded-For la IP que vio:
 * con N proxies confiables (TRUSTED_PROXY_HOPS) la real es la N-ésima desde el final; lo anterior lo pudo escribir
 * el cliente. Sin proxies (local) no se confía en el encabezado.
 */
export function clientIp(headers: Headers, hops = env.TRUSTED_PROXY_HOPS): string {
  if (hops <= 0) return "local";
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? "desconocida";
}
