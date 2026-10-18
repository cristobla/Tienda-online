import { ImageResponse } from "next/og";
import { getSettings } from "@/modules/settings";

// Imagen al compartir la tienda en redes y mensajería. Los productos con foto usan la suya (ver su generateMetadata).
// Colores de la identidad (globals.css): tinta, menta y el amarillo del fleje.
export const alt = "Imagen de la tienda";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Con los datos vigentes de la tienda (la compilación no tiene base de datos).
export const dynamic = "force-dynamic";

export default async function OpengraphImage() {
  const st = await getSettings();
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#102a33", color: "white" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <svg width="120" height="120" viewBox="0 0 40 40" style={{ marginRight: 28 }}>
          <path d="M20 7.5s9 9.6 9 16a9 9 0 0 1-18 0c0-6.4 9-16 9-16Z" fill="#4fe0a8" />
          <path d="M15.6 24.4a4.8 4.8 0 0 0 3.9 4.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div style={{ fontSize: 112, fontWeight: 800, letterSpacing: -3 }}>{st.name}</div>
      </div>
      <div style={{ marginTop: 28, fontSize: 40, maxWidth: 920, opacity: 0.85 }}>{st.description}</div>
      <div style={{ marginTop: 48, fontSize: 30, background: "#ffe14d", color: "#102a33", padding: "10px 24px", borderRadius: 4, alignSelf: "flex-start" }}>
        Despacho a todo Chile · Precios con IVA incluido
      </div>
    </div>,
    size,
  );
}
