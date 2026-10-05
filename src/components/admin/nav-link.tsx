"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/admin" ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-leaf text-white" : "hover:bg-white"}`}
    >
      {children}
    </Link>
  );
}
