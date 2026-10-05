# Base de datos

PostgreSQL 16. Esquema en `src/db/schema/`, migraciones SQL en `drizzle/`.

## Tablas

| Área | Tabla | Propósito |
|---|---|---|
| Catálogo | `categories` | Árbol de profundidad libre (`parent_id`), orden con `sort_order`. |
| | `brands` | Marcas; `active` para desactivar sin borrar. |
| | `attribute_definitions` | Atributos extensibles (aroma, talla, registro ISP…): tipo, alcance producto/variante, filtrable. |
| | `products` | Ficha conceptual: nombre, slug, descripción, marca, categoría, `attributes` JSONB, SEO, destacado. |
| | `product_variants` | Unidad vendible: SKU, código de barras, precio, precio anterior, costo, contenido neto + unidad, unidades por pack, stock físico/reservado, stock mínimo. |
| | `product_images` | Imágenes por producto, opcionalmente asociadas a una variante. |
| Inventario | `inventory_movements` | Historial inmutable de cada cambio de stock físico. |
| | `stock_reservations` | Reservas de stock por pedido pendiente de pago (ACTIVE → CONSUMED / RELEASED). |
| Ventas | `carts`, `cart_items` | Carrito en servidor identificado por cookie; solo variante + cantidad (precios y stock se leen al mostrar). No reserva stock. |
| | `orders` | Pedido con totales, `status` y `payment_status` independientes, dirección copiada. |
| | `order_items` | Copia de nombre, SKU y precio al momento de la compra. |
| | `order_status_history` | Quién cambió el estado y cuándo. |
| Despacho | `shipping_rates` | Costo (CLP, IVA incl.) y plazo por región; sin fila = no se despacha a esa región. |
| Pagos | `payments` | Intentos de pago por proveedor. |
| | `payment_events` | Eventos/webhooks recibidos; único por (proveedor, event_id) → idempotencia. |
| Usuarios | `users`, `sessions` | Credenciales (Argon2id) y sesiones (se guarda el hash del token). |
| | `customers`, `addresses` | Cliente (puede ser invitado, `user_id` NULL), RUT, teléfono, direcciones. |
| Chile | `regions`, `communes` | 16 regiones (código CUT) y 346 comunas. |
| Auditoría | `audit_logs` | Usuario, acción, entidad, valores antes/después. |

## Reglas que impone la base de datos

Aunque la aplicación tenga un error, PostgreSQL rechaza:

- `stock_on_hand < 0`, `stock_reserved < 0` o `stock_reserved > stock_on_hand`.
- Movimientos donde `resulting_stock ≠ previous_stock + quantity`, o cantidad 0.
- Editar o borrar un movimiento de inventario (trigger de `0002_movimientos_inmutables.sql`; solo se permite que `created_by` quede en NULL al borrar un usuario).
- Más de una variante por defecto por producto.
- `compare_at_price ≤ price`, precios o costos negativos, `units_per_pack < 1`.
- Pedidos donde `total ≠ subtotal − descuento + envío`; líneas donde `line_total ≠ unit_price × quantity`.
- Emails de usuario con mayúsculas (se normalizan a minúsculas).

## Búsqueda del catálogo

Migración `0001_busqueda.sql`: extensiones `unaccent` y `pg_trgm`, función `f_unaccent()` e índices GIN
`products_search_idx` (texto completo en español sin tildes sobre nombre + descripción corta) y
`products_name_trgm_idx` (trigramas sobre el nombre). Una búsqueda encuentra coincidencias por:
texto completo, parecido (errores de tipeo), parte del nombre o de la marca, y SKU o código de barras exactos.

## Presentación vs. stock

| Ejemplo | `name` | `net_content` | `content_unit` | `units_per_pack` | stock 40 significa |
|---|---|---|---|---|---|
| 1 jabón 90 g | 1 unidad 90 g | 90 | G | 1 | 40 jabones |
| Pack 6 jabones 90 g | Pack 6 x 90 g | 90 | G | 6 | 40 packs (240 jabones) |
| Lavalozas 1,5 L | 1,5 L | 1.5 | L | 1 | 40 botellas |
| Papel higiénico 12 rollos | 12 rollos | — | UNIT | 12 | 40 paquetes |

## Dinero
Montos en CLP como enteros (`integer`), IVA incluido. Ver `netFromGross()` en `src/modules/chile`.

## Migraciones

```bash
# 1. Editar src/db/schema/*.ts
npm run db:generate -- --name descripcion_del_cambio   # genera drizzle/NNNN_*.sql (revisar y commitear)
npm run db:migrate                                    # aplica migraciones pendientes (también en producción)
```

Nunca editar una migración ya aplicada en producción; crear una nueva.
Lo que Drizzle no declara (índices de expresión, triggers) va en una migración SQL propia: `npm run db:generate -- --custom --name descripcion`.

## Datos

- `npm run db:reference` — carga regiones y comunas (idempotente, apto para producción).
- `npm run db:seed` — **borra** y carga datos de prueba (solo desarrollo; se niega con `NODE_ENV=production`).
  22 productos / 32 variantes de marcas ficticias "Demo …", SKU `DEMO-…`, códigos de barra internos (200…),
  descripciones con "[DATO DE PRUEBA]"; incluye destacados, ofertas, agotados y bajo stock.
  Crea el usuario `SUPER_ADMIN` definido por `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
  tarifas de despacho de prueba para las 16 regiones (reemplazarlas por las reales en `/admin/despacho`)
  y 2 pedidos de prueba a través del carrito y del servicio de pedidos (uno pendiente que se cancela solo al vencer su reserva, uno cancelado).
