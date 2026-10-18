"use server";

import { z } from "zod";
import { UserError } from "@/lib/form";
import { requirePermission } from "@/modules/auth/session";
import { attachPhotoBySku, PHOTO_MODES, type PhotoMode, type PhotoResult } from "@/modules/catalog/photos";

const input = z.object({
  mode: z.enum(Object.keys(PHOTO_MODES) as [PhotoMode, ...PhotoMode[]]),
  added: z.array(z.uuid()).max(10_000),
});

const json = (v: FormDataEntryValue | null) => {
  try {
    return JSON.parse(String(v ?? "[]"));
  } catch {
    return null;
  }
};

/** Una foto por llamada (el panel las envía en fila). Un archivo inválido no detiene la carga: se informa y sigue. */
export async function uploadPhotoAction(fd: FormData): Promise<PhotoResult | { status: "error"; note: string }> {
  const user = await requirePermission("catalog:write");
  const file = fd.get("file");
  const parsed = input.safeParse({ mode: fd.get("mode"), added: json(fd.get("added")) });
  if (!(file instanceof File) || file.size === 0 || !parsed.success) return { status: "error", note: "Envío inválido." };
  try {
    return await attachPhotoBySku(user.id, file, parsed.data.mode, parsed.data.added);
  } catch (e) {
    if (e instanceof UserError) return { status: "error", note: e.message };
    throw e;
  }
}
