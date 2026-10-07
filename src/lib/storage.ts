/**
 * Imágenes subidas desde el panel. Se guardan en UPLOAD_DIR y se sirven por /media/[name].
 * ponytail: disco local (un servidor con volumen persistente); agregar adaptador S3-compatible
 * con las mismas tres funciones cuando exista el bucket de producción.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { UserError } from "./form";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Sin SVG a propósito: puede llevar JavaScript.
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif" } as const;
type Ext = keyof typeof TYPES;

/** Formato real según los primeros bytes; no se confía en el nombre ni en el tipo que declara el navegador. */
export function sniffImage(b: Uint8Array): Ext | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(4, 8) === "ftyp" && /^avi[fs]$/.test(ascii(8, 12))) return "avif";
  return null;
}

/** Mensaje apto para mostrar en el formulario. */
export class StorageError extends UserError {}

// Solo nombres generados por saveImage: impide leer o borrar fuera de la carpeta (../, rutas absolutas).
const NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|avif)$/;
const dir = () => path.resolve(env.UPLOAD_DIR);

export const IMAGE_SIDE = { min: 100, max: 8000 };

/** Valida y guarda la imagen. Devuelve la URL pública. */
export async function saveImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new StorageError(`"${file.name}" supera 5 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) throw new StorageError(`"${file.name}" no es JPG, PNG, WebP ni AVIF.`);
  // La firma no basta: se decodifica de verdad (contenido falso o dañado no pasa) y se miden las dimensiones.
  const { default: sharp } = await import("sharp");
  let size: { width?: number; height?: number };
  try {
    const img = sharp(bytes, { limitInputPixels: IMAGE_SIDE.max * IMAGE_SIDE.max, failOn: "error" });
    size = await img.metadata();
    await img.resize(16, 16, { fit: "inside" }).toBuffer();
  } catch {
    throw new StorageError(`"${file.name}" está dañada o no es una imagen válida.`);
  }
  const { width = 0, height = 0 } = size;
  if (Math.min(width, height) < IMAGE_SIDE.min) throw new StorageError(`"${file.name}" es muy pequeña (${width}×${height}); mínimo ${IMAGE_SIDE.min} px por lado.`);
  if (Math.max(width, height) > IMAGE_SIDE.max) throw new StorageError(`"${file.name}" es demasiado grande (${width}×${height}); máximo ${IMAGE_SIDE.max} px por lado.`);
  const name = `${randomUUID()}.${ext}`;
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), name), bytes);
  return `/media/${name}`;
}

export async function readImage(name: string) {
  if (!NAME.test(name)) return null;
  try {
    return { bytes: await readFile(path.join(dir(), name)), type: TYPES[name.split(".")[1] as Ext] };
  } catch {
    return null;
  }
}

/** Borra el archivo si es una imagen subida; ignora URLs externas o ya borradas. */
export async function deleteImageFile(url: string) {
  const name = url.replace(/^\/media\//, "");
  if (NAME.test(name)) await unlink(path.join(dir(), name)).catch(() => {});
}

// ── Archivos de importación en revisión: carpeta privada (/media solo sirve nombres UUID de la raíz). ──

const HASH = /^[0-9a-f]{64}$/;
const importDir = () => path.join(dir(), ".importaciones");
const DAY_MS = 86_400_000;

/** Guarda el Excel subido para la vista previa; el nombre es su SHA-256 (la confirmación queda atada a ese archivo). */
export async function stageImportFile(bytes: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  await mkdir(importDir(), { recursive: true });
  await writeFile(path.join(importDir(), `${hash}.xlsx`), bytes);
  // Limpieza perezosa: lo que quedó en revisión más de un día se borra.
  for (const f of await readdir(importDir()).catch(() => [])) {
    const p = path.join(importDir(), f);
    if (Date.now() - (await stat(p)).mtimeMs > DAY_MS) await unlink(p).catch(() => {});
  }
  return hash;
}

export async function readImportFile(hash: string): Promise<Uint8Array | null> {
  if (!HASH.test(hash)) return null;
  return readFile(path.join(importDir(), `${hash}.xlsx`)).catch(() => null);
}

export async function deleteImportFile(hash: string) {
  if (HASH.test(hash)) await unlink(path.join(importDir(), `${hash}.xlsx`)).catch(() => {});
}
