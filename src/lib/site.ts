/**
 * Datos de la tienda: tipo, valores por omisión y ayudas sin dependencias (sirven también en componentes de cliente).
 * Los datos vigentes se editan en el panel (/admin/tienda) y se leen con getSettings() de src/modules/settings.
 */
export type StoreSettings = {
  name: string;
  description: string;
  email: string | null;
  /** Celular en E.164 (+56912345678): enlace a WhatsApp. */
  whatsapp: string | null;
  hours: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  /** Recibe el aviso de cada pedido nuevo. */
  orderNotifyEmail: string | null;
  /** Local físico: calle y número, comuna y región. */
  storeAddress: string | null;
  storeCommune: string | null;
  storeRegion: string | null;
  /** Ficha del local en Google Maps (Perfil de Empresa). */
  mapsUrl: string | null;
  /** Enlace «Pedir reseñas» del Perfil de Empresa en Google. */
  reviewUrl: string | null;
  /** Ofrecer retiro en el local en el checkout. */
  pickupEnabled: boolean;
  /** Despacho gratis desde este monto de productos (con descuento); se edita en Promociones. */
  freeShippingFrom: number | null;
};

/** Sin datos guardados: nombre y descripción genéricos, y nada de contacto (no se publican datos inventados). */
export const DEFAULT_SETTINGS: StoreSettings = {
  name: "Tienda",
  description: "Higiene personal, cuidado personal y aseo del hogar con despacho en Chile.",
  email: null,
  whatsapp: null,
  hours: null,
  instagram: null,
  facebook: null,
  tiktok: null,
  orderNotifyEmail: null,
  storeAddress: null,
  storeCommune: null,
  storeRegion: null,
  mapsUrl: null,
  reviewUrl: null,
  pickupEnabled: false,
  freeShippingFrom: null,
};

/** Costo de despacho a cobrar: gratis si los productos (ya con descuento) alcanzan el monto de la promoción. */
export const shippingCost = (cost: number, goods: number, st: Pick<StoreSettings, "freeShippingFrom">) =>
  st.freeShippingFrom !== null && goods >= st.freeShippingFrom ? 0 : cost;

/** Perfiles definidos, para el pie y para `sameAs` en los datos estructurados. */
export const socialLinks = (st: StoreSettings) =>
  (
    [
      ["Instagram", st.instagram],
      ["Facebook", st.facebook],
      ["TikTok", st.tiktok],
    ] as const
  ).flatMap(([label, url]) => (url ? [{ label, url }] : []));

/** wa.me recibe el número sin "+" ni espacios. */
export const whatsappUrl = (e164: string, text?: string) => `https://wa.me/${e164.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** "+56912345678" → "+56 9 1234 5678" (para mostrar). */
export const formatPhone = (e164: string) => e164.replace(/^\+56(\d)(\d{4})(\d{4})$/, "+56 $1 $2 $3");

/** "Av. Siempre Viva 742, Providencia, Región Metropolitana", o null si no hay local. */
export const storeAddressLine = (st: StoreSettings) =>
  st.storeAddress ? [st.storeAddress, st.storeCommune, st.storeRegion].filter(Boolean).join(", ") : null;

/** "Cómo llegar": la ficha de Google Maps si está, si no una búsqueda de la dirección. */
export const mapsLink = (st: StoreSettings) => {
  const line = storeAddressLine(st);
  if (st.mapsUrl) return st.mapsUrl;
  return line ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${st.name}, ${line}`)}` : null;
};

/** Hay retiro en el local solo si está activado y hay una dirección que mostrar. */
export const pickupAvailable = (st: StoreSettings) => st.pickupEnabled && !!st.storeAddress;
