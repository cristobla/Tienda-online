// Esqueleto del panel mientras carga la página.
export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="animate-pulse">
      <div className="mb-6 h-9 w-56 rounded-sm bg-line/60" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 rounded-md border border-line bg-white" />
        ))}
      </div>
      <div className="mt-8 h-72 rounded-md border border-line bg-white" />
    </div>
  );
}
