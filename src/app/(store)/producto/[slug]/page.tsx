import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Breadcrumbs, hrefWith, type SP } from "@/components/store/catalog-view";
import { AddToCartForm } from "@/components/store/cart-forms";
import { JsonLd } from "@/components/store/json-ld";
import { Fleje, ProductGrid, ProductImage, SoldOutButton, StockBadge } from "@/components/store/product-card";
import { env } from "@/lib/env";
import { Markdown, MARKDOWN_CLASS } from "@/lib/markdown";
import { whatsappUrl } from "@/lib/site";
import { MAX_ITEM_QTY } from "@/modules/cart";
import { validGtin } from "@/modules/catalog/feed";
import { contentLabel, discountPercent } from "@/modules/catalog/pricing";
import { describeAttributes, getProductBySlug, relatedProducts } from "@/modules/catalog/queries";
import { redirectFromOldSlug } from "@/modules/catalog/redirects";
import { formatCLP } from "@/modules/chile";
import { getSettings } from "@/modules/settings";

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
    // El openGraph de la página reemplaza al general: sin foto propia se repite la imagen general de la tienda.
    openGraph: { title: p.name, description, images: images.length ? images.slice(0, 1).map((i) => ({ url: i.url, alt: i.alt })) : ["/opengraph-image"] },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const data = await getProductBySlug(slug);
  if (!data) return redirectFromOldSlug("product", "/producto/", slug, sp);
  const { product, brand, categoryPath, variants, images, attributeDefs } = data;
  const path = `/producto/${product.slug}`;
  const { whatsapp } = await getSettings();

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
  const related = await relatedProducts(product.id, categoryPath.at(-1)!.id);
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
    // Solo un GTIN real (EAN-8/UPC-12/EAN-13/GTIN-14 con dígito verificador); los códigos internos no se informan.
    gtin: validGtin(selected.barcode) ? selected.barcode : undefined,
    image: images.map((i) => new URL(i.url, env.APP_URL).href),
    brand: brand ? { "@type": "Brand", name: brand.name } : undefined,
    offers: variants.length > 1 ? variants.map(offer) : offer(selected),
  };
  const crumbs = [{ name: "Inicio", href: "/" }, ...categoryPath.map((c) => ({ name: c.name, href: `/categoria/${c.slug}` })), { name: product.name, href: path }];
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: `${env.APP_URL}${c.href}` })),
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumbLd]} />
      <Breadcrumbs items={[...crumbs.slice(0, -1), { name: product.name }]} />

      <div className="mt-2 grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="lg:sticky lg:top-4 lg:self-start">
          {/* En una columna (tablet) el cuadrado a todo el ancho dejaría el precio fuera de la pantalla: se limita el alto. */}
          <div className="relative mx-auto aspect-square overflow-hidden rounded-[1.75rem] ring-1 ring-line max-lg:max-h-[55vh]">
            <ProductImage url={image?.url} alt={image?.alt || product.name} brand={brand?.name} label={selected.name} sizes="(min-width: 1024px) 50vw, 100vw" priority large />
            {off && inStock && (
              <span className="absolute right-4 top-4 grid size-20 -rotate-12 place-items-center rounded-full bg-oferta text-center text-sm font-bold uppercase leading-tight text-white">
                Oferta
                <br />−{off}%
              </span>
            )}
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
                    className={`relative block aspect-square overflow-hidden rounded-xl bg-mist ring-2 transition-shadow ${i.id === image?.id ? "ring-ink" : "ring-transparent hover:ring-line"}`}
                  >
                    <Image src={i.url} alt={i.alt || `Foto ${n + 1}`} fill sizes="10vw" className="object-contain p-1 mix-blend-multiply" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {brand && (
            <Link href={`/marca/${brand.slug}`} className="etiqueta inline-block py-2 text-leaf-dark underline-offset-4 hover:underline">
              {brand.name}
            </Link>
          )}
          <h1 className="rotulo mt-2 text-display">{product.name}</h1>
          <p className="mt-3 text-sm text-muted">
            {content ?? selected.name} · SKU {selected.sku}
          </p>
          {product.shortDescription && <p className="mt-5 max-w-prose text-lg leading-relaxed">{product.shortDescription}</p>}

          {variants.length > 1 && (
            <fieldset className="mt-7">
              <legend className="mb-3 text-sm font-bold">
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
                        className={`flex flex-col rounded-2xl border-[1.5px] px-4 py-2.5 text-sm transition-colors ${
                          current ? "border-ink bg-leaf-soft" : "border-line bg-white hover:border-ink"
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

          {/* La compra como un tramo de góndola: repisa tinta arriba y el fleje colgando de ella. */}
          <div className="mt-7 overflow-hidden rounded-[1.5rem] bg-paper ring-1 ring-line">
            <div aria-hidden className="relative z-[1] h-3 bg-ink" />
            <div className="flex flex-wrap items-start justify-between gap-4 px-5 sm:px-6">
              <div className="-mt-0.5 w-fit min-w-56">
                <Fleje v={selected} large muted={!inStock} />
              </div>
              {off && selected.compareAtPrice && (
                <p className="mt-4 rounded-full bg-oferta/10 px-3 py-1 text-sm font-semibold text-oferta">Ahorras {formatCLP(selected.compareAtPrice - selected.price)}</p>
              )}
            </div>
            <div className="px-5 pb-5 sm:px-6 sm:pb-6">
              <p className="mt-5">
                <StockBadge available={inStock} low={inStock && selected.available <= selected.minimumStock} />
                {inStock && selected.available <= selected.minimumStock && <span className="ml-2 text-xs text-muted">Quedan {selected.available}</span>}
              </p>

              <div className="mt-5">
                {inStock ? (
                  // key: al cambiar de formato el formulario se reinicia (cantidad 1, sin mensajes del anterior).
                  <AddToCartForm
                    key={selected.id}
                    variantId={selected.id}
                    max={Math.min(selected.available, MAX_ITEM_QTY)}
                    large
                    item={{ sku: selected.sku, name: product.name, price: selected.price }}
                  />
                ) : (
                  <SoldOutButton large />
                )}
              </div>
              {/* Consulta con el producto ya escrito (a la tienda) y compartir (a cualquiera): ventas por WhatsApp. */}
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
                {whatsapp && (
                  <a
                    href={whatsappUrl(whatsapp, `Hola, tengo una consulta por ${product.name} (${selected.name}): ${env.APP_URL}${path}?variante=${encodeURIComponent(selected.sku)}`)}
                    target="_blank"
                    rel="noopener"
                    className="flex items-center gap-1.5 text-leaf-dark underline-offset-2 hover:underline"
                  >
                    <Icon name="chat" className="size-4" />
                    {inStock ? "Consultar por WhatsApp" : "Avísame por WhatsApp cuando llegue"}
                  </a>
                )}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${product.name} ${env.APP_URL}${path}`)}`}
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-11 items-center gap-1.5 text-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  <Icon name="external" className="size-4" />
                  Compartir
                </a>
              </p>

              <ul className="mt-6 grid gap-3 border-t border-line pt-5 text-sm sm:grid-cols-2">
                <li className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-menta/25 text-leaf-dark">
                    <Icon name="truck" className="size-[1.1rem]" />
                  </span>
                  Despacho a todo Chile; costo según comuna.
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-menta/25 text-leaf-dark">
                    <Icon name="shield" className="size-[1.1rem]" />
                  </span>
                  Precio con IVA incluido.
                </li>
              </ul>
            </div>
          </div>

          {selected.barcode && <p className="mt-3 text-xs text-muted">Código de barras {selected.barcode}</p>}
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        {product.description && (
          <section>
            <h2 className="rotulo mb-5 border-b border-line pb-3 text-title">Descripción</h2>
            {/* Markdown básico convertido a elementos React: sin HTML crudo (ver src/lib/markdown.tsx). */}
            <div className={MARKDOWN_CLASS}>
              <Markdown text={product.description} />
            </div>
          </section>
        )}
        {specs.length > 0 && (
          <section>
            <h2 className="rotulo mb-5 border-b border-line pb-3 text-title">Características</h2>
            <dl className="overflow-hidden rounded-[1.25rem] ring-1 ring-line">
              {specs.map((a) => (
                <div key={a.code} className="grid grid-cols-2 gap-4 px-5 py-3 text-sm odd:bg-paper">
                  <dt className="text-muted">{a.label}</dt>
                  <dd className="font-medium">{a.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      {related.length > 0 && (
        <section className="mt-20">
          <p className="etiqueta text-leaf">Del mismo pasillo</p>
          <h2 className="rotulo mb-8 mt-2 text-display">También en {categoryPath.at(-1)!.name}</h2>
          <ProductGrid products={related} wide />
        </section>
      )}
    </>
  );
}
