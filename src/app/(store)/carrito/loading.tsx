// Esqueleto del carrito mientras se leen precios y stock.
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando carrito" className="animate-pulse">
      <div className="h-9 w-56 rounded-sm bg-mist" />
      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <ul className="divide-y divide-line rounded-md border border-line">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex gap-4 p-4">
              <div className="size-20 rounded-sm bg-mist" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/5 rounded-sm bg-mist" />
                <div className="h-3 w-1/4 rounded-sm bg-mist" />
              </div>
            </li>
          ))}
        </ul>
        <div className="h-64 rounded-md border border-line bg-mist/40" />
      </div>
    </div>
  );
}
