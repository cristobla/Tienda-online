import "@fontsource-variable/archivo/wdth.css";
import "./globals.css";
import type { Metadata } from "next";
import { env } from "@/lib/env";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(env.APP_URL),
  title: { default: SITE.name, template: `%s | ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, locale: "es_CL", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
