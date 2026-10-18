import { PageTransition } from "@/components/store/page-transition";

// Transición entre páginas: ver PageTransition (no anima la primera carga, así no retrasa lo que pinta el servidor).
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
