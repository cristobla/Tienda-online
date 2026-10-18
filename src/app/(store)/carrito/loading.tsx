// Esqueleto del carrito mientras se leen precios y stock.
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando carrito" className="animate-pulse">
      <div className="h-12 w-60 rounded-full bg-mist" />
      <div className="mt-8 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_23rem]">
        <ul className="divide-y divide-line rounded-[1.5rem] ring-1 ring-line">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex gap-4 p-5">
              <div className="size-20 rounded-xl bg-mist" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/5 rounded-full bg-mist" />
                <div className="h-3 w-1/4 rounded-full bg-mist" />
              </div>
            </li>
          ))}
        </ul>
        <div className="h-72 rounded-[1.5rem] bg-mist/60 ring-1 ring-line" />
      </div>
    </div>
  );
}
