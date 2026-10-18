import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/store/catalog-view";

// Páginas informativas del pie. El texto legal y de contacto real se redacta antes de abrir la tienda.
const PAGES: Record<string, string> = {
  ayuda: "Preguntas frecuentes",
  despacho: "Despacho y retiro",
  cambios: "Cambios y devoluciones",
  contacto: "Contacto",
  terminos: "Términos y condiciones",
  privacidad: "Política de privacidad",
};

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const title = PAGES[(await params).slug];
  return title ? { title, robots: { index: false, follow: true } } : {};
}

export default async function InfoPage({ params }: Props) {
  const title = PAGES[(await params).slug];
  if (!title) notFound();
  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: title }]} />
      <div className="mt-2 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Información" className="text-sm">
          <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {Object.entries(PAGES).map(([slug, name]) => (
              <li key={slug}>
                <Link
                  href={`/info/${slug}`}
                  aria-current={name === title ? "page" : undefined}
                  className={`block rounded-full px-4 py-2 transition-colors ${name === title ? "bg-ink font-semibold text-white" : "bg-paper hover:bg-mist lg:bg-transparent"}`}
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-prose">
          <p className="etiqueta text-leaf">Información</p>
          <h1 className="rotulo mt-2 text-display">{title}</h1>
          <p className="mt-6 rounded-[1.25rem] border border-dashed border-ink/25 bg-paper p-6 text-muted">
            Contenido pendiente: esta sección se completa con la información oficial de la tienda antes del lanzamiento.
          </p>
        </article>
      </div>
    </>
  );
}
