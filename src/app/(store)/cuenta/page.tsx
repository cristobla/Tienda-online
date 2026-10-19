import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Breadcrumbs } from "@/components/store/catalog-view";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

// Cuentas de cliente (registro, ingreso, mis pedidos): no existen (decisión comercial pendiente); la compra es como
// invitado. Los pedidos ya se asocian a una ficha de cliente (con o sin usuario). El ingreso actual es solo del personal.
export default function AccountPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Mi cuenta" }]} />
      <div className="relative mx-auto mt-6 max-w-lg overflow-hidden rounded-[1.75rem] bg-paper px-8 py-12 text-center ring-1 ring-line">
        <div aria-hidden className="ondas absolute inset-0 [--ondas-x:50%] [--ondas-y:26%]" />
        <span className="relative mx-auto grid size-16 place-items-center rounded-full bg-white text-leaf-dark ring-1 ring-line">
          <Icon name="user" className="size-8" />
        </span>
        <h1 className="rotulo relative mt-5 text-title">Mi cuenta</h1>
        {/* Sin cuentas de cliente: la página explica cómo se compra y revisa un pedido hoy (antes prometía una función
            que no existe y no ofrecía salida). Ver docs/qa/01-revision-funcional.md (S-01). */}
        <p className="relative mt-2 text-muted">
          Compras sin crear una cuenta: solo necesitas tu email. Con el número de pedido y ese email puedes revisar su estado
          cuando quieras.
        </p>
        <div className="relative mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/seguimiento" className="btn-buy min-h-11 px-6 py-3">
            Sigue tu pedido
          </Link>
          <Link href="/info/ayuda" className="btn-line min-h-11 px-6 py-3">
            Centro de ayuda
          </Link>
        </div>
      </div>
    </>
  );
}
