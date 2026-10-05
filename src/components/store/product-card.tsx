import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { discountPercent, type PricedVariant, unitPriceLabel } from "@/modules/catalog/pricing";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { formatCLP } from "@/modules/chile";

/**
 * Precio como fleje de góndola: amarillo, cifra condensada y precio por unidad de medida abajo.
 * Es el único elemento amarillo de la tienda; todo lo demás se mantiene sobrio.
 */
export function Fleje({ v, from = false, large = false, muted = false }: { v: PricedVariant; from?: boolean; large?: boolean; muted?: boolean }) {
  const off = discountPercent(v);
  const unit = unitPriceLabel(v);
  return (
    <div className={`relative rounded-sm px-3 pb-2 pt-2.5 ${muted ? "bg-mist text-muted" : "bg-fleje text-ink"}`}>
      {off && !muted && (
        <span className="absolute -top-2.5 right-2 rounded-sm bg-oferta px-1.5 py-0.5 text-xs font-bold text-white">−{off}%</span>
      )}
      {v.compareAtPrice && off && (
        <p className="text-xs">
          Antes <s>{formatCLP(v.compareAtPrice)}</s>
        </p>
      )}
      <p className={`font-extrabold leading-none tracking-tight [font-stretch:68%] ${large ? "text-6xl" : "text-3xl sm:text-4xl"}`}>
        {from && <span className="mr-1 align-top text-sm font-semibold tracking-normal [font-stretch:100%]">Desde</span>}
        {formatCLP(v.price)}
      </p>
      {unit && <p className="mt-1.5 border-t border-ink/20 pt-1 text-xs">{unit}</p>}
    </div>
  );
}

// Fondos suaves para productos sin foto: el tono sale de la marca, así la grilla no se ve repetida.
const TINTS = ["bg-leaf-soft text-leaf", "bg-sky-100 text-sky-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-lime-100 text-lime-700", "bg-teal-100 text-teal-700"];

/**
 * Foto del producto o, si aún no tiene, una "etiqueta" con marca y presentación (como el frente del envase).
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
  if (url) return <Image src={url} alt={alt} fill priority={priority} sizes={sizes} className={`object-contain ${large ? "p-8" : "p-4"}`} />;
  const tint = TINTS[[...(brand ?? label)].reduce((h, c) => h + c.charCodeAt(0), 0) % TINTS.length];
  // Miniaturas (carrito, tablas): solo el ícono.
  if (thumb)
    return (
      <div aria-hidden className={`absolute inset-0 grid place-items-center ${tint}`}>
        <Icon name="drop" className="size-7" />
      </div>
    );
  return (
    <div aria-hidden className={`absolute inset-0 grid place-items-center ${tint}`}>
      <div className={`flex flex-col items-center rounded-t-[2rem] rounded-b-md border-2 border-current/15 bg-white text-center ${large ? "w-2/5 gap-3 px-4 pb-10 pt-12" : "w-3/5 gap-1 px-1.5 pb-4 pt-5"}`}>
        <Icon name="drop" className={large ? "size-10" : "size-6"} />
        {brand && <span className={`font-semibold uppercase tracking-widest text-muted ${large ? "text-sm" : "line-clamp-1 text-[0.6rem]"}`}>{brand}</span>}
        <span className={`font-bold leading-tight text-ink [font-stretch:75%] ${large ? "text-4xl" : "text-lg"}`}>{label}</span>
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

/** El carrito se habilita con los pedidos (FASE 5); mientras tanto el botón se muestra deshabilitado. */
export function AddToCartButton({ large = false, className = "" }: { large?: boolean; className?: string }) {
  return (
    <button
      type="button"
      disabled
      title="La compra en línea se habilita próximamente"
      className={`flex items-center justify-center gap-2 rounded-md bg-leaf font-bold text-white disabled:cursor-not-allowed disabled:bg-leaf/60 ${
        large ? "px-6 py-3.5 text-lg" : "w-full px-3 py-2 text-sm"
      } ${className}`}
    >
      <Icon name="cart" className={large ? "size-6" : "size-4"} />
      {large ? "Agregar al carrito" : <span>Agregar<span className="sr-only"> al carrito</span></span>}
      <span className="sr-only">(disponible próximamente)</span>
    </button>
  );
}

export function ProductCard({ p }: { p: Card }) {
  const off = discountPercent(p);
  return (
    <li>
      <article className="group relative flex h-full flex-col rounded-md border border-line bg-white p-3 transition-colors hover:border-leaf sm:p-4">
        <div className="relative mb-3 aspect-square overflow-hidden rounded-sm bg-mist">
          <ProductImage url={p.imageUrl} alt="" brand={p.brandName} label={p.variantName} sizes="(min-width: 1280px) 22vw, (min-width: 640px) 30vw, 45vw" />
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
            {off && p.inStock && <span className="rounded-sm bg-oferta px-2 py-0.5 text-xs font-bold text-white">Oferta</span>}
            {!p.inStock && <span className="rounded-sm bg-ink px-2 py-0.5 text-xs font-semibold text-white">Agotado</span>}
          </div>
        </div>
        {p.brandName && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.brandName}</p>}
        <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug">
          {/* Enlace estirado: toda la tarjeta es clicable, pero hay un solo enlace por producto. */}
          <Link href={`/producto/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] group-hover:text-leaf group-hover:underline">
            {p.name}
          </Link>
        </h3>
        <p className="mt-0.5 text-sm text-muted">
          {p.variantName}
          {p.variantCount > 1 && ` · ${p.variantCount} formatos`}
        </p>
        <div className="mb-3 mt-2">
          <StockBadge available={p.inStock} />
        </div>
        <div className="mt-auto space-y-3">
          <Fleje v={p} from={p.maxPrice > p.price} muted={!p.inStock} />
          <AddToCartButton className="relative z-10" />
        </div>
      </article>
    </li>
  );
}

export function ProductGrid({ products }: { products: Card[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </ul>
  );
}
