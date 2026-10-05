import { readImage } from "@/lib/storage";

// Archivos subidos en tiempo de ejecución: /public solo sirve lo que existía al compilar.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const img = await readImage((await params).name);
  if (!img) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.type,
      // El nombre es un UUID nuevo por archivo: nunca cambia de contenido.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
