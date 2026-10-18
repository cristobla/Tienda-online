import type { orderStatus } from "@/db/schema";

/** Pedidos vendidos: el pago se verificó y no se anuló ni devolvió. Sin dependencias: lo usan pedidos, pagos y correos. */
export const SOLD_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const satisfies readonly (typeof orderStatus.enumValues)[number][];

export const isSold = (status: string) => (SOLD_STATUSES as readonly string[]).includes(status);
