import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Solo se optimizan las imágenes subidas desde el panel (servidas por /media).
  images: { localPatterns: [{ pathname: "/media/**", search: "" }] },
  experimental: {
    // Subida de imágenes del panel: hasta 25 MB por envío (cada imagen ≤ 5 MB, se valida en el servidor).
    serverActions: { bodySizeLimit: "25mb" },
  },
};

export default nextConfig;
