import type { Metadata } from "next";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { newTotpSecret, otpauthUrl } from "@/modules/auth/totp";
import { getUser, ROLE_LABELS } from "@/modules/auth/users";
import { getSettings } from "@/modules/settings";
import { changeOwnPasswordAction, totpAction } from "./actions";

export const metadata: Metadata = { title: "Mi cuenta" };

/** Para todo el personal, sin permiso especial: cada uno ve y cambia solo lo suyo. */
export default async function MyAccountPage() {
  const user = await requireStaffPage();
  const [me, st] = await Promise.all([getUser(user.id), getSettings()]);
  // Secreto nuevo en cada visita mientras no esté activa: viaja oculto en el formulario y se guarda solo si el código coincide.
  const secret = me?.has2fa ? null : newTotpSecret();

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

        <Section title="Verificación en dos pasos">
          {secret ? (
            <AdminForm action={totpAction.bind(null, "activar")} className="space-y-4 text-sm">
              <p>
                Además de la contraseña, al ingresar se pedirá un código de 6 dígitos de una app en tu celular. Si alguien obtiene tu contraseña, igual no
                podrá entrar. <strong>Recomendado para administradores.</strong>
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Instala Google Authenticator, Microsoft Authenticator o Authy en tu celular.</li>
                <li>
                  En la app, elige «Ingresar clave de configuración» y escribe esta clave (tipo «Basada en el tiempo»):
                  <code className="mt-1 block w-fit select-all rounded-md bg-mist px-3 py-2 font-mono text-base tracking-wider">{secret.match(/.{4}/g)!.join(" ")}</code>
                  <a href={otpauthUrl(secret, user.email, st.name)} className="mt-1 inline-block text-leaf hover:underline">
                    O ábrela directamente si estás en el celular
                  </a>
                </li>
                <li>Escribe el código que muestra la app y tu contraseña.</li>
              </ol>
              <input type="hidden" name="secret" value={secret} />
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <Text name="code" label="Código de la app" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
                <Text name="currentPassword" label="Tu contraseña" type="password" autoComplete="current-password" required />
              </div>
              <Submit>Activar</Submit>
            </AdminForm>
          ) : (
            <AdminForm action={totpAction.bind(null, "desactivar")} className="space-y-4 text-sm">
              <p className="font-semibold text-leaf-dark">Activa: al ingresar se pide el código de tu app.</p>
              <p className="text-muted">Para desactivarla, escribe un código actual y tu contraseña. Si perdiste el celular, pide a un super administrador que la quite.</p>
              <div className="grid max-w-md gap-4 sm:grid-cols-2">
                <Text name="code" label="Código de la app" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
                <Text name="currentPassword" label="Tu contraseña" type="password" autoComplete="current-password" required />
              </div>
              <Submit variant="danger">Desactivar</Submit>
            </AdminForm>
          )}
        </Section>
      </div>
    </>
  );
}
