"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, type FormState, handleError } from "@/lib/form";
import { deleteImportFile, readImportFile, stageImportFile } from "@/lib/storage";
import { XLSX_LIMITS, XlsxError } from "@/lib/xlsx";
import { requirePermission } from "@/modules/auth/session";
import { applyImport, parseCatalogFile, readImportOptions } from "@/modules/catalog/import";

/** Paso 1: recibir el archivo, comprobar que se puede leer y dejarlo en revisión. No escribe en la base. */
export async function uploadImportAction(prev: FormState, fd: FormData): Promise<FormState> {
  await requirePermission("catalog:write");
  const file = fd.get("archivo");
  if (!(file instanceof File) || file.size === 0) return fail(prev, fd, "Elige un archivo .xlsx.");
  if (!/\.xlsx$/i.test(file.name)) return fail(prev, fd, "El archivo debe ser .xlsx (Excel). Los .xls antiguos y .csv no se aceptan.");
  if (file.size > XLSX_LIMITS.bytes) return fail(prev, fd, "El archivo supera 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    parseCatalogFile(bytes); // errores de formato (hoja, encabezados, archivo dañado) se muestran aquí
  } catch (e) {
    if (e instanceof XlsxError) return fail(prev, fd, e.message);
    throw e;
  }
  const hash = await stageImportFile(bytes);
  redirect(`/admin/productos/importar?archivo=${hash}&nombre=${encodeURIComponent(file.name.slice(0, 120))}`);
}

/**
 * Paso 2: confirmar. Se vuelve a leer el MISMO archivo (por su hash) y a calcular el plan con la base actual;
 * si no coincide con la huella revisada, no se escribe nada.
 */
export async function confirmImportAction(prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePermission("catalog:write");
  const hash = String(fd.get("archivo") ?? "");
  const bytes = await readImportFile(hash);
  if (!bytes) return fail(prev, fd, "El archivo en revisión ya no está disponible: súbelo de nuevo.");
  let result;
  try {
    result = await applyImport(user.id, {
      bytes,
      fileHash: hash,
      fileName: String(fd.get("nombre") ?? "archivo.xlsx").slice(0, 120),
      options: readImportOptions((k) => fd.getAll(k).map(String)),
      expectedFingerprint: String(fd.get("huella") ?? ""),
    });
  } catch (e) {
    if (e instanceof XlsxError) return fail(prev, fd, e.message);
    return handleError(e, prev, fd);
  }
  await deleteImportFile(hash);
  revalidatePath("/", "layout");
  const q = new URLSearchParams({ hecho: "1", ...Object.fromEntries(Object.entries(result).map(([k, v]) => [k, String(v)])) });
  redirect(`/admin/productos/importar?${q}`);
}
