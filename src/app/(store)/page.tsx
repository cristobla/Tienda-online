import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { JsonLd } from "@/components/store/json-ld";
import { Fleje, ProductGrid, ProductImage } from "@/components/store/product-card";
import { aisle, SearchBar } from "@/components/store/shell";
import { env } from "@/lib/env";
import { formatPhone, mapsLink, pickupAvailable, socialLinks, storeAddressLine, whatsappUrl } from "@/lib/site";
import { listBrands } from "@/modules/brands/queries";
import { listProducts, type ProductCard } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";
import { getSettings } from "@/modules/settings";

// Fondo de cada pasillo (categoría raíz) según su orden en el panel.
const AISLE_TINTS = ["bg-agua", "bg-leaf-soft", "bg-arena"];

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: "shield", title: "Compra segura", text: "Pago con medios chilenos reconocidos." },
  { icon: "truck", title: "Despacho a todo Chile", text: "Costo y plazo según tu comuna, antes de pagar." },
  { icon: "grid", title: "Todo en un lugar", text: "Higiene, aseo y accesorios en un solo pedido." },
  { icon: "chat", title: "Atención cercana", text: "Te ayudamos con tu pedido antes y después." },
];

// Cómo se compra: solo lo que la tienda ya hace (precio por litro o kilo, despacho por comuna, avisos por correo).
const STEPS = [
  { title: "Elige tus productos", text: "Compara por formato y por precio por litro o kilo antes de agregarlos al carrito." },
  { title: "Ingresa tu comuna", text: "Ves el costo del despacho antes de pagar, junto al total con IVA incluido." },
  { title: "Paga y listo", text: "Te avisamos por correo cuando confirmemos el pago y cuando despachemos tu pedido." },
];

function SectionTitle({ id, kicker, title, href, link }: { id: string; kicker: string; title: string; href?: string; link?: string }) {
  return (
    <div className="revelar mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        <p className="etiqueta text-leaf">{kicker}</p>
        <h2 id={id} className="rotulo mt-2 text-display">
          {title}
        </h2>
      </div>
      {href && (
        <Link href={href} className="group/ver inline-flex shrink-0 items-center gap-2.5 font-semibold text-leaf-dark transition-colors hover:text-ink">
          {link}
          <span className="grid size-9 place-items-center rounded-full bg-leaf-soft transition-transform duration-300 ease-out group-hover/ver:translate-x-1">
            <Icon name="arrow" className="size-4" />
          </span>
        </Link>
      )}
    </div>
  );
}

/** Producto destacado real como vitrina del héroe (no hay imágenes de campaña): en una "gota", con su fleje. */
function Spotlight({ p }: { p: ProductCard }) {
  return (
    <Link href={`/producto/${p.slug}`} className="group relative mx-auto block w-full max-w-[27rem] animate-rise [animation-delay:200ms]">
      <span className="etiqueta absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1.5 text-leaf-dark ring-1 ring-line sm:right-6 sm:top-6">Producto destacado</span>
      <div className="relative aspect-square overflow-hidden rounded-full ring-1 ring-ink/10">
        <div className="absolute inset-0 transition-[scale] duration-700 ease-out group-hover:scale-[1.04]">
          <ProductImage url={p.imageUrl} alt="" brand={p.brandName} label={p.variantName} sizes="(min-width: 1024px) 27rem, 90vw" priority />
        </div>
      </div>
      <div className="absolute bottom-16 left-0 w-40 -rotate-3 transition-transform duration-500 ease-spring group-hover:rotate-0 sm:-left-4 sm:w-48">
        <Fleje v={p} from={p.maxPrice > p.price} muted={!p.inStock} />
      </div>
      <p className="mt-5 text-center">
        {p.brandName && <span className="etiqueta block text-muted">{p.brandName}</span>}
        <span className="mt-1 block text-lg font-bold leading-snug transition-colors group-hover:text-leaf-dark">{p.name}</span>
      </p>
    </Link>
  );
}

export default async function Home() {
  const { roots, visibleIds } = await loadCategories();
  const scope = { categoryIds: visibleIds };
  const [featured, latest, brands, st] = await Promise.all([
    listProducts(scope, { featured: true }, { pageSize: 8 }),
    listProducts(scope, { inStock: true }, { sort: "nuevos", pageSize: 4 }),
    listBrands(),
    getSettings(),
  ]);
  const spotlight = featured.items[0];
  const place = storeAddressLine(st);
  // Para buscadores: la tienda (con sus redes, cuando existan), el local físico (si hay dirección) y el buscador interno.
  // El local usa los mismos nombre, dirección y teléfono que la ficha de Google Maps (deben coincidir).
  const siteLd = [
    {
      "@context": "https://schema.org",
      "@type": "OnlineStore",
      name: st.name,
      url: env.APP_URL,
      logo: `${env.APP_URL}/icon.svg`,
      email: st.email ?? undefined,
      telephone: st.whatsapp ?? undefined,
      sameAs: socialLinks(st).map((l) => l.url),
    },
    st.storeAddress && {
      "@context": "https://schema.org",
      "@type": "Store",
      name: st.name,
      url: env.APP_URL,
      image: `${env.APP_URL}/opengraph-image`,
      telephone: st.whatsapp ?? undefined,
      email: st.email ?? undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: st.storeAddress,
        addressLocality: st.storeCommune ?? undefined,
        addressRegion: st.storeRegion ?? undefined,
        addressCountry: "CL",
      },
      hasMap: mapsLink(st),
      sameAs: socialLinks(st).map((l) => l.url),
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: st.name,
      url: env.APP_URL,
      potentialAction: { "@type": "SearchAction", target: `${env.APP_URL}/productos?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
  ].filter(Boolean);

  return (
    <>
      <JsonLd data={siteLd} />
      <section className="bleed relative -mt-8 overflow-hidden bg-paper">
        <div aria-hidden className="ondas absolute inset-0 [--ondas-x:80%] [--ondas-y:42%]" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div>
            {roots.length > 0 && <p className="etiqueta animate-rise text-leaf-dark">{roots.map((c) => c.name).join(" · ")}</p>}
            <h1 className="rotulo mt-5 animate-rise text-hero [animation-delay:90ms]">
              ¿Qué te falta <span className="text-leaf">en casa?</span>
            </h1>
            <p className="mt-6 max-w-xl animate-rise text-lg text-muted [animation-delay:180ms]">
              Higiene personal, aseo del hogar y limpieza a precio claro: compara por formato y precio por litro o kilo antes de elegir.
            </p>
            <div className="mt-8 max-w-xl animate-rise [animation-delay:270ms]">
              <SearchBar id="buscar-inicio" placeholder="Lavalozas, shampoo, papel higiénico…" large />
            </div>
            <ul aria-label="Pasillos" className="mt-5 flex animate-rise flex-wrap gap-2 [animation-delay:360ms]">
              {roots.map((c, i) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`} className="inline-flex items-baseline gap-2 rounded-full border-[1.5px] border-ink/15 bg-white px-4 py-2 text-sm font-semibold transition-colors hover:border-ink">
                    <span aria-hidden className="etiqueta text-[0.6rem] text-leaf">
                      {aisle(i)}
                    </span>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {spotlight && <Spotlight p={spotlight} />}
        </div>
      </section>

      <section aria-label="Beneficios" className="bleed border-b border-line bg-white">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-line">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex flex-col gap-2.5 py-5 sm:flex-row sm:items-start sm:gap-3.5 lg:px-6 lg:first:pl-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-menta/25 text-leaf-dark">
                <Icon name={b.icon} />
              </span>
              <span>
                <span className="rotulo block text-xl leading-tight">{b.title}</span>
                <span className="block text-sm text-muted">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {roots.length > 0 && (
        <section aria-labelledby="pasillos" className="mt-16 sm:mt-20">
          <SectionTitle id="pasillos" kicker="Recorre la tienda" title="Elige tu pasillo" href="/productos" link="Ver todo el catálogo" />
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {roots.map((c, i) => (
              <li
                key={c.id}
                className={`revelar group relative flex min-h-64 flex-col overflow-hidden rounded-[1.75rem] p-6 sm:p-8 ${AISLE_TINTS[i % AISLE_TINTS.length]} ${i === 0 ? "md:row-span-2 md:min-h-[30rem]" : ""}`}
              >
                <span aria-hidden className={`rotulo calado leading-[0.8] text-ink/80 group-hover:relleno ${i === 0 ? "text-[clamp(6rem,14vw,11rem)]" : "text-[clamp(5rem,10vw,7.5rem)]"}`}>
                  {aisle(i)}
                </span>
                <span aria-hidden className="absolute right-6 top-6 grid size-12 place-items-center rounded-full bg-ink text-white transition-transform duration-500 ease-spring group-hover:-rotate-45 sm:right-8 sm:top-8">
                  <Icon name="arrow" />
                </span>
                <div className="mt-auto pt-8">
                  <p className="etiqueta text-ink/75">Pasillo {aisle(i)}</p>
                  <h3 className="rotulo mt-2 text-title">
                    {/* Enlace estirado: todo el letrero lleva a la categoría; las subcategorías van encima (z-10). */}
                    <Link href={`/categoria/${c.slug}`} className="after:absolute after:inset-0 after:content-['']">
                      {c.name}
                    </Link>
                  </h3>
                  {c.children.length > 0 && (
                    <ul className="relative z-10 mt-5 flex flex-wrap gap-2">
                      {c.children.map((sub) => (
                        <li key={sub.id}>
                          <Link href={`/categoria/${sub.slug}`} className="inline-block rounded-full bg-white/75 px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-ink hover:text-white">
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {featured.items.length > 0 && (
        <section aria-labelledby="destacados" className="mt-20 sm:mt-24">
          <SectionTitle id="destacados" kicker="Elegidos por la tienda" title="Destacados" href="/productos" link="Ver todos los productos" />
          <ProductGrid products={featured.items} wide />
        </section>
      )}

      <section aria-labelledby="como-comprar" className="bleed mt-20 bg-ink py-16 text-white sm:mt-24 sm:py-20 [&_:focus-visible]:outline-menta">
        <div className="mx-auto max-w-7xl">
          <p className="etiqueta text-menta">Así de simple</p>
          <h2 id="como-comprar" className="rotulo mt-2 max-w-2xl text-display">
            Tres pasos, <span className="calado text-menta">todo a la vista.</span>
          </h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="revelar border-t border-white/20 pt-6">
                <span aria-hidden className="rotulo block text-6xl leading-none text-menta">
                  {aisle(i)}
                </span>
                <h3 className="mt-4 text-xl font-bold">{s.title}</h3>
                <p className="mt-2 max-w-sm text-white/75">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {latest.items.length > 0 && (
        <section aria-labelledby="nuevos" className="mt-20 sm:mt-24">
          <SectionTitle id="nuevos" kicker="Lo último en la góndola" title="Recién llegados" href="/productos?orden=nuevos" link="Ver más nuevos" />
          <ProductGrid products={latest.items} wide />
        </section>
      )}

      {brands.length > 0 && (
        <section aria-labelledby="marcas" className="mt-20 sm:mt-24">
          <SectionTitle id="marcas" kicker="Encuentra tu marca" title="Marcas" />
          <ul className="revelar flex flex-wrap gap-3">
            {brands.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/marca/${b.slug}`}
                  className="rotulo inline-block rounded-full border-[1.5px] border-ink/15 px-5 py-2.5 text-xl uppercase tracking-wide transition-colors hover:border-ink hover:bg-ink hover:text-white sm:text-2xl"
                >
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {place && (
        <section aria-labelledby="local" className="relative mt-20 overflow-hidden rounded-[1.75rem] bg-leaf-soft px-6 py-10 sm:mt-24 sm:px-10 sm:py-12">
          <div aria-hidden className="ondas absolute inset-0 [--ondas-x:90%] [--ondas-y:50%]" />
          <div className="relative grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <p className="etiqueta text-leaf-dark">{pickupAvailable(st) ? "Compra online, retira gratis" : "También en persona"}</p>
              <h2 id="local" className="rotulo mt-2 text-display">
                Visítanos en <span className="calado text-leaf-dark">nuestro local.</span>
              </h2>
              <p className="mt-4 flex items-start gap-2 text-lg font-semibold">
                <Icon name="pin" className="mt-1 size-5 shrink-0 text-leaf-dark" />
                {place}
              </p>
              {st.hours && <p className="mt-1 pl-7 text-muted">{st.hours}</p>}
              {pickupAvailable(st) && <p className="mt-3 max-w-xl pl-7 text-sm">Elige «Retiro en el local» al finalizar tu compra: sin costo de despacho y te avisamos cuando esté listo.</p>}
            </div>
            <div className="flex flex-wrap gap-3 md:flex-col">
              <a href={mapsLink(st)!} target="_blank" rel="noopener" className="btn-ink px-6 py-3">
                <Icon name="pin" />
                Cómo llegar
              </a>
              {st.whatsapp && (
                <a href={whatsappUrl(st.whatsapp)} target="_blank" rel="noopener" className="btn-line px-6 py-3">
                  <Icon name="chat" />
                  {formatPhone(st.whatsapp)}
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
