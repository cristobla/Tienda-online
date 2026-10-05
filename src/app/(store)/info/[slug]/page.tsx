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
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Información" className="text-sm">
          <ul className="space-y-1">
            {Object.entries(PAGES).map(([slug, name]) => (
              <li key={slug}>
                <Link
                  href={`/info/${slug}`}
                  aria-current={name === title ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 ${name === title ? "bg-leaf-soft font-semibold text-leaf-dark" : "hover:bg-mist"}`}
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="max-w-prose">
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-4 rounded-md border border-dashed border-line bg-paper p-5 text-muted">
            Contenido pendiente: esta sección se completa con la información oficial de la tienda antes del lanzamiento.
          </p>
        </article>
      </div>
    </>
  );
}
