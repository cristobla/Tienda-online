import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

// Imagen al compartir la tienda en redes y mensajería. Los productos con foto usan la suya (ver su generateMetadata).
export const alt = SITE.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0a5e4d", color: "white" }}>
      <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>{SITE.name}</div>
      <div style={{ marginTop: 24, fontSize: 40, maxWidth: 900, opacity: 0.9 }}>{SITE.description}</div>
      <div style={{ marginTop: 48, fontSize: 30, background: "#ffe14d", color: "#14302b", padding: "10px 24px", borderRadius: 8, alignSelf: "flex-start" }}>
        Despacho a todo Chile · Precios con IVA incluido
      </div>
    </div>,
    size,
  );
}
