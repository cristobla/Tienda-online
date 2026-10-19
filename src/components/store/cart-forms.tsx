"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { addToCartAction, setCartItemAction } from "@/app/(store)/carrito/actions";
import { Icon } from "@/components/icons";
import { track } from "./analytics";

/**
 * Agregar al carrito. Funciona sin JavaScript (formulario con server action); con JavaScript muestra
 * el resultado en el mismo lugar. `large` = ficha de producto con selector de cantidad; si no, agrega 1.
 */
export function AddToCartForm({
  variantId,
  max,
  large = false,
  item,
}: {
  variantId: string;
  max?: number;
  large?: boolean;
  /** Para la medición (si la persona la aceptó). */
  item?: { sku: string; name: string; price: number };
}) {
  const [state, action, pending] = useActionState(addToCartAction, {});
  const qty = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!state.message || !item) return;
    const quantity = Number(qty.current?.value) || 1;
    track("add_to_cart", { value: item.price * quantity, items: [{ ...item, quantity }] });
    // Solo cuando llega una respuesta nueva (state.v cambia en cada envío).
  }, [state.v]);
  const step = "grid w-11 place-items-center self-stretch text-xl text-muted transition-colors hover:text-ink";
  return (
    <form action={action}>
      <input type="hidden" name="variantId" value={variantId} />
      <div className={large ? "flex flex-wrap items-stretch gap-3" : ""}>
        {large ? (
          <div role="group" aria-label="Cantidad" className="flex items-center rounded-full border-[1.5px] border-ink/20 bg-white">
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
              className="w-12 [appearance:textfield] bg-transparent py-3 text-center text-lg font-bold [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button type="button" onClick={() => qty.current?.stepUp()} aria-label="Agregar una unidad" className={step}>
              +
            </button>
          </div>
        ) : (
          <input type="hidden" name="quantity" value="1" />
        )}
        <button disabled={pending} className={`btn-buy ${large ? "flex-1 px-6 py-3.5 text-lg" : "min-h-11 w-full px-3 py-2 text-sm"}`}>
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
        <p role="status" className={`mt-2 flex animate-drop-in flex-wrap items-center gap-x-2 font-medium text-leaf-dark ${large ? "text-sm" : "text-xs"}`}>
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
 * Foco tras cambiar una cantidad: la línea se vuelve a montar con la cantidad nueva (key) y el botón usado desaparece.
 * Se recuerda cuál fue (+ o −) para devolverle el foco; si se eliminó la línea, el foco va al título del carrito.
 */
let refocus: string | null = null;

/**
 * Cantidad y quitar de una línea del carrito. Los botones envían la cantidad final (no "+1"),
 * así un doble clic no suma dos veces. Funciona sin JavaScript.
 */
export function CartLineControls({ variantId, name, quantity, canIncrease, fixTo }: { variantId: string; name: string; quantity: number; canIncrease: boolean; fixTo?: number }) {
  const [state, action, pending] = useActionState(setCartItemAction, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const label = refocus;
    if (!label || !form.current || (document.activeElement && document.activeElement !== document.body)) return;
    const steps = [...form.current.querySelectorAll<HTMLButtonElement>("button[aria-label]")];
    const same = steps.find((b) => b.getAttribute("aria-label") === label);
    if (!same) return;
    refocus = null;
    (same.disabled ? steps.find((b) => !b.disabled) : same)?.focus();
  }, []);
  const step = "grid size-11 place-items-center text-lg transition-colors hover:bg-mist hover:text-leaf-dark disabled:cursor-not-allowed disabled:text-line disabled:hover:bg-transparent";
  return (
    <form
      ref={form}
      action={action}
      onSubmit={(e) => {
        const used = (e.nativeEvent as SubmitEvent).submitter;
        refocus = used?.getAttribute("aria-label") ?? null;
        // Eliminar: la línea desaparece; el foco pasa al título (no se pierde en el documento).
        if (used?.getAttribute("value") === "0") document.getElementById("carrito-titulo")?.focus();
      }}
      className="flex flex-col items-start gap-1.5 sm:items-end"
    >
      <input type="hidden" name="variantId" value={variantId} />
      <fieldset disabled={pending} className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">Cantidad de {name}</legend>
        <div className="flex items-center overflow-hidden rounded-full border-[1.5px] border-ink/15 bg-white">
          <button name="quantity" value={quantity - 1} disabled={quantity <= 1} aria-label={`Quitar una unidad de ${name}`} className={step}>
            −
          </button>
          <output aria-live="polite" className="w-9 text-center font-bold">
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
        <button name="quantity" value="0" className="min-h-11 px-1 text-sm font-medium text-muted underline-offset-2 hover:text-oferta hover:underline">
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
