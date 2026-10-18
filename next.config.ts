import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";
// Medición (src/components/store/analytics.tsx): sus dominios solo se permiten si hay un ID configurado al compilar.
const ga = process.env.GA_ID ? { script: " https://www.googletagmanager.com", connect: " https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com", img: " https://*.google-analytics.com https://www.googletagmanager.com" } : null;
const meta = process.env.META_PIXEL_ID ? { script: " https://connect.facebook.net", connect: " https://www.facebook.com https://connect.facebook.net", img: " https://www.facebook.com" } : null;
const extra = (k: "script" | "connect" | "img") => (ga?.[k] ?? "") + (meta?.[k] ?? "");

/**
 * Política de contenido: solo recursos propios (imágenes, fuentes y scripts se sirven desde la app), sin frames
 * ajenos ni formularios hacia otros sitios.
 * - script-src 'unsafe-inline': Next inyecta scripts en línea (datos de la página) y sin nonce los necesita;
 *   los scripts externos siguen bloqueados. En desarrollo, además eval y websockets (recarga en caliente).
 * - form-action 'self': al implementar una pasarela que reciba el formulario (p. ej. Webpay por POST), agregar su
 *   dominio aquí (docs/PAGOS.md §9). Analytics o píxeles de redes también requieren sumar sus dominios.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}${extra("script")}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${extra("img")}`,
  "font-src 'self'",
  `connect-src 'self'${dev ? " ws: wss:" : ""}${extra("connect")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Solo tiene efecto sobre HTTPS (en http://localhost el navegador lo ignora).
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Solo se optimizan las imágenes subidas desde el panel (servidas por /media).
  images: { localPatterns: [{ pathname: "/media/**", search: "" }] },
  experimental: {
    // Subida de imágenes del panel: hasta 25 MB por envío (cada imagen ≤ 5 MB, se valida en el servidor).
    serverActions: { bodySizeLimit: "25mb" },
  },
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
