import { NextResponse } from "next/server";
import { isBlocked, registerFailure } from "@/modules/auth/rate-limit";
import { inboundProvider, receiveProviderInput } from "@/modules/payments";

const MAX_BYTES = 65_536;

/**
 * Notificación servidor a servidor. Su autenticidad la valida el adaptador según el protocolo del proveedor (firma,
 * consulta del recurso); nunca la cookie de un usuario. Se guarda antes de procesar: un 200 solo se responde con el
 * evento ya guardado y aplicado; si el proceso falla queda guardado para reintentar (500 → el proveedor reenvía).
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = await inboundProvider((await params).provider);
  if (!p?.provider.parseWebhook || !p.provider.capabilities.webhook) return new NextResponse(null, { status: 404 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `webhook:${p.provider.id}:${ip}`;
  if (isBlocked(key, 30)) return new NextResponse(null, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES || !req.headers.get("content-type")?.includes("application/json"))
    return new NextResponse(null, { status: 415 });
  let parsed: Awaited<ReturnType<NonNullable<typeof p.provider.parseWebhook>>>;
  try {
    parsed = await p.provider.parseWebhook(req, p.ctx);
  } catch {
    registerFailure(key); // entradas inválidas repetidas desde la misma IP: se bloquean un rato
    return new NextResponse(null, { status: 400 });
  }
  const r = await receiveProviderInput(p.provider.id, "webhook", parsed);
  return new NextResponse(null, { status: r.event.status === "FAILED" ? 500 : 200 });
}
