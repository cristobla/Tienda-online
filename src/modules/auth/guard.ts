import { redirect } from "next/navigation";
import { can, isStaff, type Permission } from "./rbac";
import { getCurrentUser } from "./session";

/**
 * Verificación para PÁGINAS del panel (las server actions usan requirePermission).
 * Va en cada página, no solo en el layout: los layouts no se re-ejecutan al navegar.
 */
export async function requireStaffPage(permission?: Permission) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/admin/login");
  if (permission && !can(user.role, permission)) redirect("/admin?sin_permiso=1");
  return user;
}
