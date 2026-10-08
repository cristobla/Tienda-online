import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { inboundProvider, receiveProviderInput, simulator } from "@/modules/payments";

const TOKEN = /^sim_[0-9a-f]{32}$/;
const DECISIONS = ["PAID", "FAILED", "CANCELLED", "OTHER_AMOUNT", "TIMEOUT", "WEBHOOK_ONLY"] as const;
export type SimDecision = (typeof DECISIONS)[number];

/**
 * "Servidor de la pasarela" simulada: el comprador decide y vuelve a la tienda con una navegación completa al
 * retorno, como en una pasarela real (la tienda se entera por el retorno o la notificación + consulta).
 * Solo existe con el simulador habilitado (APP_ENV local/test + PAYMENT_SIMULATION=on); si no, 404.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = TOKEN.test(token) ? simulator.get(token) : undefined;
  if (!(await inboundProvider("simulado")) || !s) return new NextResponse(null, { status: 404 });
  if (req.headers.get("origin") !== new URL(env.APP_URL).origin) return new NextResponse(null, { status: 403 });
  const decision = String((await req.formData()).get("d")) as SimDecision;
  if (!DECISIONS.includes(decision)) return new NextResponse(null, { status: 400 });

  if (decision === "OTHER_AMOUNT") simulator.decide(token, "PAID", s.amount + 1000);
  else if (decision === "TIMEOUT") {
    simulator.decide(token, "PAID");
    simulator.timeouts(token, 1); // la consulta del retorno no responde: queda incierto hasta la reconciliación
  } else if (decision === "WEBHOOK_ONLY") {
    simulator.decide(token, "PAID");
    // El comprador cierra la pestaña: solo llega la notificación servidor a servidor.
    await receiveProviderInput("simulado", "webhook", { eventId: randomUUID(), externalId: token, payload: { token } });
    return NextResponse.redirect(new URL(`/pago/simulado/${token}?notificado=1`, env.APP_URL), 303);
  } else simulator.decide(token, decision);
  return NextResponse.redirect(new URL(`/api/payments/simulado/return?token=${token}`, env.APP_URL), 303);
}
