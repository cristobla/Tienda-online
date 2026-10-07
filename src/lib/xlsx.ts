/**
 * Lector mínimo de .xlsx (Office Open XML) para importar catálogos, sin dependencias: el ZIP se abre con
 * node:zlib y el XML de hoja se lee con expresiones acotadas a ese formato.
 * Devuelve el TEXTO exacto guardado en cada celda, nunca un Number: un SKU largo o con ceros iniciales llega
 * intacto, y una celda numérica conserva el valor tal como está en el XML (el importador decide si es válido).
 * Acepta etiquetas con prefijo de espacio de nombres (<x:row>, <x:c>…), como las escriben herramientas .NET.
 * Las celdas con fórmula vienen marcadas para que el importador las rechace (no se confía en su valor cacheado).
 * ponytail: solo lo que el importador usa (hojas, texto, números, booleanos); estilos y fechas no se interpretan.
 */
import { inflateRawSync } from "node:zlib";

export class XlsxError extends Error {}

export type XlsxCell = {
  /** Texto exacto (con entidades XML decodificadas). Vacío si la celda no tiene valor. */
  text: string;
  /** Celda numérica en el archivo (t="n" o sin tipo): su texto es la representación decimal guardada. */
  numeric: boolean;
  formula: boolean;
  error: boolean;
};
/** Filas con su número real en la hoja (1 = primera fila) y celdas por índice de columna (0 = A). */
export type XlsxRow = { line: number; cells: (XlsxCell | undefined)[] };

export const XLSX_LIMITS = { bytes: 10 * 1024 * 1024, unzipped: 80 * 1024 * 1024, entries: 5000 };

// ───────────── ZIP ─────────────

type Entry = { name: string; method: number; compressed: number; size: number; offset: number };

function unzipIndex(buf: Buffer): Map<string, Entry> {
  // Fin del directorio central: al final del archivo (con un comentario opcional de hasta 64 KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new XlsxError("El archivo no es un Excel válido (.xlsx) o está dañado.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw new XlsxError("Formato ZIP64 no soportado: guarda el archivo de nuevo desde Excel.");
  if (count > XLSX_LIMITS.entries) throw new XlsxError("El archivo tiene demasiadas partes internas.");
  const entries = new Map<string, Entry>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new XlsxError("El archivo Excel está dañado.");
    const nameLen = buf.readUInt16LE(p + 28);
    const e: Entry = {
      method: buf.readUInt16LE(p + 10),
      compressed: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
      name: buf.toString("utf8", p + 46, p + 46 + nameLen),
    };
    total += e.size;
    // Bomba ZIP: el tamaño descomprimido declarado se revisa ANTES de descomprimir (y al descomprimir se exige).
    if (total > XLSX_LIMITS.unzipped) throw new XlsxError("El contenido descomprimido del archivo es demasiado grande.");
    entries.set(e.name, e);
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}

function extract(buf: Buffer, e: Entry): string {
  const p = e.offset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) throw new XlsxError("El archivo Excel está dañado.");
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const data = buf.subarray(start, start + e.compressed);
  let out: Buffer;
  try {
    if (e.method === 0) out = Buffer.from(data);
    else if (e.method === 8) out = inflateRawSync(data, { maxOutputLength: Math.max(e.size, 1) });
    else throw new XlsxError("Compresión no soportada dentro del archivo.");
  } catch (err) {
    if (err instanceof XlsxError) throw err;
    throw new XlsxError("El archivo Excel está dañado o no se puede descomprimir.");
  }
  if (out.length !== e.size) throw new XlsxError("El archivo Excel está dañado.");
  return out.toString("utf8");
}

// ───────────── XML ─────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
/** Entidades XML y los escapes de Excel _xHHHH_ (p. ej. _x000D_ = retorno de carro). */
function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1]?.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m),
    )
    .replace(/_x([0-9A-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
/** Texto de un <si> o <is>: concatena los <t> (texto enriquecido en varios tramos), sin la guía fonética <rPh>. */
const richText = (xml: string) =>
  [...xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, "").matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?t(?:\s[^>]*)?\/>/g)]
    .map((m) => decode(m[1] ?? ""))
    .join("");

function columnIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0];
  if (!letters) return -1;
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

/** Abre el libro: nombres de hojas y lectura de una hoja por nombre. */
export function readWorkbook(bytes: Uint8Array) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length === 0) throw new XlsxError("El archivo está vacío.");
  if (buf.length > XLSX_LIMITS.bytes) throw new XlsxError("El archivo supera 10 MB.");
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new XlsxError("El archivo no es un Excel .xlsx (los .xls antiguos y .csv no se aceptan).");
  const zip = unzipIndex(buf);
  const part = (name: string) => {
    const e = zip.get(name);
    return e ? extract(buf, e) : null;
  };
  const workbook = part("xl/workbook.xml");
  const rels = part("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new XlsxError("El archivo no es un libro de Excel válido.");

  const targets = new Map([...rels.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id"), attr(m[0], "Target")]));
  const sheets = [...workbook.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map((m) => {
    const target = targets.get(m[0].match(/\s[\w]+:id="([^"]*)"/)?.[1]) ?? "";
    return { name: decode(attr(m[0], "name") ?? ""), path: target.startsWith("/") ? target.slice(1) : `xl/${target}` };
  });

  let shared: string[] | undefined;
  const sharedStrings = () => (shared ??= [...(part("xl/sharedStrings.xml") ?? "").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g)].map((m) => richText(m[1] ?? "")));

  return {
    sheetNames: sheets.map((s) => s.name),
    /** Filas de la hoja (solo las que existen en el archivo, en orden). */
    readSheet(name: string): XlsxRow[] {
      const sheet = sheets.find((s) => s.name === name);
      const xml = sheet && part(sheet.path);
      if (!xml) throw new XlsxError(`No se pudo leer la hoja "${name}".`);
      const rows: XlsxRow[] = [];
      let lastLine = 0;
      for (const r of xml.matchAll(/<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)) {
        const line = Number(attr(r[0], "r")) || lastLine + 1;
        lastLine = line;
        const cells: (XlsxCell | undefined)[] = [];
        let lastCol = -1;
        for (const c of (r[2] ?? "").matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
          const ref = attr(c[0], "r");
          const col = ref ? columnIndex(ref) : lastCol + 1;
          lastCol = col;
          const type = attr(c[0], "t") ?? "n";
          const body = c[2] ?? "";
          const v = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
          const text =
            type === "s"
              ? (sharedStrings()[Number(v)] ?? "")
              : type === "inlineStr"
                ? richText(body.match(/<(?:\w+:)?is>([\s\S]*?)<\/(?:\w+:)?is>/)?.[1] ?? "")
                : decode(v ?? "");
          cells[col] = { text, numeric: type === "n", formula: /<(?:\w+:)?f[\s>/]/.test(body), error: type === "e" };
        }
        rows.push({ line, cells });
      }
      return rows;
    },
  };
}
