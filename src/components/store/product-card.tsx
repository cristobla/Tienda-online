import Image from "next/image";
import Link from "next/link";
import { discountPercent, type PricedVariant, unitPriceLabel } from "@/modules/catalog/pricing";
import type { ProductCard as Card } from "@/modules/catalog/queries";
import { formatCLP } from "@/modules/chile";

/**
 * Precio como fleje de góndola: amarillo, cifra condensada y precio por unidad de medida abajo.
 * Es el único elemento de color fuerte de la tienda; todo lo demás se mantiene sobrio.
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
      <p className={`font-extrabold leading-none tracking-tight [font-stretch:68%] ${large ? "text-6xl" : "text-4xl"}`}>
        {from && <span className="mr-1 align-top text-sm font-semibold tracking-normal [font-stretch:100%]">Desde</span>}
        {formatCLP(v.price)}
      </p>
      {unit && <p className="mt-1.5 border-t border-ink/20 pt-1 text-xs">{unit}</p>}
    </div>
  );
}

export function ProductCard({ p }: { p: Card }) {
  return (
    <li className="group flex flex-col">
      <Link href={`/producto/${p.slug}`} className="flex flex-1 flex-col">
        <div className="relative mb-3 grid aspect-square place-items-center overflow-hidden rounded-md bg-mist">
          {p.imageUrl ? (
            <Image src={p.imageUrl} alt="" fill sizes="(min-width: 1024px) 20vw, 45vw" className="object-contain p-4" />
          ) : (
            // Sin foto: se muestra la presentación, como en la etiqueta del envase.
            <span aria-hidden className="px-4 text-center text-3xl font-bold text-leaf/70 [font-stretch:75%]">
              {p.variantName}
            </span>
          )}
          {!p.inStock && <span className="absolute left-2 top-2 rounded-sm bg-ink px-2 py-0.5 text-xs font-semibold text-white">Agotado</span>}
        </div>
        {p.brandName && <p className="text-xs text-muted">{p.brandName}</p>}
        <h3 className="line-clamp-2 font-semibold leading-snug group-hover:text-leaf group-hover:underline">{p.name}</h3>
        <p className="mb-4 mt-0.5 text-sm text-muted">
          {p.variantName}
          {p.variantCount > 1 && ` y ${p.variantCount - 1} ${p.variantCount === 2 ? "formato más" : "formatos más"}`}
        </p>
        <div className="mt-auto">
          <Fleje v={p} from={p.maxPrice > p.price} muted={!p.inStock} />
        </div>
      </Link>
    </li>
  );
}

export function ProductGrid({ products }: { products: Card[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </ul>
  );
}
