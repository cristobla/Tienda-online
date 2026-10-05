/**
 * Control de acceso por roles. Los permisos viven en código: agregar un rol o permiso es editar este mapa.
 * ponytail: roles fijos en código; migrar a tablas roles/permissions si deben editarse desde el panel.
 */
export const PERMISSIONS = [
  "catalog:read",
  "catalog:write",
  "inventory:read",
  "inventory:adjust",
  "orders:read",
  "orders:manage",
  "customers:read",
  "customers:write",
  "reports:read",
  "users:manage",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type Role = "CUSTOMER" | "SALES" | "WAREHOUSE" | "ADMIN" | "SUPER_ADMIN";

const ADMIN: Permission[] = PERMISSIONS.filter((p) => p !== "users:manage");

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  CUSTOMER: [],
  SALES: ["catalog:read", "inventory:read", "orders:read", "orders:manage", "customers:read", "reports:read"],
  WAREHOUSE: ["catalog:read", "inventory:read", "inventory:adjust", "orders:read"],
  ADMIN,
  SUPER_ADMIN: PERMISSIONS,
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role): boolean {
  return role !== "CUSTOMER";
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Permiso requerido: ${permission}`);
    this.name = "ForbiddenError";
  }
}
