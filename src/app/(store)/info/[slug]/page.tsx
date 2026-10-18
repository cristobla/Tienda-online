import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/store/catalog-view";
import { Markdown, MARKDOWN_CLASS } from "@/lib/markdown";
import { formatPhone, mapsLink, socialLinks, storeAddressLine, whatsappUrl } from "@/lib/site";
import { getInfoPage, getSettings, INFO_PAGES } from "@/modules/settings";

// Páginas informativas del pie. El texto se redacta en el panel (/admin/paginas); sin texto, "contenido pendiente".
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getInfoPage((await params).slug);
  // A los buscadores solo se ofrece lo que ya tiene texto oficial.
  return page ? { title: page.title, robots: { index: !!page.body.trim(), follow: true } } : {};
}

export default async function InfoPage({ params }: Props) {
  const page = await getInfoPage((await params).slug);
  if (!page) notFound();
  // Contacto muestra además los datos de la tienda guardados en el panel.
  const st = page.slug === "contacto" ? await getSettings() : null;
  const contact = st && [
    st.email && { label: "Correo", value: st.email, href: `mailto:${st.email}` },
    st.whatsapp && { label: "WhatsApp", value: formatPhone(st.whatsapp), href: whatsappUrl(st.whatsapp) },
    storeAddressLine(st) && { label: "Local", value: storeAddressLine(st)!, href: mapsLink(st)! },
    st.hours && { label: "Horario de atención", value: st.hours },
    ...socialLinks(st).map((l) => ({ label: l.label, value: l.url.replace(/^https:\/\/(www\.)?/, ""), href: l.url })),
  ].filter((c) => !!c);

  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: page.title }]} />
      <div className="mt-2 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Información" className="text-sm">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {Object.entries(INFO_PAGES).map(([slug, name]) => (
              <li key={slug}>
                <Link
                  href={`/info/${slug}`}
                  aria-current={slug === page.slug ? "page" : undefined}
                  className={`block rounded-full px-4 py-2 transition-colors ${slug === page.slug ? "bg-ink font-semibold text-white" : "bg-paper hover:bg-mist lg:bg-transparent"}`}
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 max-w-prose">
          <p className="etiqueta text-leaf">Información</p>
          <h1 className="rotulo mt-2 text-display">{page.title}</h1>
          {page.body.trim() ? (
            <div className={`mt-6 ${MARKDOWN_CLASS}`}>
              <Markdown text={page.body} />
            </div>
          ) : (
            !contact?.length && (
              <p className="mt-6 rounded-[1.25rem] border border-dashed border-ink/25 bg-paper p-6 text-muted">
                Contenido pendiente: esta sección se completa con la información oficial de la tienda antes del lanzamiento.
              </p>
            )
          )}
          {contact && contact.length > 0 && (
            <dl className="mt-8 grid gap-3 rounded-[1.5rem] bg-paper p-6 ring-1 ring-line sm:grid-cols-2">
              {contact.map((c) => (
                <div key={c.label}>
                  <dt className="etiqueta text-leaf-dark">{c.label}</dt>
                  <dd className="mt-1 break-words font-semibold">
                    {"href" in c && c.href ? (
                      <a href={c.href} rel="noopener" target={c.href.startsWith("mailto:") ? undefined : "_blank"} className="underline-offset-4 hover:text-leaf-dark hover:underline">
                        {c.value}
                      </a>
                    ) : (
                      c.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </article>
      </div>
    </>
  );
}
