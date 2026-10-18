"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/admin/ui";
import { PHOTO_MODES, type PhotoMode, photoOrder } from "@/modules/catalog/photo-names";
import { uploadPhotoAction } from "./actions";

type Row = { name: string; status: "pending" | "added" | "skipped" | "unmatched" | "error"; note?: string; product?: string; productId?: string; sku?: string };
const TONE = { pending: "off", added: "ok", skipped: "off", unmatched: "warn", error: "bad" } as const;
const LABEL = { pending: "En cola", added: "Subida", skipped: "Omitida", unmatched: "Sin coincidencia", error: "Error" } as const;
const MB = 1024 * 1024;

/** Sube las fotos de a una (cada llamada es un envío chico, sin límite de cantidad) y muestra el resultado de cada una. */
export function BulkUpload() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<PhotoMode>("si-vacio");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = (list: FileList | null) => {
    const images = [...(list ?? [])].filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f.name)).sort((a, b) => photoOrder(a.name, b.name));
    setFiles(images);
    setRows(images.map((f) => ({ name: f.name, status: f.size > 15 * MB ? "error" : "pending", note: f.size > 15 * MB ? "Supera 15 MB." : undefined })));
  };

  async function run() {
    setBusy(true);
    const added: string[] = [];
    for (const [i, file] of files.entries()) {
      if (rows[i]?.status !== "pending") continue;
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", mode);
      fd.set("added", JSON.stringify(added));
      let r: Row;
      try {
        const res = await uploadPhotoAction(fd);
        if (res.status === "added") added.push(res.variantId);
        r = { name: file.name, ...res };
      } catch {
        r = { name: file.name, status: "error", note: "No se pudo subir (conexión o servidor). Vuelve a intentarlo con «Solo si no tiene fotos»." };
      }
      setRows((prev) => prev.map((x, j) => (j === i ? r : x)));
    }
    setBusy(false);
    router.refresh();
  }

  const count = (st: Row["status"]) => rows.filter((r) => r.status === st).length;
  const done = rows.length - count("pending");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block rounded-md border border-dashed border-line p-4 text-sm">
          <span className="mb-2 block font-semibold">Elegir fotos</span>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={busy}
            onChange={(e) => pick(e.target.files)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-mist file:px-3 file:py-2 file:font-semibold"
          />
        </label>
        <label className="block rounded-md border border-dashed border-line p-4 text-sm">
          <span className="mb-2 block font-semibold">O una carpeta completa</span>
          <input
            type="file"
            // Atributo no estándar pero soportado por Chrome, Edge, Firefox y Safari.
            {...{ webkitdirectory: "" }}
            disabled={busy}
            onChange={(e) => pick(e.target.files)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-mist file:px-3 file:py-2 file:font-semibold"
          />
        </label>
      </div>

      <fieldset className="space-y-1.5 text-sm" disabled={busy}>
        <legend className="mb-1 font-semibold">Si el producto ya tiene fotos</legend>
        {(Object.entries(PHOTO_MODES) as [PhotoMode, string][]).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="mode" value={k} checked={mode === k} onChange={() => setMode(k)} className="size-4 accent-leaf" />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={run}
          disabled={busy || count("pending") === 0}
          className="rounded-md bg-leaf px-4 py-2 text-sm font-semibold text-white hover:bg-leaf-dark disabled:opacity-50"
        >
          {busy ? `Subiendo ${done} de ${rows.length}…` : `Subir ${count("pending")} foto${count("pending") === 1 ? "" : "s"}`}
        </button>
        {rows.length > 0 && (
          <p className="text-sm text-muted" role="status">
            {count("added")} subidas · {count("skipped")} omitidas · {count("unmatched")} sin coincidencia · {count("error")} con error
          </p>
        )}
      </div>
      {busy && (
        <div className="h-2 overflow-hidden rounded-full bg-mist" aria-hidden>
          <div className="h-full bg-leaf transition-[width]" style={{ width: `${(done / rows.length) * 100}%` }} />
        </div>
      )}

      {rows.length > 0 && (
        <div className="max-h-[32rem] overflow-auto rounded-md border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-mist text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-3 py-2">Archivo</th>
                <th className="px-3 py-2">Resultado</th>
                <th className="px-3 py-2">Producto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
                    {r.note && <span className="ml-2 text-xs text-muted">{r.note}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.productId ? (
                      <Link href={`/admin/productos/${r.productId}`} className="text-leaf hover:underline">
                        {r.product} <span className="font-mono text-xs text-muted">({r.sku})</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
