import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

/** Piezas visuales del panel (sin estado). */

export function PageHeader({ title, back, children }: { title: string; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <header className="mb-6 border-b border-line pb-4">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-leaf hover:underline">
          <Icon name="chevron" className="size-4 rotate-180" />
          {back.label}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </header>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "plain" }) {
  const styles = variant === "primary" ? "bg-leaf text-white hover:bg-leaf-dark" : "border border-line bg-white hover:border-leaf hover:text-leaf";
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${styles}`}>
      {children}
    </Link>
  );
}

const tones = {
  ok: "bg-leaf/10 text-leaf-dark ring-leaf/25",
  warn: "bg-fleje/40 text-ink ring-amber-400/50",
  bad: "bg-oferta/10 text-oferta ring-oferta/25",
  off: "bg-mist text-muted ring-line",
} as const;

export function Badge({ tone, children }: { tone: keyof typeof tones; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[tone]}`}>{children}</span>;
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 className="font-bold">{title}</h2>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Indicador del inicio del panel. Con href, toda la tarjeta enlaza al listado filtrado. */
export function StatCard({ label, value, icon, href, alert = false }: { label: string; value: number; icon: IconName; href?: string; alert?: boolean }) {
  const body = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-md ${alert ? "bg-oferta/10 text-oferta" : "bg-leaf-soft text-leaf-dark"}`}>
        <Icon name={icon} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-muted">{label}</span>
        <span className={`block text-3xl font-extrabold leading-tight [font-stretch:80%] ${alert ? "text-oferta" : ""}`}>{value}</span>
      </span>
    </>
  );
  const cls = `flex items-center gap-3 rounded-md border bg-white p-4 ${alert ? "border-oferta/40" : "border-line"}`;
  return href ? (
    <Link href={href} className={`${cls} hover:border-leaf`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Tabla con scroll horizontal propio (la página nunca se desborda en el móvil). */
export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line [&_td]:px-3 [&_td]:py-3 [&_td]:align-middle [&_tr]:hover:bg-paper">
          {hasRows ? (
            children
          ) : (
            <tr>
              <td colSpan={head.length}>
                <EmptyState text={empty ?? "Sin resultados."} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted">
      <span className="grid size-11 place-items-center rounded-full bg-mist">
        <Icon name="box" />
      </span>
      {text}
    </div>
  );
}

export function Pagination({ page, hasNext, href }: { page: number; hasNext: boolean; href: (page: number) => string }) {
  if (page === 1 && !hasNext) return null;
  const btn = "rounded-md border border-line bg-white px-3 py-1.5 font-medium hover:border-leaf hover:text-leaf";
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
