# Plataforma e-commerce (Chile) — Análisis técnico y arquitectura propuesta

Estado: **aprobada** (2026-10-05). FASE 1, 2 y 3 implementadas.

## 1. Entorno existente

Proyecto vacío: no hay código, repositorio ni stack previo. Disponible: Node 22, PostgreSQL 16, Docker. Por lo tanto se propone un stack nuevo.

## 2. Stack propuesto

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript (estricto) | Un solo lenguaje en front y back; tipos compartidos. |
| Framework | Next.js (App Router) | SSR/SSG para SEO, rutas API para webhooks, server actions para el panel. Un solo despliegue. |
| Base de datos | PostgreSQL 16 | Transacciones, `CHECK`, bloqueo de filas, JSONB, búsqueda full-text. |
| ORM / migraciones | Drizzle ORM + drizzle-kit | Migraciones SQL versionadas y legibles, consultas parametrizadas (anti SQL injection), `CHECK` declarados en el esquema, sin binarios externos. |
| Validación | Zod | Mismos esquemas en formulario y servidor. |
| UI | Tailwind CSS | Responsive sin librería de componentes pesada. |
| Auth | Sesiones propias en BD + cookie `httpOnly`/`Secure`/`SameSite=Lax`, hash Argon2id | Sin dependencia de terceros; control total de roles. |
| Tests | Vitest contra PostgreSQL real | La prueba de compras simultáneas exige BD real, no mocks. |
| Despliegue | Docker Compose (app + Postgres) | Corre en cualquier VPS o PaaS con Node. |

Descartado por ahora (YAGNI): microservicios, Redis, colas, motor de búsqueda externo, GraphQL. Se agregan cuando haya carga que lo justifique; la arquitectura no los impide.

## 3. Arquitectura

**Monolito modular.** Cada dominio en `src/modules/<dominio>/` con su servicio (lógica de negocio), esquemas Zod y tests. Las páginas y endpoints son delgados: validan entrada, verifican permisos y llaman al servicio. Nada de lógica de negocio en componentes visuales.

```
src/
  app/
    (store)/            catálogo público, carrito, checkout, cuenta
    admin/              panel administrativo (protegido por rol)
    api/
      payments/[provider]/webhook/   confirmaciones de proveedores
    sitemap.ts  robots.ts
  modules/
    catalog/            productos, variantes, atributos, imágenes, búsqueda
    categories/
    brands/
    inventory/          stock, reservas, movimientos
    cart/
    orders/             pedidos, máquina de estados
    payments/           PaymentProvider + adaptadores
    customers/          perfil, direcciones, RUT
    auth/               sesiones, contraseñas, RBAC
    audit/
    chile/              regiones, comunas, RUT, teléfono, CLP
  lib/                  db, env (validado con Zod), storage, utilidades
  db/
    schema/             tablas Drizzle (catalog, users, sales)
    data/               regiones y comunas de Chile
    migrate.ts  seed.ts  reference-data.ts
drizzle/                migraciones SQL generadas (versionadas en git)
tests/
docs/
```

## 4. Decisiones principales de modelo

### 4.1 Producto vs. variante (sí a variantes, desde el día 1)
- **Product**: la ficha conceptual (nombre, slug, descripción, marca, categoría, SEO, destacado, activo).
- **ProductVariant**: la unidad vendible. Lleva SKU, código de barras, precio, precio anterior, costo, stock, stock mínimo.
- Todo producto tiene **al menos una variante**. Un producto "simple" tiene una sola variante por defecto (invisible en la tienda). Así no hay que rediseñar nada cuando un producto pase a tener 250 ml / 500 ml / 1 L.
- Consecuencia: los campos `sku`, `barcode`, `price`, `compare_at_price`, `cost_price`, `stock_quantity` y `minimum_stock` pedidos para producto viven en la variante.

### 4.2 Presentación y contenido (no confundir cantidades)
Columnas explícitas en la variante, porque aplican a casi todo producto físico:
- `net_content` (decimal) + `content_unit` (`ML`, `L`, `G`, `KG`, `UNIT`, `M`…) → contenido de **una** unidad.
- `units_per_pack` (entero, default 1) → unidades dentro del pack.
- Stock = número de **unidades vendibles** de esa variante (packs, si es pack).

Ejemplo: "Pack 6 jabones 90 g" → `net_content=90, content_unit=G, units_per_pack=6`, stock 40 = 40 packs. "1 jabón 90 g" es otra variante con `units_per_pack=1`.

### 4.3 Atributos flexibles
- Tabla `AttributeDefinition` (código, etiqueta, tipo: texto/número/booleano/lista, unidad, filtrable) administrable desde el panel.
- Valores en columna **JSONB** `attributes` en producto y variante (índice GIN), validados en el servidor contra las definiciones.
- Sirve para aroma, formato, tipo de piel, registro ISP, etc. sin agregar columnas por categoría.

### 4.4 Categorías
Árbol auto-referenciado (`parent_id`, `sort_order`, `slug`) de profundidad libre; consultas por rama con CTE recursiva. Producto con una categoría principal (relación muchos-a-muchos se agrega si se necesita). No se elimina una categoría con productos o hijas.

### 4.5 Dinero
CLP en **enteros** (sin decimales, sin `float`). Precios almacenados **con IVA incluido** (convención retail en Chile); el neto e IVA se calculan al emitir documento tributario.

## 5. Inventario y consistencia (componente crítico)

En la variante: `stock_on_hand` (físico) y `stock_reserved`. Disponible = físico − reservado.
Restricciones en BD: `stock_on_hand >= 0`, `stock_reserved >= 0`, `stock_reserved <= stock_on_hand`. **El stock no puede quedar negativo ni aunque el código falle.**

**Reserva atómica** (resuelve "stock=1, dos clientes a la vez"):
```sql
UPDATE product_variants
SET stock_reserved = stock_reserved + $qty
WHERE id = $id AND stock_on_hand - stock_reserved >= $qty;
-- 0 filas afectadas => sin stock; se aborta la transacción completa
```
Postgres bloquea la fila durante el `UPDATE`; el segundo cliente ve el valor ya actualizado y falla. Sin locks manuales ni condiciones de carrera.

**Ciclo de vida de una reserva** (tabla `StockReservation`):
| Momento | Acción |
|---|---|
| Cliente confirma checkout | Se crea pedido `PENDING_PAYMENT` + reservas (expiran en 30 min, configurable). Carrito **no** reserva. |
| Proveedor confirma pago | Reserva → venta: `on_hand -= q`, `reserved -= q`, movimiento `SALE`. |
| Pago rechazado / anulado / expirado | Se libera la reserva; pedido `CANCELLED`, pago `FAILED`/`EXPIRED`. |
| Pago confirmado **después** de expirar | Se intenta reservar de nuevo; si no hay stock, el pedido queda marcado para reembolso y aparece en el panel. |
| Cancelación de pedido pagado | Movimiento `SALE_CANCELLED` (devuelve stock). |
| Devolución | `RETURN` (vuelve a stock) o `DAMAGED` (no vuelve). |

Liberación de expiradas: tarea periódica + verificación perezosa al leer.

**Movimientos (`InventoryMovement`)**: cada cambio de `stock_on_hand` escribe un movimiento con `previous_stock`, `resulting_stock`, tipo, referencia (pedido, compra, ajuste), motivo y usuario, **en la misma transacción**. Un único servicio `inventory.applyMovement()` es la única puerta para cambiar stock. Tipos: `INITIAL_STOCK, PURCHASE, SALE, SALE_CANCELLED, RETURN, DAMAGED, MANUAL_ADJUSTMENT`.

## 6. Pedidos

- `Order`: número legible (`ORD-000123`, secuencia de BD), cliente, dirección de despacho (copiada, no referenciada), subtotal, descuento, envío, total, `order_status`, `payment_status`, método de pago.
- `OrderItem`: **snapshot** de nombre, SKU, presentación y precio unitario al momento de la compra.
- `OrderStatusHistory`: quién cambió qué y cuándo.
- Estados del pedido: `PENDING_PAYMENT, PAID, PROCESSING, SHIPPED, DELIVERED, CANCELLED, REFUNDED`, con transiciones permitidas definidas en un mapa en código (agregar un estado = enum + una línea).
- `payment_status` independiente: `PENDING, AUTHORIZED, PAID, FAILED, EXPIRED, REFUNDED, PARTIALLY_REFUNDED`.
- Totales siempre recalculados en el servidor; el precio enviado por el navegador se ignora.

## 7. Pagos

Interfaz `PaymentProvider`: `createPayment`, `getPaymentStatus`, `handleWebhook`, `cancelPayment`, `refundPayment`. Tablas `Payment` (intentos por pedido) y `PaymentEvent` (eventos recibidos, con clave única para **idempotencia**).

Regla: un pedido pasa a pagado **solo** tras confirmación verificada con el proveedor desde el servidor (webhook con firma validada o consulta de estado server-to-server). Llegar a la página de "gracias" no cambia nada.

Adaptadores:
- **Transferencia bancaria** (real, sin credenciales): el admin confirma manualmente; queda auditado.
- **Fake** (solo desarrollo/tests, bloqueado en producción).
- **Webpay Plus / Mercado Pago**: estructura y variables de entorno preparadas; implementación en FASE 7 siguiendo la documentación oficial vigente. Requieren código de comercio / access token que hoy no existen. Nota: en Webpay la confirmación ocurre cuando el servidor ejecuta el *commit* al volver el usuario, no por webhook; la interfaz contempla ambos flujos.

## 8. Usuarios, permisos y clientes

- `User` (credenciales) con `role`: `CUSTOMER, ADMIN, SUPER_ADMIN`; preparados `SALES`, `WAREHOUSE`.
- Permisos (`products:write`, `inventory:adjust`, `orders:manage`…) mapeados a roles en código; cada acción del panel verifica permiso en el servidor. Si luego se quieren roles editables desde el panel, se migran a tablas sin cambiar las llamadas.
- `Customer` separado de `User` (`user_id` opcional) → permite **compra como invitado** y cuenta después. RUT opcional validado (módulo 11), teléfono `+56`.
- `Address` con región y comuna (tablas de referencia con las 16 regiones y 346 comunas, cargadas desde el listado oficial).

## 9. Auditoría
`AuditLog`: usuario, acción, entidad, id, valores anteriores y nuevos (JSONB), fecha. Se escribe desde los servicios en la misma transacción que el cambio.

## 10. SEO y rendimiento
- URLs `/categoria/[slug]`, `/producto/[slug]`, canónicas, meta title/description por producto y categoría, Open Graph, JSON-LD `Product`/`Offer`, `sitemap.xml` y `robots.txt` generados.
- Búsqueda: Postgres full-text en español + `unaccent` + `pg_trgm` (tolera tildes y errores leves). Se reemplaza por Meilisearch/Typesense si el catálogo crece mucho.
- Paginación en servidor, índices en slug, sku, barcode, categoría, marca, precio, `active`, fechas; `next/image` con lazy loading; caché de páginas de catálogo con revalidación al editar.
- Imágenes: interfaz de almacenamiento con adaptador local (dev) y S3-compatible (prod).

## 11. Seguridad (resumen)
Zod en el servidor y restricciones HTML en el navegador; consultas parametrizadas (Drizzle); React escapa por defecto (sin `dangerouslySetInnerHTML` con datos de usuario; descripciones en Markdown básico convertido a elementos React); server actions con verificación de origen (CSRF) y cookies `SameSite`; Argon2id; rate limit en login; secretos solo en variables de entorno validadas al arrancar; claves de pago nunca en el frontend; cabeceras de seguridad (CSP, HSTS).

## 12. Riesgos técnicos y de negocio

| Riesgo | Mitigación |
|---|---|
| Sobreventa por concurrencia | `UPDATE` condicional + `CHECK` en BD + test concurrente real. |
| Pago tardío tras expirar reserva | Re-reserva o marca de reembolso visible en el panel. |
| Webhooks falsos o duplicados | Verificación con el proveedor + idempotencia por evento. |
| Manipulación de precios desde el navegador | Totales recalculados en servidor. |
| **Boleta electrónica obligatoria (SII)** por cada venta | Interfaz `TaxDocumentProvider` preparada; se necesita contratar un proveedor de DTE antes de vender en producción. |
| Normativa de datos personales (Ley 19.628 y la nueva Ley 21.719, que entra en vigencia en dic-2026) | Mínimos datos, consentimiento, política de privacidad; revisar con asesoría legal. |
| Productos con registro sanitario (ISP) — cosméticos, desinfectantes | Campo de atributo "registro ISP" sin cambiar el esquema. |
| Despacho | Tarifas por región/comuna configurables en el MVP; integración con couriers después (interfaz `ShippingProvider`). |

## 13. Plan de fases
1. Arquitectura y BD: proyecto, esquema Drizzle, migraciones, seed, módulos `chile` y `auth`.
2. Catálogo público: productos, variantes, categorías, marcas, búsqueda, filtros, orden.
3. Panel administrativo.
4. Inventario y movimientos.
5. Carrito y pedidos.
6. Checkout.
7. Pagos (transferencia + fake; Webpay/Mercado Pago cuando haya credenciales).
8. Seguridad, testing, SEO, optimización y documentación final.

## 14. Configuración externa pendiente (no inventada)
- Credenciales Webpay (código de comercio + API key) y/o Mercado Pago (access token, secreto de webhook).
- Proveedor de boleta/factura electrónica.
- Almacenamiento de imágenes en producción (bucket S3-compatible).
- Dominio, hosting y servicio de correo transaccional (confirmaciones de pedido).

## 15. Registro de decisiones

- **2026-10-05 — Drizzle en vez de Prisma.** Prisma requiere descargar un binario (schema engine) desde un servidor externo, lo que falla en entornos con red restringida y agrega una pieza más al despliegue. Drizzle es TypeScript puro, genera SQL legible y permite declarar los `CHECK` de inventario en el mismo esquema. Sin impacto en el resto de la arquitectura.
- **Esquema agrupado en 3 archivos** (`catalog`, `users`, `sales`) en `src/db/schema/` en lugar de uno por módulo: las tablas tienen muchas FK cruzadas y así se evita importar entre módulos. La lógica de negocio sí vive por dominio en `src/modules/`.
- **FASE 2 — Búsqueda en una migración SQL propia** (`drizzle/0001_busqueda.sql`): extensiones `unaccent` y `pg_trgm`, función `f_unaccent()` (envoltorio IMMUTABLE, requisito para indexar) e índices de expresión GIN. Drizzle no declara índices de expresión; drizzle-kit los ignora al generar migraciones futuras. La consulta en `src/modules/catalog/queries.ts` usa exactamente las mismas expresiones.
- **FASE 2 — Páginas del catálogo dinámicas, sin caché.** Stock y precios siempre al día; las consultas son baratas con los índices. Se agrega `"use cache"` + revalidación al editar cuando el tráfico lo justifique (marcado con `ponytail:` en `src/app/(store)/layout.tsx`).
- **FASE 2 — Filtros y variantes por URL, sin JavaScript obligatorio.** Los filtros son un formulario GET (`?marca=…&a_aroma=…&precio_min=…&disponible=1&orden=…&pagina=…`) y la variante elegida va en `?variante=SKU`. Toda vista es enlazable, indexable y funciona sin JS; un componente cliente mínimo solo autoenvía el formulario en escritorio.
- **FASE 2 — Precio por unidad de medida** (por L, kg, m o c/u) calculado desde `net_content × units_per_pack`, mostrado en el fleje de precio. Sin columnas nuevas.
- **FASE 2 — Descripción como texto plano** (React escapa). Reemplazado en FASE 3 por Markdown básico (ver abajo).
- **FASE 2 — Tailwind v4 y tipografía Archivo vía `@fontsource`** (npm), no Google Fonts: el build no depende de descargar fuentes de un servidor externo.
- **FASE 3 — Panel en `/admin` con server actions, sin API REST.** Cada página llama `requireStaffPage(permiso)` y cada acción `requirePermission(permiso)`: el layout del panel solo arma el menú (Next no re-ejecuta layouts al navegar, así que no sirve como control de acceso). Las acciones validan con Zod, llaman al servicio del módulo y devuelven `FormState` (errores por campo + valores enviados, nunca contraseñas) para no perder lo escrito.
- **FASE 3 — Auditoría en la misma transacción.** Todos los servicios de escritura (`src/modules/*/admin.ts`, `auth/users.ts`, `catalog/attributes.ts`) registran `audit_logs` con valores antes/después dentro de su `db.transaction`. El hash de contraseña nunca se audita.
- **FASE 3 — `applyMovement()` adelantado de la FASE 4.** El stock inicial de una variante nueva se registra como movimiento `INITIAL_STOCK` a través de la única puerta de stock (`src/modules/inventory`). En el panel el stock es solo lectura; los ajustes manuales, compras y el historial llegan en la FASE 4.
- **FASE 3 — Borrar solo lo que no tiene historial.** Las FK `RESTRICT` de movimientos y pedidos impiden eliminar productos/variantes con stock o ventas, categorías con productos o subcategorías y marcas con productos; el panel lo traduce a un mensaje y ofrece desactivar. La variante por defecto no se borra.
- **FASE 3 — Markdown básico propio (`src/lib/markdown.tsx`) en vez de una librería.** Párrafos, títulos, listas, negrita y cursiva convertidos a elementos React: sin HTML crudo ni enlaces, así que no hay nada que sanitizar. ~60 líneas y un test; se cambia por `react-markdown` si se necesitan enlaces o tablas.
- **FASE 3 — Imágenes en disco local** (`UPLOAD_DIR`, servidas por `/media/[name]`; `/public` solo sirve lo que existía al compilar). Tipo validado por los bytes (JPG/PNG/WebP/AVIF, sin SVG), 5 MB por imagen, nombres UUID (sin rutas del usuario), `next/image` restringido a `/media/**`. En producción requiere un volumen persistente; el adaptador S3 va en la misma interfaz (`saveImage`/`readImage`/`deleteImageFile`) cuando exista el bucket.
- **FASE 3 — Límite de intentos de login en memoria** (5 fallos por IP+email y 30 por IP, ventana de 15 min). Suficiente con una instancia; pasa a BD/Redis si se escala. La IP sale de `x-forwarded-for`: definir el proxy confiable al desplegar (FASE 8).
- **FASE 3 — Gestión de usuarios solo del staff** y solo para `SUPER_ADMIN`. Nadie cambia su propio rol ni se desactiva (siempre queda al menos un super administrador). Cambiar rol, desactivar o cambiar contraseña cierra las sesiones del usuario.
- **FASE 3 — Cambiar un slug rompe los enlaces antiguos.** El panel lo advierte; redirecciones 301 desde slugs anteriores se agregan si el SEO lo requiere (FASE 8).
