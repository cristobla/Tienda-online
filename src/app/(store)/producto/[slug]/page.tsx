import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, type SP } from "@/components/store/catalog-view";
import { Fleje, ProductGrid } from "@/components/store/product-card";
import { env } from "@/lib/env";
import { Markdown } from "@/lib/markdown";
import { contentLabel } from "@/modules/catalog/pricing";
import { describeAttributes, getProductBySlug, relatedProducts } from "@/modules/catalog/queries";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SP> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getProductBySlug((await params).slug);
  if (!data) return {};
  const { product: p, images } = data;
  const description = p.metaDescription ?? p.shortDescription ?? undefined;
  return {
    title: p.metaTitle ?? p.name,
    description,
    alternates: { canonical: `/producto/${p.slug}` },
    openGraph: { title: p.name, description, images: images.slice(0, 1).map((i) => ({ url: i.url, alt: i.alt })) },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const data = await getProductBySlug((await params).slug);
  if (!data) notFound();
  const { product, brand, categoryPath, variants, images, attributeDefs } = data;

  // La variante elegida va en la URL (?variante=SKU): enlazable y funciona sin JavaScript.
  const wanted = [(await searchParams).variante].flat()[0];
  const selected = variants.find((v) => v.sku === wanted) ?? variants.find((v) => v.available > 0) ?? variants[0]!;
  const image = images.find((i) => i.variantId === selected.id) ?? images[0];
  const content = contentLabel(selected);
  const specs = [
    ...(variants.length > 1 && selected.name !== content ? [{ code: "_presentacion", label: "Presentación", value: selected.name }] : []),
    ...(content ? [{ code: "_contenido", label: "Contenido", value: content }] : []),
    ...describeAttributes({ ...product.attributes, ...selected.attributes }, attributeDefs),
  ];
  const related = await relatedProducts(product.id, product.categoryId);

  const url = `${env.APP_URL}/producto/${product.slug}`;
  const offer = (v: (typeof variants)[number]) => ({
    "@type": "Offer",
    sku: v.sku,
    price: v.price,
    priceCurrency: "CLP",
    availability: `https://schema.org/${v.available > 0 ? "InStock" : "OutOfStock"}`,
    url: `${url}?variante=${encodeURIComponent(v.sku)}`,
  });
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription ?? undefined,
    sku: selected.sku,
    gtin13: selected.barcode ?? undefined,
    image: images.map((i) => new URL(i.url, env.APP_URL).href),
    brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
    offers: variants.length > 1 ? variants.map(offer) : offer(selected),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify escapa comillas; "<" se escapa para que el texto no pueda cerrar el <script>.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Breadcrumbs
        items={[{ name: "Inicio", href: "/" }, ...categoryPath.map((c) => ({ name: c.name, href: `/categoria/${c.slug}` })), { name: product.name }]}
      />

      <div className="mt-4 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="relative grid aspect-square place-items-center overflow-hidden rounded-md bg-mist">
            {image ? (
              <Image src={image.url} alt={image.alt || product.name} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-contain p-8" />
            ) : (
              <span aria-hidden className="px-6 text-center text-6xl font-bold text-leaf/70 [font-stretch:75%]">
                {selected.name}
              </span>
            )}
          </div>
          {images.length > 1 && (
            <ul className="mt-3 grid grid-cols-5 gap-2">
              {images.map((i) => (
                <li key={i.id} className="relative aspect-square overflow-hidden rounded-md bg-mist">
                  <Image src={i.url} alt={i.alt} fill sizes="10vw" className="object-contain p-1" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="max-w-xl">
          {brand && (
            <Link href={`/marca/${brand.slug}`} className="text-sm font-medium text-muted hover:text-leaf hover:underline">
              {brand.name}
            </Link>
          )}
          <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
          {product.shortDescription && <p className="mt-3 text-lg text-muted">{product.shortDescription}</p>}

          {variants.length > 1 && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-bold">Elige formato</legend>
              <ul className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const current = v.id === selected.id;
                  return (
                    <li key={v.id}>
                      <Link
                        href={`?variante=${encodeURIComponent(v.sku)}`}
                        scroll={false}
                        replace
                        aria-current={current ? "true" : undefined}
                        className={`inline-block rounded-md border-2 px-4 py-2 text-sm font-semibold ${
                          current ? "border-leaf bg-leaf text-white" : "border-line hover:border-leaf"
                        } ${v.available > 0 ? "" : "text-muted line-through decoration-1"}`}
                      >
                        {v.name}
                        {v.available === 0 && <span className="sr-only"> (agotado)</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          <div className="mt-8 w-fit min-w-64">
            <Fleje v={selected} large muted={selected.available === 0} />
          </div>

          <p className={`mt-4 font-semibold ${selected.available > 0 ? "text-leaf" : "text-oferta"}`}>
            {selected.available === 0
              ? "Agotado por ahora"
              : selected.available <= selected.minimumStock
                ? `Quedan pocas unidades (${selected.available})`
                : "Disponible"}
          </p>

          {/* El carrito se habilita junto con los pedidos. */}
          <button
            type="button"
            disabled
            className="mt-6 w-full rounded-md bg-leaf px-6 py-3.5 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Agregar al carrito
          </button>
          <p className="mt-2 text-sm text-muted">La compra en línea estará disponible muy pronto.</p>

          <p className="mt-6 text-xs text-muted">
            <span className="mr-4">SKU {selected.sku}</span>
            {selected.barcode && <span>Código de barras {selected.barcode}</span>}
          </p>
        </div>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        {product.description && (
          <section>
            <h2 className="mb-3 text-xl font-bold">Descripción</h2>
            {/* Markdown básico convertido a elementos React: sin HTML crudo (ver src/lib/markdown.tsx). */}
            <div className="max-w-prose space-y-3 leading-relaxed [&_h3]:text-lg [&_h3]:font-bold [&_h4]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown text={product.description} />
            </div>
          </section>
        )}
        {specs.length > 0 && (
          <section>
            <h2 className="mb-3 text-xl font-bold">Características</h2>
            <dl className="divide-y divide-line border-y border-line">
              {specs.map((a) => (
                <div key={a.code} className="grid grid-cols-2 gap-4 py-2.5 text-sm">
                  <dt className="text-muted">{a.label}</dt>
                  <dd className="font-medium">{a.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">También en {categoryPath.at(-1)!.name}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
