import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminForm, Check, Select, Submit, Text } from "@/components/admin/form";
import { PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password";
import { getUser, ROLE_LABELS, STAFF_ROLES } from "@/modules/auth/users";
import { createUserAction, setPasswordAction, updateUserAction } from "../actions";

export const metadata: Metadata = { title: "Usuario" };

const roles = STAFF_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));
const passwordHint = `Mínimo ${MIN_PASSWORD_LENGTH} caracteres. Compártela por un canal seguro.`;

/** /admin/usuarios/nuevo crea; con un id, edita. */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaffPage("users:manage");
  const { id } = await params;
  const back = { href: "/admin/usuarios", label: "Usuarios" };

  if (id === "nuevo")
    return (
      <>
        <PageHeader title="Nuevo usuario" back={back} />
        <Section title="Datos de acceso">
          <AdminForm action={createUserAction} className="max-w-md space-y-4">
            <Text name="email" label="Email" type="email" required autoComplete="off" />
            <Select name="role" label="Rol" initial="ADMIN" options={roles} />
            <Text name="password" label="Contraseña inicial" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" hint={passwordHint} />
            <Submit>Crear usuario</Submit>
          </AdminForm>
        </Section>
      </>
    );

  const u = z.uuid().safeParse(id).success ? await getUser(id) : null;
  if (!u || u.role === "CUSTOMER") notFound();
  const self = u.id === me.id;

  return (
    <>
      <PageHeader title={u.email} back={back} />
      <div className="grid max-w-2xl gap-6">
        <Section title="Rol y estado">
          {self ? (
            <p className="text-sm text-muted">
              Eres {ROLE_LABELS[u.role].toLowerCase()}. Tu propio rol y estado solo los puede cambiar otro super administrador.
            </p>
          ) : (
            <AdminForm action={updateUserAction.bind(null, u.id)} className="space-y-4">
              <Select name="role" label="Rol" initial={u.role} options={roles} />
              <Check name="active" label="Puede ingresar al panel" initial={u.active} hint="Al desactivar o cambiar el rol se cierran sus sesiones abiertas." />
              <Submit />
            </AdminForm>
          )}
        </Section>
        <Section title="Cambiar contraseña">
          <AdminForm action={setPasswordAction.bind(null, u.id)} className="max-w-md space-y-4">
            <Text name="password" label="Nueva contraseña" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" hint={passwordHint} />
            <Submit>Cambiar contraseña</Submit>
          </AdminForm>
        </Section>
      </div>
    </>
  );
}
