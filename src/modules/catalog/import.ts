/**
 * Importación de catálogo desde Excel (.xlsx). El archivo es solo una entrada: después de confirmar,
 * PostgreSQL es la fuente de verdad y el catálogo se mantiene desde /admin.
 *
 * Flujo: leer + validar (sin escribir) → plan contra la base → vista previa → confirmar. Al confirmar se vuelve
 * a calcular el plan dentro de la transacción y se exige que sea idéntico al revisado (huella); todo se aplica
 * en UNA transacción (productos, variantes, stock inicial vía applyMovement, marcas/categorías y auditoría).
 *
 * Perfiles: "preparado" (hoja Catalogo, encabezados normalizados) y "origen" (hoja Productos, exportación del
 * sistema de origen). Ambos terminan en la misma fila interna y la misma validación.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Transaction, type Tx } from "@/db";
import * as s from "@/db/schema";
import { UserError } from "@/lib/form";
import { slugify } from "@/lib/slug";
import { readWorkbook, type XlsxCell, XlsxError } from "@/lib/xlsx";
import { audit } from "@/modules/audit";
import { insertProduct, skuSchema } from "./admin";

export const IMPORT_MAX_ROWS = 5000;
/** Nombre de la variante por defecto de un producto importado: el origen vende por unidad ("ud"). */
export const IMPORTED_VARIANT_NAME = "Unidad";

// ───────────── Perfiles y encabezados ─────────────

/** Normalización limitada de encabezados: minúsculas, sin tildes, separadores → espacio. "Código" = "codigo". */
const normHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Field =
  | "sku"
  | "nombre"
  | "precio"
  | "stock"
  | "activoOrigen"
  | "publicar"
  | "marca"
  | "categoria"
  | "barcode"
  | "descripcion"
  | "stockOrigen"
  | "costoNetoOrigen"
  | "precioNetoOrigen"
  | "exentoOrigen"
  | "filaOrigen"
  | "observaciones";

const PROFILES = {
  preparado: {
    label: "Archivo preparado (hoja Catalogo)",
    sheet: "Catalogo",
    required: ["sku", "nombre", "precio"] as Field[],
    columns: {
      sku: "sku",
      nombre: "nombre",
      "precio clp": "precio",
      "stock inicial": "stock",
      "activo origen": "activoOrigen",
      "publicar web": "publicar",
      marca: "marca",
      "categoria ruta": "categoria",
      "codigo barras": "barcode",
      descripcion: "descripcion",
      "stock global origen": "stockOrigen",
      "costo compra neto origen": "costoNetoOrigen",
      "precio venta neto origen": "precioNetoOrigen",
      "exento origen": "exentoOrigen",
      "fila origen": "filaOrigen",
      observaciones: "observaciones",
    } as Record<string, Field>,
    /** Columnas de referencia conocidas que no se usan (no se informan como desconocidas). */
    known: ["unidad venta origen", "fraccionable origen", "atributos origen"],
  },
  origen: {
    label: "Exportación del sistema de origen (hoja Productos)",
    sheet: "Productos",
    required: ["sku", "nombre", "precio"] as Field[],
    columns: {
      codigo: "sku",
      nombre: "nombre",
      "precio de venta bruto": "precio",
      "stock global": "stock",
      activo: "activoOrigen",
      descripcion: "descripcion",
      "precio de compra neto": "costoNetoOrigen",
      "precio de venta neto": "precioNetoOrigen",
      exento: "exentoOrigen",
    } as Record<string, Field>,
    known: ["param 1", "param 2", "param 3", "param 4", "unidad", "fraccionable", "impuesto adic compra", "impuesto adic venta", "atributos"],
  },
} as const;
export type ImportProfile = keyof typeof PROFILES;
export const PROFILE_LABELS: Record<ImportProfile, string> = { preparado: PROFILES.preparado.label, origen: PROFILES.origen.label };

/** Campos que se pueden actualizar en un SKU existente (elegidos explícitamente; por defecto solo el precio). */
export const UPDATABLE = {
  precio: "Precio",
  nombre: "Nombre del producto",
  descripcion: "Descripción",
  marca: "Marca",
  categoria: "Categoría",
  barcode: "Código de barras",
  publicar: "Publicación",
} as const;
export type Updatable = keyof typeof UPDATABLE;

export type ImportOptions = {
  /** Cargar stock inicial (solo variantes nuevas), como movimiento INITIAL_STOCK. */
  loadStock: boolean;
  /** Qué hacer con un SKU que ya existe. */
  existing: "omitir" | "actualizar";
  fields: Updatable[];
  /** Crear las marcas y categorías que el archivo nombra y no existen (lista visible en la vista previa). */
  createRefs: boolean;
  /** Dejar fuera las filas con errores (lista visible); si no, un error bloquea toda la importación. */
  excludeErrors: boolean;
  /** El administrador confirmó los códigos largos que en el origen eran celdas numéricas. */
  confirmLongCodes: boolean;
};
export const DEFAULT_OPTIONS: ImportOptions = { loadStock: false, existing: "actualizar", fields: ["precio"], createRefs: false, excludeErrors: false, confirmLongCodes: false };

/**
 * Opciones desde la URL de la vista previa o desde el formulario de confirmación (mismos nombres).
 * "opciones=1" indica que el formulario de opciones se envió: sin esa marca rigen los valores por defecto
 * (así desmarcar todos los campos no vuelve a marcar "precio").
 */
export function readImportOptions(get: (key: string) => string[]): ImportOptions {
  if (!get("opciones").includes("1")) return DEFAULT_OPTIONS;
  const on = (k: string) => get(k).includes("1");
  const given = get("campo");
  return {
    loadStock: on("stock"),
    existing: get("existentes")[0] === "omitir" ? "omitir" : "actualizar",
    fields: (Object.keys(UPDATABLE) as Updatable[]).filter((f) => given.includes(f)), // orden fijo: la huella no depende del orden
    createRefs: on("crear"),
    excludeErrors: on("excluir"),
    confirmLongCodes: on("codigos"),
  };
}

/** Lo inverso: pares clave/valor para repetir las opciones en enlaces y campos ocultos. */
export function importOptionsEntries(o: ImportOptions): [string, string][] {
  return [
    ["opciones", "1"],
    ...(o.loadStock ? [["stock", "1"] as [string, string]] : []),
    ["existentes", o.existing],
    ...o.fields.map((f) => ["campo", f] as [string, string]),
    ...(o.createRefs ? [["crear", "1"] as [string, string]] : []),
    ...(o.excludeErrors ? [["excluir", "1"] as [string, string]] : []),
    ...(o.confirmLongCodes ? [["codigos", "1"] as [string, string]] : []),
  ];
}

// ───────────── Lectura y validación por fila (sin base de datos) ─────────────

export type SourceRow = {
  line: number;
  filaOrigen: string | null;
  sku: string;
  nombre: string;
  precio: number | null;
  stock: number | null;
  activoOrigen: string | null;
  publicar: boolean | null;
  marca: string | null;
  categoria: string[] | null;
  barcode: string | null;
  descripcion: string | null;
  /** Datos del origen que no se escriben en el catálogo (solo auditoría): costo neto, precio neto, exento, stock. */
  origen: Record<string, string>;
  longNumericCode: boolean;
  errors: string[];
  warnings: string[];
};

const OBSERVATIONS: Record<string, string> = {
  codigo_largo: "Código de más de 15 caracteres",
  codigo_numerico_mas_15_digitos: "Código largo que en el origen era una celda numérica",
  nombre_repetido_sku_distinto: "Nombre repetido con otro SKU",
  precio_fraccionario: "Precio con decimales en el origen",
  stock_faltante: "Sin dato de stock en el origen",
  stock_negativo: "Stock negativo en el origen",
  precio_bajo_revisar: "Precio muy bajo: revisar",
};

const INT = /^-?\d+(\.0+)?$/;
const BARCODE = /^(\d{8}|\d{12,14})$/;

/**
 * Lee el libro y devuelve las filas validadas. Errores de archivo (hoja, encabezados) → XlsxError.
 * Nunca convierte códigos a número: el SKU es el texto exacto de la celda (NFC + recorte exterior).
 */
export function parseCatalogFile(bytes: Uint8Array) {
  const wb = readWorkbook(bytes);
  const found = (Object.keys(PROFILES) as ImportProfile[]).filter((p) => wb.sheetNames.includes(PROFILES[p].sheet));
  if (found.length === 0)
    throw new XlsxError(`No se encontró la hoja "Catalogo" (archivo preparado) ni "Productos" (exportación del origen). Hojas: ${wb.sheetNames.join(", ")}.`);
  if (found.length > 1) throw new XlsxError('El archivo tiene las hojas "Catalogo" y "Productos": deja solo la que quieres importar.');
  const profile = found[0]!;
  const def = PROFILES[profile];

  const rows = wb.readSheet(def.sheet);
  const header = rows[0];
  if (!header || header.line !== 1) throw new XlsxError(`La hoja "${def.sheet}" debe tener los encabezados en la fila 1.`);
  const colOf = new Map<Field, number>();
  const ignored: string[] = [];
  header.cells.forEach((cell, i) => {
    if (!cell?.text.trim()) return;
    const key = normHeader(cell.text);
    const field = def.columns[key];
    if (!field) {
      if (!(def.known as readonly string[]).includes(key)) ignored.push(cell.text.trim());
      return;
    }
    if (colOf.has(field)) throw new XlsxError(`Encabezado repetido: "${cell.text.trim()}".`);
    colOf.set(field, i);
  });
  const missing = def.required.filter((f) => !colOf.has(f));
  if (missing.length)
    throw new XlsxError(
      `Faltan columnas obligatorias en "${def.sheet}": ${missing.map((f) => Object.entries(def.columns).find(([, v]) => v === f)?.[0]).join(", ")}.`,
    );

  const data = rows.slice(1).filter((r) => r.cells.some((c) => c?.text.trim()));
  if (data.length === 0) throw new XlsxError(`La hoja "${def.sheet}" no tiene filas de productos.`);
  if (data.length > IMPORT_MAX_ROWS) throw new XlsxError(`La hoja tiene ${data.length} filas; el máximo por importación es ${IMPORT_MAX_ROWS}.`);

  const parsed = data.map((r) => parseRow(r.line, (f) => (colOf.has(f) ? r.cells[colOf.get(f)!] : undefined), profile));

  // SKU y códigos de barras repetidos dentro del mismo archivo (después de normalizar).
  for (const key of ["sku", "barcode"] as const) {
    const seen = new Map<string, SourceRow[]>();
    for (const r of parsed) if (r[key]) seen.set(r[key]!, [...(seen.get(r[key]!) ?? []), r]);
    for (const [value, list] of seen)
      if (list.length > 1)
        for (const r of list)
          r.errors.push(`${key === "sku" ? "SKU" : "Código de barras"} "${value}" repetido en el archivo (filas ${list.map((x) => x.line).join(", ")}).`);
  }
  return { profile, rows: parsed, ignoredColumns: ignored };
}

function parseRow(line: number, get: (f: Field) => XlsxCell | undefined, profile: ImportProfile): SourceRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = (f: Field) => get(f)?.text.normalize("NFC").trim() ?? "";
  const opt = (f: Field) => text(f) || null;
  for (const f of ["sku", "nombre", "precio", "stock", "publicar", "marca", "categoria", "barcode", "descripcion"] as Field[]) {
    const c = get(f);
    if (c?.formula) errors.push(`La columna ${f} tiene una fórmula: escribe el valor directamente.`);
    if (c?.error) errors.push(`La columna ${f} tiene un error de Excel (${c.text}).`);
  }

  // SKU: texto exacto. Una celda numérica larga pudo perder dígitos en Excel: no se acepta en silencio.
  const skuCell = get("sku");
  const sku = skuSchema.safeParse(skuCell?.text ?? "");
  if (!sku.success) errors.push(`SKU: ${sku.error.issues[0]!.message}.`);
  // El archivo preparado señala en "observaciones" los códigos que en el origen eran celdas numéricas largas.
  const longNumericCode = /codigo_numerico_mas_15_digitos/.test(text("observaciones"));
  if (skuCell?.numeric && skuCell.text && (!/^\d+$/.test(skuCell.text) || skuCell.text.replace(/^0+/, "").length > 15))
    errors.push("El código está guardado como número con más de 15 dígitos (o con decimales): Excel pudo alterarlo. Guárdalo como texto o usa el archivo preparado.");

  const nombre = text("nombre");
  if (!nombre) errors.push("Falta el nombre.");
  else if (nombre.length > 200) errors.push("El nombre supera 200 caracteres.");

  // Precio bruto CLP: entero. 1000.0 se acepta como 1000; 2011.1 no se redondea ni se trunca.
  const rawPrice = text("precio");
  let precio: number | null = null;
  if (!rawPrice) errors.push("Falta el precio de venta bruto.");
  else if (!/^\d+(\.0+)?$/.test(rawPrice)) errors.push(`Precio "${rawPrice}" no es un entero en pesos: corrígelo en el archivo (no se redondea).`);
  else {
    precio = Number(rawPrice.split(".")[0]);
    if (precio < 1) errors.push("El precio debe ser mayor que 0.");
    else if (precio > 100_000_000) errors.push("Precio fuera de rango.");
    else if (precio < 100) warnings.push(`Precio muy bajo ($${precio}): revisar antes de publicar.`);
  }

  // Stock: solo se valida aquí; si se usa lo decide la opción "cargar stock inicial".
  const rawStock = text("stock");
  let stock: number | null = null;
  if (rawStock && INT.test(rawStock)) stock = Number(rawStock.split(".")[0]);
  else if (rawStock) warnings.push(`Stock "${rawStock}" no es un número entero.`);
  const origenStock = text("stockOrigen") || rawStock;
  if (origenStock.startsWith("-")) warnings.push(`Stock negativo en el origen (${origenStock}): no es una cantidad válida.`);
  else if (!origenStock) warnings.push("Sin dato de stock en el origen.");
  if (stock !== null && stock < 0) stock = null; // negativo nunca es stock cargable

  const activoOrigen = opt("activoOrigen");
  if (activoOrigen === "0") warnings.push("Inactivo en el sistema de origen.");

  const rawPublish = text("publicar");
  let publicar: boolean | null = null;
  if (rawPublish === "1") publicar = true;
  else if (rawPublish === "0") publicar = false;
  else if (rawPublish) errors.push(`publicar_web debe ser 0 o 1 (vale "${rawPublish}").`);

  const barcode = opt("barcode");
  if (barcode && !BARCODE.test(barcode)) errors.push(`Código de barras "${barcode}": debe ser EAN-8, UPC-12, EAN-13 o GTIN-14 (solo dígitos).`);

  const descripcion = opt("descripcion");
  if (descripcion && descripcion.length > 10_000) errors.push("La descripción supera 10.000 caracteres.");
  const marca = opt("marca");
  if (marca && marca.length > 80) errors.push("La marca supera 80 caracteres.");
  const ruta = opt("categoria");
  const categoria = ruta ? ruta.split(/\s*[>›]\s*/).filter(Boolean) : null;

  // Observaciones del archivo, sin repetir lo que esta validación ya informó.
  const covered = /^(stock_faltante|stock_negativo|precio_fraccionario|codigo_numerico_mas_15_digitos)$/;
  for (const code of text("observaciones").split(/[,;]\s*/).filter(Boolean))
    if (!covered.test(code) && !(code === "precio_bajo_revisar" && precio !== null && precio < 100) && !(code === "codigo_largo" && longNumericCode))
      warnings.push(OBSERVATIONS[code] ?? `Observación: ${code}`);
  // El código largo numérico se resuelve en el plan: error hasta que se confirme, aviso una vez confirmado.

  const origen = Object.fromEntries(
    (["costoNetoOrigen", "precioNetoOrigen", "exentoOrigen", "stockOrigen", "activoOrigen"] as Field[]).flatMap((f) => (text(f) ? [[f, text(f)]] : [])),
  );
  if (rawStock && !text("stockOrigen")) origen.stockOrigen = rawStock;

  return {
    line,
    filaOrigen: opt("filaOrigen"),
    sku: sku.success ? sku.data : (skuCell?.text ?? ""),
    nombre,
    precio,
    stock,
    activoOrigen,
    publicar,
    marca,
    categoria,
    barcode,
    descripcion,
    origen: { ...origen, perfil: profile },
    longNumericCode,
    errors,
    warnings,
  };
}

// ───────────── Plan contra la base ─────────────

export type PlanAction = "crear" | "actualizar" | "sin cambios" | "omitir" | "excluir";
export type PlanRow = SourceRow & {
  action: PlanAction;
  /** Errores que bloquean (de la fila + de la base + de las opciones). */
  blocking: string[];
  existing: { productId: string; variantId: string } | null;
  changes: { field: string; from: string | null; to: string | null }[];
  stockToLoad: number;
  publish: boolean;
  slug: string | null;
};

const normName = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Plan de la importación: qué se crea, actualiza u omite y por qué. No escribe nada. */
export async function buildPlan(parsed: ReturnType<typeof parseCatalogFile>, opts: ImportOptions, tx: Tx = db) {
  const skus = parsed.rows.map((r) => r.sku).filter(Boolean);
  // En serie: dentro de una transacción todas las consultas van por la misma conexión.
  const variants = skus.length
    ? await tx
        .select({ v: s.productVariants, p: s.products })
        .from(s.productVariants)
        .innerJoin(s.products, eq(s.products.id, s.productVariants.productId))
        .where(inArray(s.productVariants.sku, skus))
    : [];
  // ponytail: carga todos los slugs (cientos/miles); consulta por prefijo si el catálogo llega a decenas de miles.
  const slugRows = await tx.select({ slug: s.products.slug }).from(s.products);
  const brands = await tx.select({ id: s.brands.id, name: s.brands.name }).from(s.brands);
  const cats = await tx.select({ id: s.categories.id, name: s.categories.name, parentId: s.categories.parentId }).from(s.categories);
  const barcodes = await tx
    .select({ barcode: s.productVariants.barcode, sku: s.productVariants.sku })
    .from(s.productVariants)
    .where(sql`${s.productVariants.barcode} IS NOT NULL`);
  const bySku = new Map(variants.map((x) => [x.v.sku, x]));
  const usedSlugs = new Set(slugRows.map((r) => r.slug));
  const brandByName = new Map(brands.map((b) => [normName(b.name), b.id]));
  const barcodeOwner = new Map(barcodes.map((b) => [b.barcode!, b.sku]));
  // Rutas completas del árbol ("Aseo > Cocina"), comparadas sin tildes ni mayúsculas: ramas homónimas no se confunden.
  const catById = new Map(cats.map((c) => [c.id, c]));
  const pathOf = (id: string): string[] => {
    const c = catById.get(id)!;
    return c.parentId ? [...pathOf(c.parentId), c.name] : [c.name];
  };
  const catByPath = new Map(cats.map((c) => [pathOf(c.id).map(normName).join(" > "), c.id]));
  const catNames = new Map(cats.map((c) => [pathOf(c.id).map(normName).join(" > "), pathOf(c.id).join(" › ")]));
  const brandNames = new Map(brands.map((b) => [b.id, b.name]));

  const newBrands = new Map<string, string>(); // normalizado → como viene en el archivo
  const newCategories = new Map<string, string[]>();
  const productUpdates = new Map<string, Record<string, string | null>>(); // detecta cambios de ficha incompatibles

  const rows: PlanRow[] = parsed.rows.map((r) => {
    const blocking = [...r.errors];
    const found = r.sku ? bySku.get(r.sku) : undefined;
    const existing = found ? { productId: found.p.id, variantId: found.v.id } : null;
    const warnings = [...r.warnings]; // copia: el plan no modifica las filas leídas
    if (r.longNumericCode)
      if (opts.confirmLongCodes) warnings.push("Código largo de origen numérico, confirmado como SKU.");
      else blocking.push("Código largo que en el origen era una celda numérica: confirma que corresponde al producto (opción «Confirmo los códigos largos»).");

    // Referencias: existentes por comparación normalizada; nuevas solo con la opción explícita.
    const brandKey = r.marca ? normName(r.marca) : null;
    let brandId = brandKey ? (brandByName.get(brandKey) ?? null) : null;
    if (brandKey && !brandId) {
      if (opts.createRefs) newBrands.set(brandKey, r.marca!);
      else blocking.push(`La marca "${r.marca}" no existe (créala en /admin o marca "crear marcas y categorías").`);
    }
    const catKey = r.categoria ? r.categoria.map(normName).join(" > ") : null;
    let categoryId = catKey ? (catByPath.get(catKey) ?? null) : null;
    if (catKey && !categoryId) {
      if (opts.createRefs) newCategories.set(catKey, r.categoria!);
      else blocking.push(`La categoría "${r.categoria!.join(" > ")}" no existe (créala en /admin o marca "crear marcas y categorías").`);
    }
    const hasCategory = Boolean(categoryId || (catKey && opts.createRefs));
    if (r.barcode && barcodeOwner.has(r.barcode) && barcodeOwner.get(r.barcode) !== r.sku)
      blocking.push(`El código de barras ${r.barcode} ya lo usa el SKU ${barcodeOwner.get(r.barcode)}.`);

    const base = { ...r, warnings, blocking, existing, changes: [] as PlanRow["changes"], stockToLoad: 0, publish: false, slug: null as string | null };

    if (!existing) {
      if (opts.loadStock) {
        if (r.stock === null) blocking.push("Stock inicial desconocido o negativo: escribe una cantidad revisada o desactiva la carga de stock.");
        else base.stockToLoad = r.stock;
      }
      base.publish = r.publicar === true && hasCategory;
      if (r.publicar === true && !hasCategory) warnings.push("Queda como borrador: para publicar falta la categoría.");
      if (!blocking.length) {
        const root = slugify(r.nombre) || slugify(r.sku) || "producto";
        let slug = usedSlugs.has(root) ? `${root}-${slugify(r.sku) || "sku"}` : root;
        for (let n = 2; usedSlugs.has(slug); n++) slug = `${root}-${slugify(r.sku)}-${n}`;
        usedSlugs.add(slug);
        base.slug = slug;
      }
      return { ...base, action: blocking.length ? (opts.excludeErrors ? "excluir" : "crear") : "crear" };
    }

    // SKU existente: se usa su producto y variante actuales; solo los campos elegidos, y vacío no borra.
    if (opts.existing === "omitir") return { ...base, blocking: [], action: "omitir" };
    const p = found!.p;
    const v = found!.v;
    const want = (f: Updatable) => opts.fields.includes(f);
    const change = (field: string, from: string | null, to: string | null) => from !== to && base.changes.push({ field, from, to });
    if (want("precio") && r.precio !== null) change("Precio", String(v.price), String(r.precio));
    if (want("barcode") && r.barcode) change("Código de barras", v.barcode, r.barcode);
    const fichaFields: Record<string, string | null> = {};
    if (want("nombre") && r.nombre) (fichaFields.nombre = r.nombre), change("Nombre", p.name, r.nombre);
    if (want("descripcion") && r.descripcion) (fichaFields.descripcion = r.descripcion), change("Descripción", p.description, r.descripcion);
    if (want("marca") && brandKey)
      (fichaFields.marca = brandKey), change("Marca", p.brandId ? (brandNames.get(p.brandId) ?? null) : null, brandId ? brandNames.get(brandId)! : r.marca);
    if (want("categoria") && catKey)
      (fichaFields.categoria = catKey), change("Categoría", p.categoryId ? pathOf(p.categoryId).join(" › ") : null, catNames.get(catKey) ?? r.categoria!.join(" › "));
    if (want("publicar") && r.publicar !== null) {
      const willHaveCategory = Boolean((want("categoria") && catKey) || p.categoryId);
      if (r.publicar && !willHaveCategory) blocking.push("No se puede publicar: el producto no tiene categoría.");
      fichaFields.publicar = String(r.publicar);
      change("Publicación", p.active ? "publicado" : "borrador", r.publicar ? "publicado" : "borrador");
    }
    // Varias filas que apuntan al mismo producto con datos de ficha distintos: conflicto, no se elige uno al azar.
    const prev = productUpdates.get(p.id);
    if (prev && Object.keys(fichaFields).some((k) => k in prev && prev[k] !== fichaFields[k]))
      blocking.push("Otra fila del archivo propone datos distintos para este mismo producto.");
    productUpdates.set(p.id, { ...prev, ...fichaFields });
    if (opts.loadStock) warnings.push("El stock de un SKU existente no se modifica desde Excel (usa un ajuste de inventario).");

    const action: PlanAction = blocking.length ? (opts.excludeErrors ? "excluir" : "actualizar") : base.changes.length ? "actualizar" : "sin cambios";
    return { ...base, action };
  });

  const counts = {
    total: rows.length,
    crear: rows.filter((r) => r.action === "crear" && !r.blocking.length).length,
    actualizar: rows.filter((r) => r.action === "actualizar" && !r.blocking.length).length,
    sinCambios: rows.filter((r) => r.action === "sin cambios").length,
    omitir: rows.filter((r) => r.action === "omitir").length,
    excluir: rows.filter((r) => r.action === "excluir").length,
    bloqueadas: rows.filter((r) => r.blocking.length && r.action !== "excluir").length,
    advertencias: rows.filter((r) => r.warnings.length).length,
    publicar: rows.filter((r) => r.action === "crear" && !r.blocking.length && r.publish).length,
    conStock: rows.filter((r) => r.action === "crear" && !r.blocking.length && r.stockToLoad > 0).length,
  };
  const plan = { profile: parsed.profile, rows, counts, newBrands: [...newBrands.values()], newCategories: [...newCategories.values()].map((p) => p.join(" › ")) };
  return { ...plan, fingerprint: fingerprint(plan, opts) };
}

/** Huella de lo que se va a escribir: si cambia entre la vista previa y la confirmación, hay que revisar de nuevo. */
function fingerprint(plan: { rows: PlanRow[]; newBrands: string[]; newCategories: string[] }, opts: ImportOptions) {
  const material = plan.rows.map((r) => [r.line, r.sku, r.action, r.blocking.length, r.precio, r.stockToLoad, r.publish, r.slug, r.changes]);
  return createHash("sha256").update(JSON.stringify([material, plan.newBrands, plan.newCategories, opts])).digest("hex").slice(0, 32);
}

// ───────────── Aplicar (confirmación) ─────────────

export type ImportResult = { created: number; updated: number; skipped: number; excluded: number; stockMovements: number; brands: number; categories: number };

/**
 * Aplica la importación en UNA transacción. `fileHash` + opciones identifican la importación: la misma no se
 * aplica dos veces (doble clic, reintento o dos pestañas), y un plan distinto al revisado se rechaza.
 */
export async function applyImport(
  userId: string,
  input: { bytes: Uint8Array; fileHash: string; fileName: string; options: ImportOptions; expectedFingerprint: string },
): Promise<ImportResult> {
  const parsed = parseCatalogFile(input.bytes);
  const importId = `${input.fileHash.slice(0, 24)}:${createHash("sha256").update(JSON.stringify(input.options)).digest("hex").slice(0, 12)}`;
  return db.transaction(async (tx) => {
    // ponytail: una importación a la vez (bloqueo global); basta para un panel con pocos administradores.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('catalog-import'))`);
    const [done] = await tx
      .select({ id: s.auditLogs.id })
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.action, "catalog.import"), eq(s.auditLogs.entityId, importId)));
    if (done) throw new UserError("Esta importación (mismo archivo y opciones) ya se aplicó.");

    const plan = await buildPlan(parsed, input.options, tx);
    if (plan.fingerprint !== input.expectedFingerprint)
      throw new UserError("El catálogo cambió desde la vista previa (o las opciones no coinciden). Revisa la vista previa de nuevo antes de confirmar.");
    if (plan.counts.bloqueadas) throw new UserError(`Hay ${plan.counts.bloqueadas} filas con errores: corrígelas o elige excluirlas.`);
    const ctx = { importId, archivo: input.fileName };

    // Referencias nuevas (solo las listadas en la vista previa, con la opción explícita).
    const brandIds = new Map((await tx.select({ id: s.brands.id, name: s.brands.name }).from(s.brands)).map((b) => [normName(b.name), b.id]));
    for (const name of plan.newBrands) {
      const slug = await freeSlug(name, async (x) => (await tx.select({ id: s.brands.id }).from(s.brands).where(eq(s.brands.slug, x)))[0]);
      const [b] = await tx.insert(s.brands).values({ name, slug }).returning();
      brandIds.set(normName(name), b!.id);
      await audit(tx, { userId, action: "brand.create", entityType: "brand", entityId: b!.id, after: { ...b, ...ctx } });
    }
    const categoryIds = await ensureCategories(tx, userId, plan.newCategories, ctx);

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, excluded: plan.counts.excluir, stockMovements: 0, brands: plan.newBrands.length, categories: categoryIds.created };
    for (const r of plan.rows) {
      if (r.action === "excluir") continue;
      if (r.action === "omitir" || r.action === "sin cambios") {
        result.skipped++;
        continue;
      }
      const brandId = r.marca ? (brandIds.get(normName(r.marca)) ?? null) : null;
      const categoryId = r.categoria ? (categoryIds.byPath.get(r.categoria.map(normName).join(" > ")) ?? null) : null;
      const origen = { ...r.origen, filaOrigen: r.filaOrigen, fila: r.line, ...ctx };

      if (r.action === "crear") {
        const { product, variant } = await insertProduct(
          tx,
          userId,
          {
            product: {
              name: r.nombre,
              slug: r.slug,
              shortDescription: null,
              description: r.descripcion,
              brandId,
              categoryId,
              active: r.publish,
              featured: false,
              metaTitle: null,
              metaDescription: null,
            },
            attributes: {},
            variant: {
              sku: r.sku,
              barcode: r.barcode,
              name: IMPORTED_VARIANT_NAME,
              price: r.precio!,
              compareAtPrice: null,
              costPrice: null, // el costo neto de origen queda en la auditoría hasta acordar su convención
              netContent: null,
              contentUnit: "UNIT",
              unitsPerPack: 1,
              minimumStock: 0,
              sortOrder: 0,
              active: true,
            },
            variantAttributes: {},
            initialStock: r.stockToLoad,
          },
          `Stock inicial importado (${input.fileName})`,
        );
        if (r.stockToLoad > 0) result.stockMovements++;
        await audit(tx, { userId, action: "product.import", entityType: "product", entityId: product.id, after: { product, variant, origen } });
        result.created++;
        continue;
      }

      // Actualizar SKU existente: solo los campos elegidos que traen dato.
      const want = (f: Updatable) => input.options.fields.includes(f);
      const [pBefore] = await tx.select().from(s.products).where(eq(s.products.id, r.existing!.productId)).for("update");
      const [vBefore] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, r.existing!.variantId)).for("update");
      const vSet: Partial<typeof s.productVariants.$inferInsert> = {};
      if (want("precio") && r.precio !== null) vSet.price = r.precio;
      if (want("barcode") && r.barcode) vSet.barcode = r.barcode;
      const pSet: Partial<typeof s.products.$inferInsert> = {};
      if (want("nombre") && r.nombre) pSet.name = r.nombre;
      if (want("descripcion") && r.descripcion) pSet.description = r.descripcion;
      if (want("marca") && brandId) pSet.brandId = brandId;
      if (want("categoria") && categoryId) pSet.categoryId = categoryId;
      if (want("publicar") && r.publicar !== null) pSet.active = r.publicar;
      // Un precio anterior que ya no es mayor que el nuevo precio dejaría de ser oferta válida (CHECK de la base).
      if (vSet.price !== undefined && vBefore!.compareAtPrice !== null && vBefore!.compareAtPrice <= vSet.price) vSet.compareAtPrice = null;
      const [vAfter] = Object.keys(vSet).length ? await tx.update(s.productVariants).set(vSet).where(eq(s.productVariants.id, vBefore!.id)).returning() : [vBefore];
      const [pAfter] = Object.keys(pSet).length ? await tx.update(s.products).set(pSet).where(eq(s.products.id, pBefore!.id)).returning() : [pBefore];
      await audit(tx, {
        userId,
        action: "product.import",
        entityType: "product",
        entityId: pBefore!.id,
        before: { product: pick(pBefore!, Object.keys(pSet)), variant: { sku: vBefore!.sku, ...pick(vBefore!, Object.keys(vSet)) } },
        after: { product: pick(pAfter!, Object.keys(pSet)), variant: { sku: vAfter!.sku, ...pick(vAfter!, Object.keys(vSet)) }, origen },
      });
      result.updated++;
    }

    await audit(tx, {
      userId,
      action: "catalog.import",
      entityType: "catalog",
      entityId: importId,
      after: { archivo: input.fileName, perfil: plan.profile, opciones: input.options, resultado: result },
    });
    return result;
  });
}

const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(keys.map((k) => [k, o[k as keyof T]]));

/** Primer slug libre: "nombre", "nombre-2", "nombre-3"… */
async function freeSlug(name: string, taken: (slug: string) => Promise<unknown>) {
  const root = slugify(name) || "item";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    if (!(await taken(slug))) return slug;
  }
}

/** Crea las rutas de categoría faltantes (autorizadas en la vista previa) y devuelve ruta normalizada → id. */
async function ensureCategories(tx: Transaction, userId: string, paths: string[], ctx: Record<string, string>) {
  const all = await tx.select({ id: s.categories.id, name: s.categories.name, parentId: s.categories.parentId }).from(s.categories);
  const byPath = new Map<string, string>();
  const byId = new Map(all.map((c) => [c.id, c]));
  const pathOf = (id: string): string[] => {
    const c = byId.get(id)!;
    return c.parentId ? [...pathOf(c.parentId), c.name] : [c.name];
  };
  for (const c of all) byPath.set(pathOf(c.id).map(normName).join(" > "), c.id);
  let created = 0;
  for (const display of paths) {
    const parts = display.split(" › ");
    let parentId: string | null = null;
    for (let i = 0; i < parts.length; i++) {
      const key = parts
        .slice(0, i + 1)
        .map(normName)
        .join(" > ");
      let id: string | undefined = byPath.get(key);
      if (!id) {
        const slug = await freeSlug(parts.slice(0, i + 1).join(" "), async (x) => (await tx.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.slug, x)))[0]);
        const [row]: (typeof s.categories.$inferSelect)[] = await tx.insert(s.categories).values({ name: parts[i]!, slug, parentId }).returning();
        id = row!.id;
        byPath.set(key, id);
        created++;
        await audit(tx, { userId, action: "category.create", entityType: "category", entityId: id, after: { ...row, ...ctx } });
      }
      parentId = id;
    }
  }
  return { byPath, created };
}
