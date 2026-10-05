import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { Fleje, ProductGrid, ProductImage } from "@/components/store/product-card";
import { SearchBar } from "@/components/store/shell";
import { listBrands } from "@/modules/brands/queries";
import { listProducts } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";

// Solo presentación: ícono y color por categoría raíz conocida; las demás usan el genérico.
const ROOT_STYLE: Record<string, { icon: IconName; tint: string }> = {
  "higiene-personal": { icon: "drop", tint: "bg-leaf-soft text-leaf-dark" },
  "aseo-del-hogar": { icon: "home", tint: "bg-sky-100 text-sky-900" },
  accesorios: { icon: "brush", tint: "bg-amber-100 text-amber-900" },
};
const DEFAULT_STYLE = { icon: "tag" as IconName, tint: "bg-mist text-ink" };

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: "shield", title: "Compra segura", text: "Pago con medios chilenos reconocidos." },
  { icon: "truck", title: "Despacho a todo Chile", text: "Costo y plazo según tu comuna, antes de pagar." },
  { icon: "grid", title: "Todo en un lugar", text: "Higiene, aseo y accesorios en un solo pedido." },
  { icon: "chat", title: "Atención cercana", text: "Te ayudamos con tu pedido antes y después." },
];

function SectionTitle({ id, title, href, link }: { id: string; title: string; href?: string; link?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-line pb-3">
      <h2 id={id} className="text-2xl font-extrabold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-leaf hover:underline">
          {link}
          <Icon name="chevron" className="size-4" />
        </Link>
      )}
    </div>
  );
}

export default async function Home() {
  const { roots, visibleIds } = await loadCategories();
  const scope = { categoryIds: visibleIds };
  const [featured, latest, brands] = await Promise.all([
    listProducts(scope, { featured: true }, { pageSize: 8 }),
    listProducts(scope, { inStock: true }, { sort: "nuevos", pageSize: 4 }),
    listBrands(),
  ]);
  const spotlight = featured.items[0];

  return (
    <>
      <section className="bleed -mt-8 bg-mist py-10 sm:py-14">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-sm bg-white px-2.5 py-1 text-sm font-semibold text-leaf-dark">
              <Icon name="truck" className="size-4" />
              Compra online, recibe en tu casa
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.02] tracking-tight [font-stretch:85%] sm:text-6xl">
              ¿Qué te falta en casa?
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Higiene personal, aseo del hogar y limpieza a precio claro: compara por formato y precio por litro o kilo antes de elegir.
            </p>
            <div className="mt-7 max-w-xl">
              <SearchBar id="buscar-inicio" placeholder="Lavalozas, shampoo, papel higiénico…" large />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/productos" className="rounded-md bg-ink px-5 py-3 font-semibold text-white hover:bg-leaf-dark">
                Ver todo el catálogo
              </Link>
              {roots[0] && (
                <Link href={`/categoria/${roots[0].slug}`} className="rounded-md border border-ink/30 bg-white px-5 py-3 font-semibold hover:border-leaf hover:text-leaf">
                  {roots[0].name}
                </Link>
              )}
            </div>
          </div>

          {/* Producto destacado real como vitrina (no hay imágenes de campaña todavía). */}
          {spotlight && (
            <Link href={`/producto/${spotlight.slug}`} className="group mx-auto grid w-full max-w-md grid-cols-[1fr_auto] items-end gap-4 rounded-md border border-line bg-white p-5 hover:border-leaf">
              <p className="col-span-2 text-xs font-bold uppercase tracking-widest text-leaf">Producto destacado</p>
              <div className="relative col-span-2 aspect-[4/3] overflow-hidden rounded-sm bg-mist">
                <ProductImage url={spotlight.imageUrl} alt="" brand={spotlight.brandName} label={spotlight.variantName} sizes="(min-width: 1024px) 28rem, 90vw" priority />
              </div>
              <div className="min-w-0">
                {spotlight.brandName && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{spotlight.brandName}</p>}
                <p className="font-bold leading-snug group-hover:text-leaf group-hover:underline">{spotlight.name}</p>
              </div>
              <div className="w-36">
                <Fleje v={spotlight} from={spotlight.maxPrice > spotlight.price} muted={!spotlight.inStock} />
              </div>
            </Link>
          )}
        </div>
      </section>

      <section aria-label="Beneficios" className="bleed border-b border-line bg-white">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-5 py-6 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <li key={b.title} className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-leaf-soft text-leaf-dark">
                <Icon name={b.icon} />
              </span>
              <span>
                <span className="block text-sm font-bold">{b.title}</span>
                <span className="block text-sm text-muted">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="categorias" className="mt-12">
        <SectionTitle id="categorias" title="Compra por categoría" href="/productos" link="Ver todo" />
        <div className="grid gap-4 md:grid-cols-3">
          {roots.map((c) => {
            const st = ROOT_STYLE[c.slug] ?? DEFAULT_STYLE;
            return (
              <div key={c.id} className="flex flex-col rounded-md border border-line bg-white">
                <Link href={`/categoria/${c.slug}`} className={`group flex items-center gap-4 rounded-t-md p-5 ${st.tint}`}>
                  <span className="grid size-12 place-items-center rounded-md bg-white/70">
                    <Icon name={st.icon} className="size-7" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-xl font-extrabold group-hover:underline">{c.name}</span>
                    <span className="text-sm opacity-80">{c.children.length} subcategorías</span>
                  </span>
                  <Icon name="chevron" />
                </Link>
                {c.children.length > 0 && (
                  <ul className="flex flex-wrap gap-2 p-5">
                    {c.children.map((sub) => (
                      <li key={sub.id}>
                        <Link href={`/categoria/${sub.slug}`} className="inline-block rounded-sm border border-line px-3 py-1.5 text-sm font-medium hover:border-leaf hover:text-leaf">
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {featured.items.length > 0 && (
        <section aria-labelledby="destacados" className="mt-14">
          <SectionTitle id="destacados" title="Destacados" href="/productos" link="Ver todos los productos" />
          <ProductGrid products={featured.items} />
        </section>
      )}

      {latest.items.length > 0 && (
        <section aria-labelledby="nuevos" className="mt-14">
          <SectionTitle id="nuevos" title="Recién llegados" href="/productos?orden=nuevos" link="Ver más nuevos" />
          <ProductGrid products={latest.items} />
        </section>
      )}

      {brands.length > 0 && (
        <section aria-labelledby="marcas" className="mt-14">
          <SectionTitle id="marcas" title="Marcas" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {brands.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/marca/${b.slug}`}
                  className="grid h-16 place-items-center rounded-md border border-line bg-white px-3 text-center text-sm font-bold uppercase tracking-wide text-muted hover:border-leaf hover:text-leaf"
                >
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
