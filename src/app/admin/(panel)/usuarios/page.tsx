import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { listStaff, ROLE_LABELS } from "@/modules/auth/users";
import { formatDateTime } from "@/modules/chile";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const me = await requireStaffPage("users:manage");
  const users = await listStaff();
  return (
    <>
      <PageHeader title="Usuarios del panel">
        <ButtonLink href="/admin/usuarios/nuevo">Nuevo usuario</ButtonLink>
      </PageHeader>
      <Table head={["Email", "Rol", "Último ingreso", "Estado"]}>
        {users.map((u) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/usuarios/${u.id}`} className="font-semibold hover:text-leaf hover:underline">
                {u.email}
              </Link>
              {u.id === me.id && <span className="ml-2 text-xs text-muted">(tú)</span>}
            </td>
            <td>{ROLE_LABELS[u.role]}</td>
            <td className="text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}</td>
            <td>{u.active ? <Badge tone="ok">Activo</Badge> : <Badge tone="off">Desactivado</Badge>}</td>
          </tr>
        ))}
      </Table>
      <dl className="mt-6 grid max-w-3xl gap-2 text-sm text-muted sm:grid-cols-2">
        <div><dt className="inline font-semibold text-ink">Super administrador:</dt> <dd className="inline">todo, incluidos usuarios.</dd></div>
        <div><dt className="inline font-semibold text-ink">Administrador:</dt> <dd className="inline">todo menos usuarios.</dd></div>
        <div><dt className="inline font-semibold text-ink">Ventas:</dt> <dd className="inline">ve catálogo e inventario; gestiona pedidos y clientes.</dd></div>
        <div><dt className="inline font-semibold text-ink">Bodega:</dt> <dd className="inline">ve catálogo y pedidos; ajusta inventario.</dd></div>
      </dl>
    </>
  );
}
