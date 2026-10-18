import type { Metadata } from "next";
import Link from "next/link";
import { AdminForm, Submit, Text } from "@/components/admin/form";
import { Icon } from "@/components/icons";
import { Breadcrumbs } from "@/components/store/catalog-view";
import { trackOrderAction } from "./actions";

export const metadata: Metadata = { title: "Sigue tu pedido", description: "Revisa el estado de tu compra con el número de pedido y tu email." };

export default function TrackOrderPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Sigue tu pedido" }]} />
      <div className="mx-auto mt-4 max-w-lg">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-leaf-soft px-6 py-8 text-center">
          <div aria-hidden className="ondas absolute inset-0 [--ondas-x:50%] [--ondas-y:20%]" />
          <span className="relative mx-auto grid size-14 place-items-center rounded-full bg-white text-leaf ring-1 ring-line">
            <Icon name="truck" className="size-7" />
          </span>
          <h1 className="rotulo relative mt-4 text-display">Sigue tu pedido</h1>
          <p className="relative mt-2 text-sm text-muted">Usa el número que aparece en el correo de confirmación (por ejemplo ORD-001234) y el email con que compraste.</p>
        </div>
        <AdminForm action={trackOrderAction} className="mt-6 space-y-4 rounded-[1.5rem] bg-white p-6 ring-1 ring-line">
          <Text name="number" label="Número de pedido" required maxLength={30} autoComplete="off" placeholder="ORD-001234" />
          <Text name="email" label="Email" type="email" required maxLength={200} autoComplete="email" />
          <Submit variant="buy" pendingText="Buscando…">
            Ver mi pedido
          </Submit>
        </AdminForm>
        <p className="mt-4 text-center text-sm text-muted">
          ¿No lo encuentras?{" "}
          <Link href="/info/contacto" className="font-semibold text-leaf-dark underline-offset-2 hover:underline">
            Escríbenos
          </Link>
          .
        </p>
      </div>
    </>
  );
}
