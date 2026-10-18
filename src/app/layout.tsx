import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { env } from "@/lib/env";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: { default: SITE.name, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, locale: "es_CL", type: "website" },
  // Vista previa grande al compartir (X, WhatsApp, Facebook); la imagen general sale de app/opengraph-image.tsx.
  twitter: { card: "summary_large_image" },
};

// Barra del navegador móvil del mismo color (tinta) que la franja superior de la tienda.
export const viewport: Viewport = { themeColor: "#102a33" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
