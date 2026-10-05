"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { addToCartAction, setCartItemAction } from "@/app/(store)/carrito/actions";
import { Icon } from "@/components/icons";

/**
 * Agregar al carrito. Funciona sin JavaScript (formulario con server action); con JavaScript muestra
 * el resultado en el mismo lugar. `large` = ficha de producto con selector de cantidad; si no, agrega 1.
 */
export function AddToCartForm({ variantId, max, large = false }: { variantId: string; max?: number; large?: boolean }) {
  const [state, action, pending] = useActionState(addToCartAction, {});
  const qty = useRef<HTMLInputElement>(null);
  const step = "grid w-10 place-items-center text-xl text-muted hover:text-leaf";
  return (
    <form action={action}>
      <input type="hidden" name="variantId" value={variantId} />
      <div className={large ? "flex flex-wrap items-stretch gap-3" : ""}>
        {large ? (
          <div role="group" aria-label="Cantidad" className="flex items-center rounded-md border border-line">
            <button type="button" onClick={() => qty.current?.stepDown()} aria-label="Quitar una unidad" className={step}>
              −
            </button>
            <input
              ref={qty}
              name="quantity"
              type="number"
              min={1}
              max={max}
              defaultValue={1}
              required
              inputMode="numeric"
              aria-label="Cantidad"
              className="w-12 border-x border-line bg-transparent py-3 text-center font-semibold"
            />
            <button type="button" onClick={() => qty.current?.stepUp()} aria-label="Agregar una unidad" className={step}>
              +
            </button>
          </div>
        ) : (
          <input type="hidden" name="quantity" value="1" />
        )}
        <button
          disabled={pending}
          className={`flex items-center justify-center gap-2 rounded-md bg-leaf font-bold text-white hover:bg-leaf-dark disabled:cursor-wait disabled:bg-leaf/60 ${
            large ? "flex-1 px-6 py-3.5 text-lg" : "w-full px-3 py-2 text-sm"
          }`}
        >
          <Icon name="cart" className={large ? "size-6" : "size-4"} />
          {pending ? "Agregando…" : large ? "Agregar al carrito" : <span>Agregar<span className="sr-only"> al carrito</span></span>}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="mt-2 text-sm font-medium text-oferta">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className={`mt-2 flex flex-wrap items-center gap-x-2 font-medium text-leaf-dark ${large ? "text-sm" : "text-xs"}`}>
          <span className="flex items-center gap-1">
            <Icon name="check" className="size-4" />
            {state.message}
          </span>
          <Link href="/carrito" className="underline underline-offset-2 hover:text-leaf">
            Ver carrito
          </Link>
        </p>
      )}
    </form>
  );
}

/**
 * Cantidad y quitar de una línea del carrito. Los botones envían la cantidad final (no "+1"),
 * así un doble clic no suma dos veces. Funciona sin JavaScript.
 */
export function CartLineControls({ variantId, name, quantity, canIncrease, fixTo }: { variantId: string; name: string; quantity: number; canIncrease: boolean; fixTo?: number }) {
  const [state, action, pending] = useActionState(setCartItemAction, {});
  const step = "grid w-8 place-items-center py-1.5 text-lg hover:bg-mist hover:text-leaf disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent";
  return (
    <form action={action} className="flex flex-col items-start gap-1.5 sm:items-end">
      <input type="hidden" name="variantId" value={variantId} />
      <fieldset disabled={pending} className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">Cantidad de {name}</legend>
        <div className="flex items-center rounded-md border border-line">
          <button name="quantity" value={quantity - 1} disabled={quantity <= 1} aria-label={`Quitar una unidad de ${name}`} className={step}>
            −
          </button>
          <output aria-live="polite" className="w-9 border-x border-line py-1.5 text-center font-semibold">
            {quantity}
          </output>
          <button name="quantity" value={quantity + 1} disabled={!canIncrease} aria-label={`Agregar una unidad de ${name}`} className={step}>
            +
          </button>
        </div>
        {fixTo !== undefined && (
          <button name="quantity" value={fixTo} className="text-sm font-semibold text-leaf underline-offset-2 hover:underline">
            Dejar {fixTo}
          </button>
        )}
        <button name="quantity" value="0" className="text-sm font-medium text-muted underline-offset-2 hover:text-oferta hover:underline">
          Eliminar<span className="sr-only"> {name}</span>
        </button>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-xs font-medium text-oferta">
          {state.error}
        </p>
      )}
    </form>
  );
}
