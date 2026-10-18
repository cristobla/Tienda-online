import type { Metadata } from "next";
import { DangerButton } from "@/components/admin/form";
import { PageHeader, Table } from "@/components/admin/ui";
import { requireStaffPage } from "@/modules/auth/guard";
import { formatDateTime } from "@/modules/chile";
import { listErrors } from "@/modules/errors";
import { clearErrorsAction } from "./actions";

export const metadata: Metadata = { title: "Errores" };

export default async function ErrorsPage() {
  await requireStaffPage("audit:read");
  const errors = await listErrors();

  return (
    <>
      <PageHeader title="Errores del servidor">
        {errors.length > 0 && (
          <DangerButton action={clearErrorsAction} confirm="¿Marcar todos como revisados? Se borran de la lista; si vuelven a ocurrir, aparecen de nuevo.">
            Marcar todos como revisados
          </DangerButton>
        )}
      </PageHeader>
      <p className="-mt-2 mb-6 max-w-2xl text-sm text-muted">
        Fallas inesperadas de la tienda o del panel (no los errores de formularios). El mismo error en la misma página se cuenta una vez con su total. Si
        algo se repite, compártelo con quien mantiene la tienda.
      </p>
      <Table head={["Última vez", "Dónde", "Error", "Veces"]} empty="Sin errores registrados.">
        {errors.map((e) => (
          <tr key={e.id}>
            <td className="whitespace-nowrap text-xs text-muted">
              {formatDateTime(e.lastAt)}
              {e.count > 1 && <span className="block">desde {formatDateTime(e.firstAt)}</span>}
            </td>
            <td className="whitespace-nowrap font-mono text-xs">
              {e.method && `${e.method} `}
              {e.route}
            </td>
            <td className="min-w-72">
              <span className="font-medium">{e.message}</span>
              {e.stack && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-muted">Detalle técnico</summary>
                  <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-mist p-2 text-[11px]">{e.stack}</pre>
                </details>
              )}
            </td>
            <td className="text-right font-semibold">{e.count}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
