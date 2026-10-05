import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Tienda", template: "%s | Tienda" },
  description: "Higiene personal, cuidado personal y aseo del hogar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL">
      <body>{children}</body>
    </html>
  );
}
