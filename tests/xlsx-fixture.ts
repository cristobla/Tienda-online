import { deflateRawSync } from "node:zlib";

/**
 * Genera un .xlsx mínimo para las pruebas (los datos reales del negocio no se versionan).
 * Celdas: string → texto (inlineStr); { n: "123" } → número con ese texto exacto en el XML; { f, v } → fórmula;
 * { s: "texto" } → texto compartido (sharedStrings); { str: "texto" } → t="str"; null → vacía.
 */
export type FixtureCell = string | null | { n: string } | { f: string; v?: string } | { s: string } | { str: string };

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** ZIP con entradas comprimidas (deflate), como lo guarda Excel. */
export function zip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const data = deflateRawSync(raw);
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}

/**
 * `dotnet: true` imita el archivo real (generado con el SDK OpenXML de .NET): etiquetas con prefijo
 * (<x:row>, <x:c t="str">…), BOM en las relaciones y destinos absolutos ("/xl/worksheets/…").
 */
export function makeXlsx(sheets: Record<string, FixtureCell[][]>, { dotnet = false } = {}): Uint8Array {
  const names = Object.keys(sheets);
  const shared: string[] = [];
  const cell = (v: FixtureCell, ref: string) => {
    if (v === null) return "";
    if (typeof v === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    if ("n" in v) return `<c r="${ref}"><v>${v.n}</v></c>`;
    if ("f" in v) return `<c r="${ref}"><f>${esc(v.f)}</f><v>${v.v ?? "0"}</v></c>`;
    if ("str" in v) return `<c r="${ref}" t="str"><v>${esc(v.str)}</v></c>`;
    shared.push(v.s);
    return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
  };
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}</Relationships>`,
  };
  names.forEach((name, i) => {
    const rows = sheets[name]!.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, `${col(ci)}${ri + 1}`)).join("")}</row>`).join("");
    files[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  if (shared.length)
    files["xl/sharedStrings.xml"] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
      .map((t) => `<si><t>${esc(t)}</t></si>`)
      .join("")}</sst>`;
  if (dotnet) {
    const prefixed = (xml: string) => xml.replace(/<(\/?)([A-Za-z]\w*)/g, "<$1x:$2").replace(' xmlns="', ' xmlns:x="');
    for (const name of Object.keys(files)) {
      if (name === "xl/workbook.xml" || name.startsWith("xl/worksheets/") || name === "xl/sharedStrings.xml") files[name] = prefixed(files[name]!);
    }
    files["xl/_rels/workbook.xml.rels"] = `﻿${files["xl/_rels/workbook.xml.rels"]!.replace(/Target="worksheets/g, 'Target="/xl/worksheets')}`;
  }
  return zip(files);
}

/** Encabezados del archivo preparado (perfil B), en el orden del Excel real. */
export const PREPARED_HEADERS = [
  "sku",
  "nombre",
  "precio_clp",
  "stock_inicial",
  "activo_origen",
  "publicar_web",
  "marca",
  "categoria_ruta",
  "codigo_barras",
  "descripcion",
  "stock_global_origen",
  "costo_compra_neto_origen",
  "precio_venta_neto_origen",
  "exento_origen",
  "unidad_venta_origen",
  "fraccionable_origen",
  "atributos_origen",
  "fila_origen",
  "observaciones",
];

/** Fila del archivo preparado a partir de los campos que importan en cada prueba. */
export function prepared(r: Partial<Record<(typeof PREPARED_HEADERS)[number], FixtureCell>>): FixtureCell[] {
  return PREPARED_HEADERS.map((h) => r[h] ?? null);
}
