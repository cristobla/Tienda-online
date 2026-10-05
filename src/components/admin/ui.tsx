import Link from "next/link";

/** Piezas visuales del panel (sin estado). */

export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="text-sm text-muted hover:text-leaf hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </header>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "plain" }) {
  const styles = variant === "primary" ? "bg-leaf text-white hover:bg-leaf-dark" : "border border-line bg-white hover:border-leaf";
  return (
    <Link href={href} className={`inline-block rounded-md px-4 py-2 text-sm font-semibold ${styles}`}>
      {children}
    </Link>
  );
}

const tones = {
  ok: "bg-leaf/10 text-leaf-dark",
  warn: "bg-fleje/60 text-ink",
  bad: "bg-oferta/10 text-oferta",
  off: "bg-mist text-muted",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Tabla con scroll horizontal propio (la página nunca se desborda en el móvil). */
export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-mist text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle">
          {hasRows ? (
            children
          ) : (
            <tr>
              <td colSpan={head.length} className="py-8 text-center text-muted">
                {empty ?? "Sin resultados."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, hasNext, href }: { page: number; hasNext: boolean; href: (page: number) => string }) {
  if (page === 1 && !hasNext) return null;
  const btn = "rounded-md border border-line bg-white px-3 py-1.5 hover:border-leaf";
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center gap-3 text-sm">
      {page > 1 && (
        <Link href={href(page - 1)} className={btn}>
          ← Anterior
        </Link>
      )}
      <span className="text-muted">Página {page}</span>
      {hasNext && (
        <Link href={href(page + 1)} className={btn}>
          Siguiente →
        </Link>
      )}
    </nav>
  );
}
