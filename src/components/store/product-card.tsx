import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { discountPercent, type PricedVariant, unitPriceLabel } from "@/modules/catalog/pricing";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { formatCLP } from "@/modules/chile";
import { AddToCartForm } from "./cart-forms";

/**
 * Precio como fleje de góndola: amarillo, cifra condensada y precio por unidad de medida abajo.
 * Es el único elemento amarillo de la tienda; todo lo demás se mantiene sobrio.
 */
export function Fleje({ v, from = false, large = false, muted = false }: { v: PricedVariant; from?: boolean; large?: boolean; muted?: boolean }) {
  const off = discountPercent(v);
  const unit = unitPriceLabel(v);
  return (
    <div className={`relative rounded-[3px] px-3 pb-2 pt-2.5 shadow-[0_2px_0_rgb(16_42_51/0.14)] ${muted ? "bg-mist text-muted" : "bg-fleje text-ink"}`}>
      {off && !muted && (
        // z-2: en la tarjeta queda por encima de la repisa (z-1).
        <span className="absolute -top-2.5 right-2 z-[2] rounded-full bg-oferta px-2 py-0.5 text-xs font-bold text-white">−{off}%</span>
      )}
      {v.compareAtPrice && off && (
        <p className="text-xs">
          Antes <s>{formatCLP(v.compareAtPrice)}</s>
        </p>
      )}
      <p className={`font-extrabold leading-none tracking-tight [font-stretch:66%] ${large ? "text-6xl" : "text-3xl sm:text-[2.15rem]"}`}>
        {from && <span className="mr-1 align-top text-sm font-semibold tracking-normal [font-stretch:100%]">Desde</span>}
        {formatCLP(v.price)}
      </p>
      {unit && <p className="mt-1.5 border-t border-ink/20 pt-1 text-xs">{unit}</p>}
    </div>
  );
}

// Fondo de cada producto (con o sin foto): sale de la marca, así la grilla no se ve repetida y la marca se reconoce.
const TINTS = ["bg-agua", "bg-leaf-soft", "bg-arena", "bg-mist"];

/**
 * Foto del producto sobre su fondo de color o, si aún no tiene, un envase dibujado con marca y presentación.
 * El contenedor define el tamaño (debe ser relative).
 */
export function ProductImage({
  url,
  alt,
  brand,
  label,
  sizes,
  priority = false,
  large = false,
  thumb = false,
}: {
  url: string | null | undefined;
  alt: string;
  brand?: string | null;
  label: string;
  sizes: string;
  priority?: boolean;
  large?: boolean;
  thumb?: boolean;
}) {
  const hash = [...(brand ?? label)].reduce((h, c) => h + c.charCodeAt(0), 0);
  const tint = TINTS[hash % TINTS.length];
  if (url)
    return (
      // isolate: el multiply se calcula siempre contra el color del producto, aunque la tarjeta se esté animando.
      <div className={`absolute inset-0 isolate ${tint}`}>
        {/* multiply: el fondo blanco de las fotos de proveedor se funde con el color del producto. */}
        <Image src={url} alt={alt} fill priority={priority} sizes={sizes} className={`object-contain mix-blend-multiply ${large ? "p-8" : thumb ? "p-1.5" : "p-4"}`} />
      </div>
    );
  // Miniaturas (carrito, tablas): solo el ícono.
  if (thumb)
    return (
      <div aria-hidden className={`absolute inset-0 grid place-items-center text-leaf ${tint}`}>
        <Icon name="drop" className="size-7" />
      </div>
    );
  // Botella (con tapa) o caja, según el producto: la grilla sin fotos no se ve toda igual.
  const bottle = hash % 3 !== 0;
  return (
    <div aria-hidden className={`absolute inset-0 grid place-items-center ${tint}`}>
      <div className={`flex flex-col items-center ${large ? "w-[38%]" : "w-[56%]"}`}>
        {bottle && (
          <>
            <span className={`w-[30%] rounded-t-md bg-ink ${large ? "h-6" : "h-3"}`} />
            <span className={`w-[46%] bg-white ring-1 ring-ink/10 ${large ? "h-3" : "h-1.5"}`} />
          </>
        )}
        <div
          className={`flex w-full flex-col items-center bg-white text-center shadow-[inset_-0.7rem_0_0_rgb(16_42_51/0.045)] ring-1 ring-ink/10 ${
            bottle ? "rounded-[1.4rem_1.4rem_0.9rem_0.9rem]" : "rounded-lg"
          } ${large ? "gap-3 px-4 pb-10 pt-10" : "gap-1 px-1.5 pb-4 pt-4"}`}
        >
          <Icon name="drop" className={`text-leaf ${large ? "size-10" : "size-6"}`} />
          {brand && (
            <span className={`line-clamp-1 font-semibold uppercase text-muted [font-stretch:115%] ${large ? "text-xs tracking-[0.16em]" : "text-[0.5rem] tracking-[0.12em]"}`}>
              {brand}
            </span>
          )}
          <span className={`font-extrabold leading-[0.95] text-ink [font-stretch:72%] ${large ? "text-4xl" : "text-lg"}`}>{label}</span>
        </div>
      </div>
    </div>
  );
}

/** Estado de stock como texto + punto de color (no depende solo del color). */
export function StockBadge({ available, low = false }: { available: boolean; low?: boolean }) {
  const [dot, text, label] = !available
    ? ["bg-oferta", "text-oferta", "Agotado"]
    : low
      ? ["bg-amber-500", "text-ink", "Últimas unidades"]
      : ["bg-leaf", "text-leaf-dark", "Disponible"];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${text}`}>
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

/** Botón deshabilitado para lo agotado (lo disponible usa AddToCartForm). */
export function SoldOutButton({ large = false, className = "" }: { large?: boolean; className?: string }) {
  return (
    <button
      type="button"
      disabled
      className={`flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-mist font-bold text-muted ${
        large ? "px-6 py-3.5 text-lg" : "px-3 py-2.5 text-sm"
      } ${className}`}
    >
      <Icon name="cart" className={large ? "size-6" : "size-4"} />
      Agotado
    </button>
  );
}

/** Acción de compra de la tarjeta: agrega directo si hay un solo formato; si hay varios, lleva a elegirlo. */
function CardBuy({ p }: { p: Card }) {
  if (!p.inStock) return <SoldOutButton />;
  if (p.variantCount > 1)
    return (
      <Link href={`/producto/${p.slug}`} className="btn-line w-full whitespace-nowrap px-3 py-2 text-sm">
        Elegir formato<span className="sr-only"> de {p.name}</span>
        {/* En la tarjeta angosta del celular la flecha haría saltar el texto a dos líneas. */}
        <Icon name="arrow" className="hidden size-4 sm:block" />
      </Link>
    );
  return <AddToCartForm variantId={p.variantId} />;
}

/**
 * Tarjeta como un tramo de góndola: el producto sobre su fondo, la repisa (franja tinta) y el fleje colgando de ella.
 * En el DOM el nombre va antes que el precio (orden de lectura); `order` solo cambia la vista.
 */
export function ProductCard({ p, index = 0 }: { p: Card; index?: number }) {
  const off = discountPercent(p);
  return (
    <li className="revelar">
      <article
        style={{ "--i": index } as React.CSSProperties}
        className="escalonar group relative flex h-full flex-col rounded-[1.25rem] bg-white p-2 ring-1 ring-line transition-[translate,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:shadow-lift hover:ring-ink/15 sm:p-2.5">
        <div className="relative order-1 aspect-square overflow-hidden rounded-t-[0.95rem]">
          <div className="absolute inset-0 transition-[scale] duration-700 ease-out group-hover:scale-[1.04]">
            <ProductImage url={p.imageUrl} alt="" brand={p.brandName} label={p.variantName} sizes="(min-width: 1280px) 22vw, (min-width: 640px) 30vw, 45vw" />
          </div>
          {off && p.inStock && (
            <span className="absolute right-2.5 top-2.5 grid size-12 -rotate-12 place-items-center rounded-full bg-oferta text-[0.62rem] font-bold uppercase tracking-wide text-white">
              Oferta
            </span>
          )}
          {!p.inStock && <span className="absolute left-2.5 top-2.5 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">Agotado</span>}
        </div>

        <div className="order-4 flex flex-1 flex-col px-1.5 pt-3">
          {p.brandName && <p className="etiqueta text-muted">{p.brandName}</p>}
          <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">
            {/* Enlace estirado: toda la tarjeta es clicable, pero hay un solo enlace por producto. */}
            <Link href={`/producto/${p.slug}`} className="transition-colors after:absolute after:inset-0 after:rounded-[1.25rem] after:content-[''] group-hover:text-leaf-dark">
              {p.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-muted">
            {p.variantName}
            {p.variantCount > 1 && ` · ${p.variantCount} formatos`}
          </p>
          <p className="mt-2">
            <StockBadge available={p.inStock} />
          </p>
        </div>

        {/* La repisa va sobre el fleje (z-1): el fleje queda "metido" en el borde de la góndola. */}
        <div aria-hidden className="relative z-[1] order-2 h-1.5 rounded-b-[3px] bg-ink" />
        <div className="order-3 -mt-0.5 ml-2 w-fit min-w-[62%] max-w-[calc(100%-1rem)]">
          <Fleje v={p} from={p.maxPrice > p.price} muted={!p.inStock} />
        </div>

        {/* Sobre el enlace estirado de la tarjeta, para que el botón reciba el clic. */}
        <div className="relative z-10 order-5 px-1.5 pb-1 pt-4">
          <CardBuy p={p} />
        </div>
      </article>
    </li>
  );
}

/** `wide`: sin barra de filtros al lado (inicio), caben 4 columnas desde tablet. */
export function ProductGrid({ products, wide = false }: { products: Card[]; wide?: boolean }) {
  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-5 sm:gap-y-7 ${wide ? "md:grid-cols-4" : "sm:grid-cols-3 xl:grid-cols-4"}`}>
      {products.map((p, i) => (
        <ProductCard key={p.id} p={p} index={i} />
      ))}
    </ul>
  );
}
