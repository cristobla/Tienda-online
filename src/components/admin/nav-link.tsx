"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

export function NavLink({ href, icon, children }: { href: string; icon: IconName; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/admin" ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-leaf text-white" : "text-white/75 hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon name={icon} className="size-[1.1rem] shrink-0" />
      {children}
    </Link>
  );
}
