import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";
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

const NAV: { href: string; label: string; icon: IconName; perm?: Permission }[] = [
  { href: "/admin", label: "Inicio", icon: "chart" },
  { href: "/admin/productos", label: "Productos", icon: "box", perm: "catalog:read" },
  { href: "/admin/categorias", label: "Categorías", icon: "layers", perm: "catalog:write" },
  { href: "/admin/marcas", label: "Marcas", icon: "tag", perm: "catalog:write" },
  { href: "/admin/atributos", label: "Atributos", icon: "sliders", perm: "catalog:write" },
  { href: "/admin/usuarios", label: "Usuarios", icon: "users", perm: "users:manage" },
  { href: "/admin/auditoria", label: "Auditoría", icon: "list", perm: "audit:read" },
];

// Este layout solo arma el menú; cada página y cada acción verifica permisos por su cuenta.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user.role)) redirect("/admin/login");
  const nav = NAV.filter((n) => !n.perm || can(user.role, n.perm));

  return (
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[15rem_1fr]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-2">
        Saltar al contenido
      </a>
      <aside className="bg-ink text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:py-5">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-leaf">
              <Icon name="drop" className="size-4" />
            </span>
            <span className="text-xl font-extrabold [font-stretch:80%]">
              {SITE.name} <span className="text-sm font-semibold text-white/60 [font-stretch:100%]">panel</span>
            </span>
          </Link>
          <Link href="/" className="flex items-center gap-1 text-sm text-white/70 hover:text-white hover:underline lg:hidden">
            Ver tienda
            <Icon name="external" className="size-4" />
          </Link>
        </div>
        <nav aria-label="Panel" className="overflow-x-auto px-3 pb-3 lg:flex-1 lg:pb-0">
          <p className="mb-2 hidden px-3 text-xs font-semibold uppercase tracking-wider text-white/40 lg:block">Gestión</p>
          <ul className="flex gap-1 lg:flex-col">
            {nav.map((n) => (
              <li key={n.href}>
                <NavLink href={n.href} icon={n.icon}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden border-t border-white/10 p-4 text-sm lg:block">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 font-bold uppercase">{user.email[0]}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium" title={user.email}>
                {user.email}
              </span>
              <span className="block text-xs text-white/60">{ROLE_LABELS[user.role]}</span>
            </span>
          </div>
          <form action={logout} className="mt-3">
            <button className="flex items-center gap-2 text-white/70 hover:text-white hover:underline">
              <Icon name="logout" className="size-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="hidden items-center justify-between border-b border-line bg-white px-8 py-3 text-sm lg:flex">
          <span className="text-muted">Administración de la tienda</span>
          <Link href="/" className="flex items-center gap-1 font-medium text-leaf hover:underline">
            Ver tienda
            <Icon name="external" className="size-4" />
          </Link>
        </div>
        <main id="contenido" className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
          <form action={logout} className="mt-10 border-t border-line pt-4 text-sm lg:hidden">
            <span className="text-muted">
              {user.email} · {ROLE_LABELS[user.role]} ·{" "}
            </span>
            <button className="font-medium text-leaf hover:underline">Cerrar sesión</button>
          </form>
        </main>
      </div>
    </div>
  );
}
