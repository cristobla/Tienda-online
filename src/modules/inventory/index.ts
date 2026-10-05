import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { inventoryMovements, movementType, productVariants } from "@/db/schema";

export type MovementType = (typeof movementType.enumValues)[number];

/**
 * ÚNICA puerta para cambiar stock_on_hand. Llamar dentro de una transacción.
 * El UPDATE bloquea la fila, así previous/resulting son exactos aunque haya cambios simultáneos;
 * los CHECK de la base rechazan cualquier resultado negativo o menor a lo reservado.
 */
export async function applyMovement(
  tx: Tx,
  m: { variantId: string; type: MovementType; quantity: number; reason?: string; referenceType?: string; referenceId?: string; userId?: string | null },
) {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) throw new Error("La cantidad del movimiento debe ser un entero distinto de 0.");
  const [row] = await tx
    .update(productVariants)
    .set({ stockOnHand: sql`${productVariants.stockOnHand} + ${m.quantity}` })
    .where(eq(productVariants.id, m.variantId))
    .returning({ stock: productVariants.stockOnHand });
  if (!row) throw new Error(`Variante ${m.variantId} no existe.`);
  const [movement] = await tx
    .insert(inventoryMovements)
    .values({
      variantId: m.variantId,
      type: m.type,
      quantity: m.quantity,
      previousStock: row.stock - m.quantity,
      resultingStock: row.stock,
      reason: m.reason,
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      createdBy: m.userId ?? null,
    })
    .returning();
  return movement!;
}
