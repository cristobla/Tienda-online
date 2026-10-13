import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { inboundProvider, receiveProviderInput } from "@/modules/payments";

/**
 * Retorno del comprador desde la pasarela (GET o POST, según el proveedor). Solo identifica el intento por un valor
 * no adivinable; el resultado sale de la CONSULTA al proveedor, nunca de parámetros como "approved".
 * No usa la sesión del comprador: el pedido se identifica por el intento.
 */
async function handle(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const p = await inboundProvider((await params).provider);
  // Pendiente, sin configurar o sin retorno: para el exterior no existe (ni aprueba ni responde un ejemplo).
  if (!p?.provider.parseReturn || !p.provider.capabilities.browserReturn) return new NextResponse(null, { status: 404 });
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) return new NextResponse(null, { status: 413 });
  let parsed: Awaited<ReturnType<NonNullable<typeof p.provider.parseReturn>>>;
  try {
    parsed = await p.provider.parseReturn(req);
  } catch {
    return new NextResponse("Retorno inválido.", { status: 400 });
  }
  const r = await receiveProviderInput(p.provider.id, "return", { eventId: null, ...parsed });
  // Destino armado desde APP_URL (no del Host ni de un returnUrl recibido) y con el pedido del intento encontrado.
  return NextResponse.redirect(new URL(r.orderId ? `/pedido/${r.orderId}` : "/", env.APP_URL), 303);
}

export const GET = handle;
export const POST = handle;
