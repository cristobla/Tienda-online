const LABELS: Record<string, string> = {
  "product.create": "creó un producto",
  "product.update": "editó un producto",
  "product.delete": "eliminó un producto",
  "variant.create": "creó una variante",
  "variant.update": "editó una variante",
  "variant.delete": "eliminó una variante",
  "variant.set_default": "cambió la variante principal",
  "image.add": "subió imágenes",
  "image.update": "editó una imagen",
  "image.delete": "eliminó una imagen",
  "category.create": "creó una categoría",
  "category.update": "editó una categoría",
  "category.delete": "eliminó una categoría",
  "brand.create": "creó una marca",
  "brand.update": "editó una marca",
  "brand.delete": "eliminó una marca",
  "attribute.create": "creó un atributo",
  "attribute.update": "editó un atributo",
  "attribute.delete": "eliminó un atributo",
  "user.create": "creó un usuario",
  "user.update": "cambió rol o estado de un usuario",
  "user.password_reset": "cambió la contraseña de un usuario",
  "order.status": "cambió el estado de un pedido",
  "shipping.update": "cambió las tarifas de despacho",
  "product.import": "creó o actualizó un producto desde Excel",
  "catalog.import": "importó un catálogo desde Excel",
  "payment.result": "registró el resultado de un pago",
  "payment.confirm_transfer": "confirmó una transferencia",
  "payment.resolve": "cerró una incidencia de pago (devuelto)",
  "payment.settings": "cambió la cuenta para transferencias",
  "payment.method": "habilitó o deshabilitó un medio de pago",
};

export const actionLabel = (action: string) => LABELS[action] ?? action;

/** Enlace a la entidad en el panel (si todavía tiene página). */
export function entityHref(type: string, id: string): string | null {
  const base = { product: "productos", category: "categorias", brand: "marcas", attribute: "atributos", user: "usuarios", order: "pedidos" }[type];
  if (type === "shipping") return "/admin/despacho";
  if (type === "payment") return `/admin/pagos/${id}`;
  if (type === "payment_method") return "/admin/pagos/configuracion";
  return base ? `/admin/${base}/${id}` : null;
}
