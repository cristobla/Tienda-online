import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Breadcrumbs } from "@/components/store/catalog-view";

export const metadata: Metadata = { title: "Mi cuenta", robots: { index: false, follow: false } };

// Las cuentas de clientes llegan con los pedidos (FASE 5); el ingreso actual es solo del personal.
export default function AccountPage() {
  return (
    <>
      <Breadcrumbs items={[{ name: "Inicio", href: "/" }, { name: "Mi cuenta" }]} />
      <div className="mx-auto mt-6 max-w-md rounded-md border border-line bg-white p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-leaf-soft text-leaf-dark">
          <Icon name="user" className="size-7" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">Mi cuenta</h1>
        <p className="mt-2 text-muted">Pronto podrás crear tu cuenta para guardar direcciones y revisar tus pedidos.</p>
        <Link href="/productos" className="mt-6 inline-block rounded-md bg-leaf px-5 py-2.5 font-semibold text-white hover:bg-leaf-dark">
          Ver productos
        </Link>
      </div>
    </>
  );
}
