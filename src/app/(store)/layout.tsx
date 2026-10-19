import type { Metadata } from "next";
import { Analytics } from "@/components/store/analytics";
import { PageTransition } from "@/components/store/page-transition";
import { StoreFooter, StoreHeader, WhatsAppButton } from "@/components/store/shell";
import { env } from "@/lib/env";
import { pickupAvailable } from "@/lib/site";
import { cartItemCount, currentCartId } from "@/modules/cart";
import { listProducts } from "@/modules/catalog/queries";
import { loadCategories } from "@/modules/categories/queries";
import { getSettings } from "@/modules/settings";

// El catálogo se lee de la base en cada visita (stock y precios al día).
// ponytail: sin caché de páginas; agregar "use cache" + revalidación al editar si el tráfico lo exige.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const st = await getSettings();
  return { title: { default: st.name, template: `%s | ${st.name}` }, description: st.description, openGraph: { siteName: st.name } };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [{ nav: roots, visibleIds }, cartCount, settings] = await Promise.all([loadCategories(), currentCartId().then(cartItemCount), getSettings()]);
  const onSale = (await listProducts({ categoryIds: visibleIds, onSale: true }, {}, { pageSize: 1 })).total > 0;
  return (
    <>
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:font-semibold focus:text-white">
        Saltar al contenido
      </a>
      <StoreHeader roots={roots} cartCount={cartCount} name={settings.name} pickup={pickupAvailable(settings)} freeFrom={settings.freeShippingFrom} onSale={onSale} />
      <main id="contenido" className="mx-auto max-w-7xl px-4 py-8">
        <PageTransition>{children}</PageTransition>
      </main>
      {/* Avisos para lectores de pantalla que deben sobrevivir al cambio de página (p. ej. cuántos productos hay). */}
      <p id="anuncios" role="status" className="sr-only" />
      <StoreFooter roots={roots} settings={settings} consent={!!(env.GA_ID || env.META_PIXEL_ID)} />
      {settings.whatsapp && <WhatsAppButton phone={settings.whatsapp} store={settings.name} />}
      <Analytics gaId={env.GA_ID ?? null} pixelId={env.META_PIXEL_ID ?? null} />
    </>
  );
}
