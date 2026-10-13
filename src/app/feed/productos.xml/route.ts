import { productFeedXml } from "@/modules/catalog/feed";

export const dynamic = "force-dynamic";

/** Fuente programada para Google Merchant Center y el catálogo de Meta (ver docs/DESPLIEGUE.md). */
export async function GET() {
  return new Response(await productFeedXml(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
}
