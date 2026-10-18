import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// En cada solicitud: el dominio (APP_URL) es el del servidor, no el de la compilación.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/cuenta", "/carrito", "/checkout"] },
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
