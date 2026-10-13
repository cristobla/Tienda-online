// Esqueleto mientras se consulta el catálogo.
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando productos" className="animate-pulse">
      <div className="h-8 w-64 rounded-sm bg-mist" />
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="rounded-md border border-line p-3 sm:p-4">
            <div className="aspect-square rounded-sm bg-mist" />
            <div className="mt-3 h-3 w-1/3 rounded-sm bg-mist" />
            <div className="mt-2 h-4 w-4/5 rounded-sm bg-mist" />
            <div className="mt-4 h-12 rounded-sm bg-mist" />
          </li>
        ))}
      </ul>
    </div>
  );
}
