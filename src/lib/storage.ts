/**
 * Imágenes subidas desde el panel. Se guardan en UPLOAD_DIR y se sirven por /media/[name].
 * ponytail: disco local (un servidor con volumen persistente); agregar adaptador S3-compatible
 * con las mismas tres funciones cuando exista el bucket de producción.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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

/** Valida y guarda la imagen. Devuelve la URL pública. */
export async function saveImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) throw new StorageError(`"${file.name}" supera 5 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) throw new StorageError(`"${file.name}" no es JPG, PNG, WebP ni AVIF.`);
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
