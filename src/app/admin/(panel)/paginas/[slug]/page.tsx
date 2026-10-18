import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminForm, Submit, TextArea } from "@/components/admin/form";
import { ButtonLink, PageHeader, Section } from "@/components/admin/ui";
import { Markdown, MARKDOWN_CLASS } from "@/lib/markdown";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatDateTime } from "@/modules/chile";
import { getInfoPage } from "@/modules/settings";
import { savePageAction } from "../actions";

export const metadata: Metadata = { title: "Página informativa" };

const SYNTAX = [
  ["# Título", "título de sección"],
  ["## Subtítulo", "subtítulo"],
  ["- texto", "lista con viñetas"],
  ["1. texto", "lista numerada"],
  ["**texto**", "negrita"],
  ["*texto*", "cursiva"],
  ["línea en blanco", "nuevo párrafo"],
];

export default async function InfoPageEditor({ params }: { params: Promise<{ slug: string }> }) {
  await requireStaffPage("settings:manage");
  const page = await getInfoPage((await params).slug);
  if (!page) notFound();

  return (
    <>
      <PageHeader title={page.title} back={{ href: "/admin/paginas", label: "Páginas informativas" }}>
        <ButtonLink href={`/info/${page.slug}`} variant="plain">
          Ver en la tienda
        </ButtonLink>
      </PageHeader>
      {page.updatedAt && <p className="-mt-4 mb-6 text-sm text-muted">Última edición: {formatDateTime(page.updatedAt)}</p>}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_17rem]">
        <AdminForm action={savePageAction.bind(null, page.slug)} className="space-y-4">
          <TextArea
            name="body"
            label="Texto"
            initial={page.body}
            rows={18}
            maxLength={20_000}
            hint="Escribe la información oficial de la tienda. Vacío = la tienda muestra «Contenido pendiente»."
          />
          <Submit>Guardar página</Submit>
        </AdminForm>

        <Section title="Formato">
          <dl className="space-y-2 text-sm">
            {SYNTAX.map(([code, what]) => (
              <div key={code} className="flex justify-between gap-3">
                <dt className="font-mono text-xs">{code}</dt>
                <dd className="text-right text-muted">{what}</dd>
              </div>
            ))}
          </dl>
          {page.slug === "contacto" && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">El correo, WhatsApp, horario y redes de «Datos de la tienda» se muestran solos debajo de este texto.</p>
          )}
        </Section>
      </div>

      {page.body.trim() && (
        <div className="mt-8">
          <Section title="Así se ve en la tienda">
            <div className={MARKDOWN_CLASS}>
              <Markdown text={page.body} />
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
