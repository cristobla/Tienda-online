import type { Metadata } from "next";
import { AdminForm, Submit, Text, TextArea } from "@/components/admin/form";
import { ButtonLink, PageHeader, Section } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { getSettings } from "@/modules/settings";
import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Datos de la tienda" };

export default async function StoreSettingsPage() {
  await requireStaffPage("settings:manage");
  const st = await getSettings();

  return (
    <>
      <PageHeader title="Datos de la tienda">
        <ButtonLink href="/admin/paginas" variant="plain">
          Páginas informativas
        </ButtonLink>
      </PageHeader>
      <p className="-mt-2 mb-6 max-w-2xl text-sm text-muted">
        Aparecen en el encabezado y el pie de la tienda, en los correos, en la imagen al compartir en redes y en los datos para buscadores. Lo que dejes vacío no se
        muestra.
      </p>
      <AdminForm action={saveSettingsAction} className="grid max-w-3xl gap-6">
        <Section title="Identidad">
          <div className="space-y-4">
            <Text name="name" label="Nombre de la tienda" initial={st.name} required maxLength={60} hint="Logo, título de las pestañas y correos." />
            <TextArea name="description" label="Descripción" initial={st.description} rows={2} required maxLength={200} hint="Una o dos frases para buscadores y redes." />
          </div>
        </Section>

        <Section title="Contacto">
          <div className="grid gap-4 sm:grid-cols-2">
            <Text name="email" label="Correo de contacto" type="email" initial={st.email} maxLength={200} placeholder="contacto@tutienda.cl" />
            <Text name="whatsapp" label="WhatsApp" type="tel" initial={st.whatsapp} maxLength={30} placeholder="9 1234 5678" hint="Celular; se muestra como enlace a WhatsApp." />
            <Text name="hours" label="Horario de atención" initial={st.hours} maxLength={120} placeholder="Lunes a viernes de 9:00 a 18:00" className="sm:col-span-2" />
          </div>
        </Section>

        <Section title="Redes sociales">
          <div className="space-y-4">
            <Text name="instagram" label="Instagram" type="url" initial={st.instagram} maxLength={300} placeholder="https://www.instagram.com/tu_tienda" />
            <Text name="facebook" label="Facebook" type="url" initial={st.facebook} maxLength={300} placeholder="https://www.facebook.com/tu_tienda" />
            <Text name="tiktok" label="TikTok" type="url" initial={st.tiktok} maxLength={300} placeholder="https://www.tiktok.com/@tu_tienda" />
          </div>
        </Section>

        <Section title="Avisos de pedidos">
          <Text
            name="orderNotifyEmail"
            label="Correo que recibe los pedidos nuevos"
            type="email"
            initial={st.orderNotifyEmail}
            maxLength={200}
            hint="Llega un correo con cada pedido nuevo (cliente, productos, total y enlace al panel). Vacío = sin aviso."
          />
        </Section>

        <div>
          <Submit>Guardar datos</Submit>
        </div>
      </AdminForm>
    </>
  );
}
