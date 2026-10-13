/** Datos de la tienda que aparecen en la interfaz y en SEO. Cambiar el nombre aquí. */
export const SITE: {
  name: string;
  description: string;
  email: string | null;
  hours: string | null;
  /** Perfiles oficiales (URL completa). null = no se muestra; se enlazan en el pie y en los datos para buscadores. */
  social: { instagram: string | null; facebook: string | null; tiktok: string | null };
} = {
  name: "Tienda",
  description: "Higiene personal, cuidado personal y aseo del hogar con despacho en Chile.",
  // Contacto oficial: se completa antes del lanzamiento (no se publican datos inventados). null = no se muestra.
  email: null,
  hours: null,
  social: { instagram: null, facebook: null, tiktok: null },
};

/** Perfiles definidos, para el pie y para `sameAs` en los datos estructurados. */
export const socialLinks = () =>
  (
    [
      ["Instagram", SITE.social.instagram],
      ["Facebook", SITE.social.facebook],
      ["TikTok", SITE.social.tiktok],
    ] as const
  ).flatMap(([label, url]) => (url ? [{ label, url }] : []));
