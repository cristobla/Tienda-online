import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Breadcrumbs } from "@/components/store/catalog-view";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

// Cuentas de cliente (registro, ingreso, mis pedidos): pendientes; el checkout (FASE 6) define "invitado o cuenta".
// Los pedidos ya se asocian a una ficha de cliente (con o sin usuario). El ingreso actual es solo del personal.
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
        <p className="relative mt-2 text-muted">Pronto podrás crear tu cuenta para guardar direcciones y revisar tus pedidos.</p>
        <Link href="/productos" className="btn-buy relative mt-7 px-6 py-3">
          Ver productos
        </Link>
      </div>
    </>
  );
}
