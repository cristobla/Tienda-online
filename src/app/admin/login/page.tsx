import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { Icon } from "@/components/icons";
import { SITE } from "@/lib/site";
import { isStaff } from "@/modules/auth/rbac";
import { getCurrentUser } from "@/modules/auth/session";
import { login } from "../auth-actions";

export const metadata: Metadata = { title: "Ingresar al panel", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user && isStaff(user.role)) redirect("/admin");
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4">
      <div className="w-full max-w-sm rounded-md bg-white p-7">
        <p className="flex items-center gap-2 text-xl font-extrabold [font-stretch:80%]">
          <span className="grid size-8 place-items-center rounded-md bg-leaf text-white">
            <Icon name="drop" className="size-4" />
          </span>
          {SITE.name}
        </p>
        <h1 className="mb-5 mt-4 text-xl font-bold">Panel de administración</h1>
        <AdminForm action={login} className="space-y-4">
          <Text name="email" label="Email" type="email" autoComplete="username" required autoFocus />
          <Text name="password" label="Contraseña" type="password" autoComplete="current-password" required />
          <Submit>Ingresar</Submit>
        </AdminForm>
      </div>
    </main>
  );
}
