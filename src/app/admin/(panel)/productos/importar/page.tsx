import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AdminForm, Submit } from "@/components/admin/form";
import { Badge, PageHeader, Pagination, Section, StatCard, Table } from "@/components/admin/ui";
import type { SP } from "@/components/store/catalog-view";
import { readImportFile } from "@/lib/storage";
import { XlsxError } from "@/lib/xlsx";
import { requireStaffPage } from "@/modules/auth/guard";
import {
  buildPlan,
  IMPORTED_VARIANT_NAME,
  importOptionsEntries,
  type PlanRow,
  parseCatalogFile,
  PROFILE_LABELS,
  readImportOptions,
  UPDATABLE,
} from "@/modules/catalog/import";
import { formatCLP } from "@/modules/chile";
import { confirmImportAction, uploadImportAction } from "./actions";

export const metadata: Metadata = { title: "Importar Excel" };

const PAGE_SIZE = 50;
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const VIEWS = { todas: "Todas", errores: "Con errores", advertencias: "Con advertencias", nuevas: "Nuevas", existentes: "Existentes" } as const;
type View = keyof typeof VIEWS;
const inView: Record<View, (r: PlanRow) => boolean> = {
  todas: () => true,
  errores: (r) => r.blocking.length > 0,
  advertencias: (r) => r.warnings.length > 0,
  nuevas: (r) => !r.existing,
  existentes: (r) => Boolean(r.existing),
};
const ACTION_TONE = { crear: "ok", actualizar: "ok", "sin cambios": "off", omitir: "off", excluir: "warn" } as const;
const check = "size-4 accent-leaf";

export default async function ImportPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireStaffPage("catalog:write");
  const sp = await searchParams;
  const get = (k: string) => [sp[k] ?? []].flat();

  if (one(sp.hecho)) return <Result sp={sp} />;

  const hash = String(one(sp.archivo) ?? "");
  const bytes = hash ? await readImportFile(hash) : null;
  if (!bytes) return <Upload expired={Boolean(hash)} />;

  let parsed;
  try {
    parsed = parseCatalogFile(bytes);
  } catch (e) {
    if (e instanceof XlsxError) return <Upload error={e.message} />;
    throw e;
  }
  const fileName = String(one(sp.nombre) ?? "archivo.xlsx").slice(0, 120);
  const opts = readImportOptions(get);
  const plan = await buildPlan(parsed, opts);
  const c = plan.counts;
  const view: View = z.enum(Object.keys(VIEWS) as [View]).catch("todas").parse(one(sp.ver));
  const page = z.coerce.number().int().min(1).max(1000).catch(1).parse(one(sp.pagina));
  const visible = plan.rows.filter(inView[view]);
  const longCodes = plan.rows.filter((r) => r.longNumericCode);
  const base = new URLSearchParams([["archivo", hash], ["nombre", fileName], ...importOptionsEntries(opts)]);
  const href = (changes: Record<string, string>) => {
    const q = new URLSearchParams(base);
    for (const [k, v] of Object.entries(changes)) q.set(k, v);
    return `/admin/productos/importar?${q}`;
  };

  return (
    <>
      <PageHeader title="Importar Excel" back={{ href: "/admin/productos", label: "Productos" }} />
      <p className="-mt-2 mb-6 text-sm text-muted">
        <strong className="text-ink">{fileName}</strong> · {PROFILE_LABELS[plan.profile]} · {c.total} filas. Nada se guarda hasta confirmar.
      </p>
      {parsed.ignoredColumns.length > 0 && (
        <p className="mb-4 text-sm text-muted">Columnas que no se usan: {parsed.ignoredColumns.join(", ")}.</p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatCard label="Se crean" value={c.crear} icon="box" />
        <StatCard label="Se actualizan" value={c.actualizar} icon="sliders" />
        <StatCard label="Sin cambios / omitidas" value={c.sinCambios + c.omitir} icon="layers" />
        <StatCard label="Con errores" value={c.bloqueadas} icon="alert" alert={c.bloqueadas > 0} />
        <StatCard label="Excluidas" value={c.excluir} icon="close" />
        <StatCard label="Con advertencias" value={c.advertencias} icon="chat" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Opciones">
          {/* GET: cambiar una opción recalcula la vista previa; no escribe nada. */}
          <form className="space-y-4 text-sm" action="/admin/productos/importar">
            <input type="hidden" name="archivo" value={hash} />
            <input type="hidden" name="nombre" value={fileName} />
            <input type="hidden" name="opciones" value="1" />
            <label className="flex items-start gap-2">
              <input type="checkbox" name="stock" value="1" defaultChecked={opts.loadStock} className={`${check} mt-0.5`} />
              <span>
                <span className="font-semibold">Cargar stock inicial de variantes nuevas</span>
                <span className="block text-xs text-muted">
                  Desactivado: los productos nuevos quedan con stock 0 (no significa que el dato valga cero). Activado: cada fila nueva necesita una cantidad
                  revisada; se registra como movimiento de inventario. Nunca cambia el stock de productos existentes.
                </span>
              </span>
            </label>
            <fieldset>
              <legend className="mb-1 font-semibold">Si el SKU ya existe</legend>
              <label className="mr-4 inline-flex items-center gap-2">
                <input type="radio" name="existentes" value="actualizar" defaultChecked={opts.existing === "actualizar"} className={check} /> Actualizar los campos marcados
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="existentes" value="omitir" defaultChecked={opts.existing === "omitir"} className={check} /> Omitir
              </label>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(UPDATABLE).map(([k, label]) => (
                  <label key={k} className="inline-flex items-center gap-2">
                    <input type="checkbox" name="campo" value={k} defaultChecked={opts.fields.includes(k as keyof typeof UPDATABLE)} className={check} /> {label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Una celda vacía nunca borra datos. La ausencia de un SKU no elimina ni desactiva productos.</p>
            </fieldset>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="crear" value="1" defaultChecked={opts.createRefs} className={`${check} mt-0.5`} />
              <span>
                <span className="font-semibold">Crear las marcas y categorías que no existen</span>
                {(plan.newBrands.length > 0 || plan.newCategories.length > 0) && (
                  <span className="block text-xs text-muted">
                    {plan.newBrands.length > 0 && <>Marcas: {plan.newBrands.join(", ")}. </>}
                    {plan.newCategories.length > 0 && <>Categorías: {plan.newCategories.join("; ")}.</>}
                  </span>
                )}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="excluir" value="1" defaultChecked={opts.excludeErrors} className={`${check} mt-0.5`} />
              <span>
                <span className="font-semibold">Excluir las filas con errores</span>
                <span className="block text-xs text-muted">Sin marcar, cualquier error impide confirmar. Las filas excluidas se listan en «Con errores».</span>
              </span>
            </label>
            {longCodes.length > 0 && (
              <label className="flex items-start gap-2">
                <input type="checkbox" name="codigos" value="1" defaultChecked={opts.confirmLongCodes} className={`${check} mt-0.5`} />
                <span>
                  <span className="font-semibold">Confirmo los {longCodes.length} códigos largos que en el origen eran números</span>
                  <span className="block font-mono text-xs text-muted">{longCodes.map((r) => r.sku).join(" · ")}</span>
                </span>
              </label>
            )}
            <button className="rounded-md border border-line bg-white px-4 py-2 font-semibold hover:border-leaf">Actualizar vista previa</button>
          </form>
        </Section>

        <Section title="Confirmar">
          <ul className="mb-4 space-y-1 text-sm">
            <li>
              Productos nuevos: <strong>{c.crear}</strong>, con variante «{IMPORTED_VARIANT_NAME}»;{" "}
              {c.publicar ? `${c.publicar} se publican (traen publicar_web=1 y categoría)` : "todos quedan como borrador (no visibles en la tienda)"}.
            </li>
            <li>Stock inicial: {opts.loadStock ? `${c.conStock} movimientos de inventario` : "no se carga (stock 0)"}.</li>
            <li>
              Existentes: {opts.existing === "omitir" ? "se omiten" : `se actualiza ${opts.fields.map((f) => UPDATABLE[f].toLowerCase()).join(", ") || "nada (sin campos marcados)"}`}.
            </li>
            <li>El costo neto y demás datos de origen quedan en la auditoría; no se muestran en la tienda.</li>
          </ul>
          {c.bloqueadas > 0 ? (
            <p role="alert" className="rounded-md border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
              {c.bloqueadas} {c.bloqueadas === 1 ? "fila tiene" : "filas tienen"} errores. Corrige el archivo y súbelo de nuevo, o marca «Excluir las filas con
              errores».{" "}
              <Link href={href({ ver: "errores", pagina: "1" })} className="underline">
                Ver errores
              </Link>
            </p>
          ) : c.crear + c.actualizar === 0 ? (
            <p className="text-sm text-muted">No hay nada que aplicar con estas opciones.</p>
          ) : (
            <AdminForm action={confirmImportAction} className="space-y-3">
              <input type="hidden" name="archivo" value={hash} />
              <input type="hidden" name="nombre" value={fileName} />
              <input type="hidden" name="huella" value={plan.fingerprint} />
              {importOptionsEntries(opts).map(([k, v], i) => (
                <input key={i} type="hidden" name={k} value={v} />
              ))}
              <Submit pendingText="Importando…">
                Confirmar: crear {c.crear} y actualizar {c.actualizar}
              </Submit>
              <p className="text-xs text-muted">Se aplica todo junto: si algo falla no se guarda nada. Si el catálogo cambió desde esta vista previa, se pide revisar de nuevo.</p>
            </AdminForm>
          )}
        </Section>
      </div>

      <nav aria-label="Filtrar filas" className="mb-3 mt-8 flex flex-wrap gap-2 text-sm">
        {(Object.entries(VIEWS) as [View, string][]).map(([k, label]) => (
          <Link
            key={k}
            href={href({ ver: k, pagina: "1" })}
            aria-current={view === k ? "page" : undefined}
            className="rounded-md border border-line bg-white px-3 py-1 hover:border-leaf aria-[current=page]:border-leaf aria-[current=page]:bg-leaf aria-[current=page]:text-white"
          >
            {label} ({plan.rows.filter(inView[k]).length})
          </Link>
        ))}
      </nav>
      <Table head={["Fila", "SKU", "Producto", "Precio", "Stock", "Acción", "Detalle"]} empty="No hay filas en esta vista.">
        {visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
          <tr key={r.line}>
            <td className="whitespace-nowrap text-muted">
              {r.line}
              {r.filaOrigen && <span className="block text-xs">origen {r.filaOrigen}</span>}
            </td>
            <td className="whitespace-pre font-mono text-xs">{r.sku}</td>
            <td className="min-w-48">{r.nombre}</td>
            <td className="whitespace-nowrap">{r.precio === null ? "—" : formatCLP(r.precio)}</td>
            <td>{r.existing ? "—" : opts.loadStock ? (r.stock ?? "?") : "0"}</td>
            <td>
              <Badge tone={r.blocking.length && r.action !== "excluir" ? "bad" : ACTION_TONE[r.action]}>{r.blocking.length && r.action !== "excluir" ? "Error" : r.action}</Badge>
              {r.action === "crear" && !r.blocking.length && <span className="block text-xs text-muted">{r.publish ? "publicado" : "borrador"}</span>}
            </td>
            <td className="min-w-64 space-y-0.5 text-xs">
              {r.blocking.map((m, i) => (
                <p key={`e${i}`} className="font-medium text-oferta">
                  {m}
                </p>
              ))}
              {r.changes.map((ch) => (
                <p key={ch.field}>
                  {ch.field}: <span className="text-muted line-through">{ch.from ?? "—"}</span> → <strong>{ch.to ?? "—"}</strong>
                </p>
              ))}
              {r.warnings.map((m, i) => (
                <p key={`w${i}`} className="text-amber-800">
                  {m}
                </p>
              ))}
            </td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} hasNext={page * PAGE_SIZE < visible.length} href={(n) => href({ ver: view, pagina: String(n) })} />
    </>
  );
}

function Upload({ error, expired = false }: { error?: string; expired?: boolean }) {
  return (
    <>
      <PageHeader title="Importar Excel" back={{ href: "/admin/productos", label: "Productos" }} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Elegir archivo">
          {(error || expired) && (
            <p role="alert" className="mb-4 rounded-md border border-oferta/40 bg-oferta/5 px-4 py-3 text-sm font-medium text-oferta">
              {error ?? "El archivo en revisión ya no está disponible: súbelo de nuevo."}
            </p>
          )}
          <AdminForm action={uploadImportAction} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold">Archivo .xlsx</span>
              <input
                type="file"
                name="archivo"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-mist file:px-3 file:py-2 file:font-semibold"
              />
            </label>
            <Submit pendingText="Leyendo…">Revisar archivo</Submit>
            <p className="text-xs text-muted">Primero verás una vista previa con errores y advertencias por fila; nada se guarda hasta confirmar.</p>
          </AdminForm>
        </Section>
        <Section title="Formatos aceptados">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>
              <strong>Archivo preparado</strong>: hoja <code>Catalogo</code>. Obligatorias <code>sku</code>, <code>nombre</code>, <code>precio_clp</code>; opcionales{" "}
              <code>stock_inicial</code>, <code>publicar_web</code> (0/1), <code>marca</code>, <code>categoria_ruta</code> (ej. «Aseo del hogar &gt; Cocina»),{" "}
              <code>codigo_barras</code>, <code>descripcion</code>. Las columnas <code>*_origen</code>, <code>fila_origen</code> y <code>observaciones</code> son de
              referencia. La hoja <code>Origen</code> no se importa.
            </li>
            <li>
              <strong>Exportación del sistema de origen</strong>: hoja <code>Productos</code>. Obligatorias <code>Código</code>, <code>Nombre</code>,{" "}
              <code>Precio de Venta Bruto</code>; opcionales <code>Stock Global</code> y <code>Activo</code>.
            </li>
            <li>El precio es el bruto en pesos (IVA incluido) y debe ser entero: los decimales no se redondean, se corrigen en el archivo.</li>
            <li>El SKU se guarda tal cual (ceros iniciales, espacios internos, letras). Máx. 10 MB y 5.000 filas; sin fórmulas en los datos.</li>
          </ul>
        </Section>
      </div>
    </>
  );
}

function Result({ sp }: { sp: SP }) {
  const n = (k: string) => Number(one(sp[k]) ?? 0) || 0;
  return (
    <>
      <PageHeader title="Importación aplicada" back={{ href: "/admin/productos", label: "Productos" }} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Productos creados" value={n("created")} icon="box" />
        <StatCard label="Actualizados" value={n("updated")} icon="sliders" />
        <StatCard label="Sin cambios u omitidos" value={n("skipped")} icon="layers" />
        <StatCard label="Excluidos" value={n("excluded")} icon="close" />
        <StatCard label="Movimientos de stock inicial" value={n("stockMovements")} icon="truck" />
        <StatCard label="Marcas creadas" value={n("brands")} icon="tag" />
        <StatCard label="Categorías creadas" value={n("categories")} icon="layers" />
      </div>
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/productos?categoria=ninguna" className="rounded-md bg-leaf px-4 py-2 font-semibold text-white hover:bg-leaf-dark">
          Ver borradores sin categoría
        </Link>
        <Link href="/admin/productos/importar" className="rounded-md border border-line bg-white px-4 py-2 font-semibold hover:border-leaf">
          Importar otro archivo
        </Link>
        <Link href="/admin/auditoria?tipo=catalog" className="rounded-md border border-line bg-white px-4 py-2 font-semibold hover:border-leaf">
          Ver en auditoría
        </Link>
      </div>
    </>
  );
}
