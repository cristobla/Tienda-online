// Cada página de la tienda entra con un fundido corto (template se vuelve a montar al navegar; con "reducir movimiento", nada).
export default function StoreTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
