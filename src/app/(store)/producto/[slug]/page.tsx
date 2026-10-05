import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { Breadcrumbs, hrefWith, type SP } from "@/components/store/catalog-view";
import { AddToCartButton, Fleje, ProductGrid, ProductImage, StockBadge } from "@/components/store/product-card";
import { env } from "@/lib/env";
import { Markdown } from "@/lib/markdown";
import { contentLabel, discountPercent } from "@/modules/catalog/pricing";
import { describeAttributes, getProductBySlug, relatedProducts } from "@/modules/catalog/queries";
import { formatCLP } from "@/modules/chile";

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
  const sp = await searchParams;
  const path = `/producto/${product.slug}`;

  // La variante elegida va en la URL (?variante=SKU): enlazable y funciona sin JavaScript.
  const wanted = [sp.variante].flat()[0];
  const selected = variants.find((v) => v.sku === wanted) ?? variants.find((v) => v.available > 0) ?? variants[0]!;
  // La foto elegida en la galería también (?foto=n); sin elegir, la de la variante o la primera.
  const photoIdx = Number([sp.foto].flat()[0]);
  const image = images[photoIdx] ?? images.find((i) => i.variantId === selected.id) ?? images[0];
  const content = contentLabel(selected);
  const specs = [
    ...(variants.length > 1 && selected.name !== content ? [{ code: "_presentacion", label: "Presentación", value: selected.name }] : []),
    ...(content ? [{ code: "_contenido", label: "Contenido", value: content }] : []),
    ...describeAttributes({ ...product.attributes, ...selected.attributes }, attributeDefs),
  ];
  const related = await relatedProducts(product.id, product.categoryId);
  const inStock = selected.available > 0;
  const off = discountPercent(selected);

  const url = `${env.APP_URL}${path}`;
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

      <div className="mt-2 grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="relative aspect-square overflow-hidden rounded-md border border-line bg-mist">
            <ProductImage url={image?.url} alt={image?.alt || product.name} brand={brand?.name} label={selected.name} sizes="(min-width: 1024px) 50vw, 100vw" priority large />
            {off && inStock && <span className="absolute left-3 top-3 rounded-sm bg-oferta px-2.5 py-1 text-sm font-bold text-white">Oferta −{off}%</span>}
          </div>
          {images.length > 1 && (
            <ul className="mt-3 grid grid-cols-5 gap-2" aria-label="Fotos del producto">
              {images.map((i, n) => (
                <li key={i.id}>
                  <Link
                    href={hrefWith(path, sp, { foto: String(n) })}
                    scroll={false}
                    replace
                    aria-current={i.id === image?.id ? "true" : undefined}
                    className={`relative block aspect-square overflow-hidden rounded-sm border-2 bg-mist ${i.id === image?.id ? "border-leaf" : "border-transparent hover:border-line"}`}
                  >
                    <Image src={i.url} alt={i.alt || `Foto ${n + 1}`} fill sizes="10vw" className="object-contain p-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {brand && (
            <Link href={`/marca/${brand.slug}`} className="text-sm font-semibold uppercase tracking-wide text-muted hover:text-leaf hover:underline">
              {brand.name}
            </Link>
          )}
          <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {content ?? selected.name} · SKU {selected.sku}
          </p>
          {product.shortDescription && <p className="mt-4 text-lg leading-relaxed">{product.shortDescription}</p>}

          {variants.length > 1 && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-bold">
                Formato: <span className="font-normal">{selected.name}</span>
              </legend>
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
                        className={`flex flex-col rounded-md border-2 px-4 py-2 text-sm ${
                          current ? "border-leaf bg-leaf-soft" : "border-line bg-white hover:border-leaf"
                        } ${v.available > 0 ? "" : "text-muted"}`}
                      >
                        <span className={`font-semibold ${v.available > 0 ? "" : "line-through decoration-1"}`}>{v.name}</span>
                        <span className="text-xs">{v.available > 0 ? formatCLP(v.price) : "Agotado"}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          )}

          <div className="mt-6 rounded-md border border-line bg-white p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="w-fit min-w-56">
                <Fleje v={selected} large muted={!inStock} />
              </div>
              {off && selected.compareAtPrice && (
                <p className="text-sm font-semibold text-oferta">Ahorras {formatCLP(selected.compareAtPrice - selected.price)}</p>
              )}
            </div>
            <p className="mt-4">
              <StockBadge available={inStock} low={inStock && selected.available <= selected.minimumStock} />
              {inStock && selected.available <= selected.minimumStock && <span className="ml-2 text-xs text-muted">Quedan {selected.available}</span>}
            </p>

            {/* El carrito llega con los pedidos (FASE 5): la cantidad y el botón quedan listos pero deshabilitados. */}
            <fieldset disabled className="mt-5 flex flex-wrap items-stretch gap-3">
              <legend className="sr-only">Comprar</legend>
              <label className="flex items-center rounded-md border border-line">
                <span className="sr-only">Cantidad</span>
                <span aria-hidden className="grid w-10 place-items-center text-xl text-muted">−</span>
                <input type="number" min={1} defaultValue={1} inputMode="numeric" className="w-12 border-x border-line bg-transparent py-3 text-center font-semibold" />
                <span aria-hidden className="grid w-10 place-items-center text-xl text-muted">+</span>
              </label>
              <AddToCartButton large className="flex-1" />
            </fieldset>
            <p className="mt-3 text-sm text-muted">La compra en línea estará disponible muy pronto.</p>

            <ul className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
              <li className="flex items-center gap-2">
                <Icon name="truck" className="size-5 text-leaf" />
                Despacho a todo Chile; costo según comuna.
              </li>
              <li className="flex items-center gap-2">
                <Icon name="shield" className="size-5 text-leaf" />
                Precio con IVA incluido.
              </li>
            </ul>
          </div>

          {selected.barcode && <p className="mt-3 text-xs text-muted">Código de barras {selected.barcode}</p>}
        </div>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        {product.description && (
          <section>
            <h2 className="mb-4 border-b border-line pb-2 text-xl font-bold">Descripción</h2>
            {/* Markdown básico convertido a elementos React: sin HTML crudo (ver src/lib/markdown.tsx). */}
            <div className="max-w-prose space-y-3 leading-relaxed [&_h3]:text-lg [&_h3]:font-bold [&_h4]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown text={product.description} />
            </div>
          </section>
        )}
        {specs.length > 0 && (
          <section>
            <h2 className="mb-4 border-b border-line pb-2 text-xl font-bold">Características</h2>
            <dl className="overflow-hidden rounded-md border border-line">
              {specs.map((a) => (
                <div key={a.code} className="grid grid-cols-2 gap-4 px-4 py-2.5 text-sm odd:bg-paper">
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
          <h2 className="mb-5 border-b border-line pb-3 text-2xl font-extrabold tracking-tight">También en {categoryPath.at(-1)!.name}</h2>
          <ProductGrid products={related} />
        </section>
      )}
    </>
  );
}
