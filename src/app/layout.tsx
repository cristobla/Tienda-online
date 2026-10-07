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
};

// Barra del navegador móvil del mismo verde que la franja superior de la tienda.
export const viewport: Viewport = { themeColor: "#0a5e4d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
