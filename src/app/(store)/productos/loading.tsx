// Esqueleto mientras se consulta el catálogo (misma forma que las tarjetas: producto, repisa y fleje).
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando productos" className="animate-pulse">
      <div className="h-12 w-72 rounded-full bg-mist" />
      <ul className="mt-10 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-7 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="rounded-[1.25rem] p-2 ring-1 ring-line sm:p-2.5">
            <div className="aspect-square rounded-t-[0.95rem] bg-mist" />
            <div className="h-1.5 rounded-b-[3px] bg-line" />
            <div className="ml-2 h-14 w-3/5 rounded-[3px] bg-mist" />
            <div className="mt-4 h-3 w-1/3 rounded-full bg-mist" />
            <div className="mt-2 h-4 w-4/5 rounded-full bg-mist" />
            <div className="mt-5 h-10 rounded-full bg-mist" />
          </li>
        ))}
      </ul>
    </div>
  );
}
