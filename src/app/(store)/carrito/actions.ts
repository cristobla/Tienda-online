"use server";

import { revalidatePath } from "next/cache";
import { done, fail, fieldErrors, type FormState, formObject, handleError } from "@/lib/form";
import { addItemSchema, addToCart, currentCartId, setCartCookie, setItemQuantity, setItemSchema } from "@/modules/cart";

// El carrito no requiere sesión: se identifica por su cookie. Precios y stock los decide el servicio, no el formulario.

export async function addToCartAction(prev: FormState, fd: FormData): Promise<FormState> {
  const input = addItemSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, Object.values(fieldErrors(input.error))[0]);
  try {
    await setCartCookie(await addToCart(await currentCartId(), input.data));
    revalidatePath("/", "layout"); // contador del carrito en el encabezado
    return done(prev, "Agregado al carrito.");
  } catch (e) {
    return handleError(e, prev, fd);
  }
}

/** Cambiar cantidad o quitar (cantidad 0). */
export async function setCartItemAction(prev: FormState, fd: FormData): Promise<FormState> {
  const input = setItemSchema.safeParse(formObject(fd));
  if (!input.success) return fail(prev, fd, Object.values(fieldErrors(input.error))[0]);
  try {
    await setItemQuantity(await currentCartId(), input.data);
    revalidatePath("/", "layout");
    return { v: (prev.v ?? 0) + 1 };
  } catch (e) {
    revalidatePath("/", "layout"); // el carrito vuelve con el stock actual
    return handleError(e, prev, fd);
  }
}
