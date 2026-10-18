import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader, Section, StatCard, Table } from "@/components/admin/ui";
import type { SP } from "@/components/store/catalog-view";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatCLP } from "@/modules/chile";
import { addDays, chileDate, parseReportRange, type ReportRange, salesByPeriod, salesSummary, topProducts } from "@/modules/reports";

export const metadata: Metadata = { title: "Reportes" };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
/** "2026-10-18" → "18-10" (día) u "oct 2026" (mes). */
const periodLabel = (p: string, group: ReportRange["group"]) => (group === "mes" ? `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : `${p.slice(8)}-${p.slice(5, 7)}`);
const field = "rounded-md border border-line bg-white px-3 py-2 text-sm";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage("reports:read");
  const r = parseReportRange(await searchParams);
  const [sum, series, top] = await Promise.all([salesSummary(r), salesByPeriod(r), topProducts(r)]);

  const today = chileDate();
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const quick: [string, string, string][] = [
    ["Últimos 7 días", addDays(today, -6), today],
    ["Últimos 30 días", addDays(today, -29), today],
    ["Este mes", monthStart, today],
    ["Mes anterior", `${lastMonthEnd.slice(0, 7)}-01`, lastMonthEnd],
    ["Este año", `${today.slice(0, 4)}-01-01`, today],
  ];
  const max = Math.max(1, ...series.map((x) => x.total));
  const step = Math.ceil(series.length / 8); // etiquetas del eje: a lo más 8
  const range = `desde=${r.from}&hasta=${r.to}`;

  return (
    <>
      <PageHeader title="Reportes" />

      <form className="mb-3 flex flex-wrap items-end gap-2 text-sm">
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Desde</span>
          <input type="date" name="desde" defaultValue={r.from} max={today} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Hasta</span>
          <input type="date" name="hasta" defaultValue={r.to} max={today} className={field} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Agrupar</span>
          <select name="agrupar" defaultValue={r.group} className={field}>
            <option value="dia">Por día</option>
            <option value="mes">Por mes</option>
          </select>
        </label>
        <button className="rounded-md bg-ink px-4 py-2 font-semibold text-white">Ver</button>
      </form>
      <nav aria-label="Períodos" className="mb-6 flex flex-wrap gap-2 text-sm">
        {quick.map(([name, from, to]) => (
          <Link
            key={name}
            href={`/admin/reportes?desde=${from}&hasta=${to}`}
            aria-current={from === r.from && to === r.to ? "page" : undefined}
            className="rounded-md border border-line bg-white px-3 py-1 hover:border-leaf aria-[current=page]:border-leaf aria-[current=page]:bg-leaf aria-[current=page]:text-white"
          >
            {name}
          </Link>
        ))}
      </nav>

      <p className="mb-3 text-sm text-muted">
        Pedidos pagados entre el {r.from.split("-").reverse().join("-")} y el {r.to.split("-").reverse().join("-")}, según la fecha de pago (hora de Chile).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ventas (IVA incluido)" value={formatCLP(sum.total)} icon="trend" />
        <StatCard label="Pedidos pagados" value={sum.orders} icon="cart" />
        <StatCard label="Ticket promedio" value={formatCLP(sum.average)} icon="tag" />
        <StatCard label="Unidades vendidas" value={sum.units} icon="box" />
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-line bg-white px-4 py-3 text-sm">
        {[
          ["Neto", formatCLP(sum.net)],
          ["IVA (19 %)", formatCLP(sum.iva)],
          ["Despacho cobrado", formatCLP(sum.shipping)],
          ["Anulados o devueltos después de pagar", `${sum.reversed.orders} (${formatCLP(sum.reversed.total)})`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="inline text-muted">{k}: </dt>
            <dd className="inline font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6">
        <Section title={r.group === "mes" ? "Ventas por mes" : "Ventas por día"}>
          <div className="overflow-x-auto">
            <ol aria-label={r.group === "mes" ? "Ventas por mes" : "Ventas por día"} className="flex h-52 items-end gap-1" style={{ minWidth: `${series.length * 1.1}rem` }}>
              {series.map((x) => (
                <li key={x.period} title={`${periodLabel(x.period, r.group)}: ${formatCLP(x.total)} · ${x.orders} pedidos`} className="group flex h-full flex-1 flex-col justify-end">
                  <span className="sr-only">
                    {periodLabel(x.period, r.group)}: {formatCLP(x.total)}, {x.orders} pedidos
                  </span>
                  <span aria-hidden className="block rounded-t-sm bg-leaf group-hover:bg-leaf-dark" style={{ height: `${x.total ? Math.max(1.5, (x.total / max) * 100) : 0}%` }} />
                </li>
              ))}
            </ol>
            <ol aria-hidden className="mt-1 flex gap-1 border-t border-line pt-1 text-[0.65rem] text-muted" style={{ minWidth: `${series.length * 1.1}rem` }}>
              {series.map((x, i) => (
                <li key={x.period} className="flex-1 truncate text-center">
                  {i % step === 0 ? periodLabel(x.period, r.group) : ""}
                </li>
              ))}
            </ol>
          </div>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium text-leaf hover:underline">Ver como tabla</summary>
            <div className="mt-3">
              <Table head={[r.group === "mes" ? "Mes" : "Día", "Pedidos", "Ventas"]}>
                {series.map((x) => (
                  <tr key={x.period}>
                    <td>{periodLabel(x.period, r.group)}</td>
                    <td>{x.orders}</td>
                    <td className="font-semibold">{formatCLP(x.total)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </details>
        </Section>

        <Section title="Productos más vendidos">
          <Table head={["Producto", "SKU", "Unidades", "Ventas", "Pedidos"]} empty="Sin ventas en el período.">
            {top.map((p) => (
              <tr key={p.variantId}>
                <td className="min-w-48">
                  <span className="font-semibold">{p.productName}</span>
                  <span className="block text-xs text-muted">{p.variantName}</span>
                </td>
                <td className="whitespace-nowrap font-mono text-xs">{p.sku}</td>
                <td>{p.units}</td>
                <td className="whitespace-nowrap font-semibold">{formatCLP(p.total)}</td>
                <td>{p.orders}</td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section title="Exportar a Excel">
          <p className="mb-3 text-sm text-muted">
            Archivo CSV que Excel abre directo (separado por punto y coma), con neto e IVA por pedido. Incluye datos de clientes: guárdalo en un lugar seguro.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`/admin/reportes/pedidos.csv?${range}&tipo=pagados`} className="inline-flex items-center gap-2 rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-dark">
              <Icon name="download" className="size-4" />
              Pedidos pagados del período
            </a>
            <a href={`/admin/reportes/pedidos.csv?${range}&tipo=todos`} className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold hover:border-leaf hover:text-leaf">
              <Icon name="download" className="size-4" />
              Todos los pedidos creados en el período
            </a>
          </div>
        </Section>
      </div>
    </>
  );
}
