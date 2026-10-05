import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { auditLogs, users } from "@/db/schema";

export type AuditEntry = {
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

/** Registrar SIEMPRE con la misma `tx` del cambio: si el cambio se revierte, el registro también. */
export async function audit(tx: Tx, e: AuditEntry) {
  await tx.insert(auditLogs).values({ ...e, before: e.before ?? null, after: e.after ?? null });
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAudit(filters: { entityType?: string; entityId?: string; page?: number } = {}) {
  const where: SQL[] = [];
  if (filters.entityType) where.push(eq(auditLogs.entityType, filters.entityType));
  if (filters.entityId) where.push(eq(auditLogs.entityId, filters.entityId));
  const page = filters.page ?? 1;
  return db
    .select({ log: auditLogs, email: users.email })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(...where))
    .orderBy(desc(auditLogs.id))
    .limit(AUDIT_PAGE_SIZE + 1) // uno extra para saber si hay página siguiente
    .offset((page - 1) * AUDIT_PAGE_SIZE);
}

/** Campos que cambiaron entre `before` y `after` (comparación superficial de JSON). */
export function changedFields(before: unknown, after: unknown) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => k !== "updatedAt" && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ field: k, before: b[k], after: a[k] }));
}
