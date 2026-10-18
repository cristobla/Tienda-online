import type { Metadata } from "next";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { ROLE_LABELS } from "@/modules/auth/users";
import { changeOwnPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Mi cuenta" };

/** Para todo el personal, sin permiso especial: cada uno ve y cambia solo lo suyo. */
export default async function MyAccountPage() {
  const user = await requireStaffPage();

  return (
    <>
      <PageHeader title="Mi cuenta" />
      <div className="grid max-w-2xl gap-6">
        <Section title="Datos de acceso">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="break-all font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted">Rol</dt>
              <dd className="font-medium">{ROLE_LABELS[user.role]}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">El email y el rol los cambia un super administrador.</p>
        </Section>

        <Section title="Cambiar contraseña">
          <AdminForm action={changeOwnPasswordAction} className="max-w-md space-y-4">
            <Text name="currentPassword" label="Contraseña actual" type="password" required autoComplete="current-password" />
            <Text
              name="password"
              label="Nueva contraseña"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Al cambiarla se cierran tus sesiones en otros equipos.`}
            />
            <Text name="passwordConfirm" label="Repite la nueva contraseña" type="password" required autoComplete="new-password" />
            <Submit>Cambiar contraseña</Submit>
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
