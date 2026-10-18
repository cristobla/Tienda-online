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
};

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
export const whatsappUrl = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;

/** "+56912345678" → "+56 9 1234 5678" (para mostrar). */
export const formatPhone = (e164: string) => e164.replace(/^\+56(\d)(\d{4})(\d{4})$/, "+56 $1 $2 $3");
