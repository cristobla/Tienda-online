import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NavLink } from "@/components/admin/nav-link";
import { SITE } from "@/lib/site";
import { can, isStaff, type Permission } from "@/modules/auth/rbac";
import { getCurrentUser } from "@/modules/auth/session";
import { ROLE_LABELS } from "@/modules/auth/users";
import { logout } from "../auth-actions";

export const metadata: Metadata = {
  title: { template: `%s · Panel ${SITE.name}`, default: `Panel ${SITE.name}` },
  robots: { index: false, follow: false },
};

const NAV: { href: string; label: string; perm?: Permission }[] = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/productos", label: "Productos", perm: "catalog:read" },
  { href: "/admin/categorias", label: "Categorías", perm: "catalog:write" },
  { href: "/admin/marcas", label: "Marcas", perm: "catalog:write" },
  { href: "/admin/atributos", label: "Atributos", perm: "catalog:write" },
  { href: "/admin/usuarios", label: "Usuarios", perm: "users:manage" },
  { href: "/admin/auditoria", label: "Auditoría", perm: "audit:read" },
];

// Este layout solo arma el menú; cada página y cada acción verifica permisos por su cuenta.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/admin/login");
  const nav = NAV.filter((n) => !n.perm || can(user.role, n.perm));

  return (
    <div className="min-h-dvh bg-mist lg:grid lg:grid-cols-[14rem_1fr]">
      <aside className="border-b border-line lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:block">
          <Link href="/admin" className="text-xl font-extrabold text-leaf [font-stretch:80%]">
            {SITE.name} <span className="text-sm font-semibold text-muted [font-stretch:100%]">panel</span>
          </Link>
          <Link href="/" className="text-sm text-muted hover:text-leaf hover:underline lg:mt-1 lg:block">
            Ver tienda ↗
          </Link>
        </div>
        <nav aria-label="Panel" className="overflow-x-auto px-2 pb-2 lg:pb-0">
          <ul className="flex gap-1 lg:flex-col">
            {nav.map((n) => (
              <li key={n.href}>
                <NavLink href={n.href}>{n.label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden px-4 py-6 text-sm lg:block">
          <p className="truncate font-medium" title={user.email}>
            {user.email}
          </p>
          <p className="text-muted">{ROLE_LABELS[user.role]}</p>
          <form action={logout} className="mt-2">
            <button className="text-leaf hover:underline">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main id="contenido" className="min-w-0 px-4 py-6 lg:px-8">
        {children}
        <form action={logout} className="mt-10 text-sm lg:hidden">
          <span className="text-muted">{user.email} · </span>
          <button className="text-leaf hover:underline">Cerrar sesión</button>
        </form>
      </main>
    </div>
  );
}
