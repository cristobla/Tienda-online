# Instrucciones para Claude en este repositorio

Proyecto: e-commerce para Chile (higiene personal, cuidado personal, aseo del hogar y accesorios). Leer `docs/ARQUITECTURA.md` y `docs/BASE_DE_DATOS.md` antes de cambiar el modelo. Puesta en marcha y rutas: `README.md`.

## Stack y arquitectura
- Next.js App Router · TypeScript estricto · PostgreSQL 16 (Docker Compose) · Drizzle ORM + drizzle-kit · Zod · Tailwind CSS v4 · Vitest contra PostgreSQL real · sesiones propias + Argon2id.
- Monolito modular: lógica de negocio en `src/modules/<dominio>/` (servicios); páginas y server actions delgadas (validan, verifican permiso, llaman al servicio). Nada de lógica de negocio en componentes visuales.
- Carpetas clave: `src/app/(store)` tienda pública · `src/app/admin` panel · `src/app/media/[name]` imágenes subidas (disco local, `UPLOAD_DIR`) · `src/components/{store,admin}` + `src/components/icons.tsx` · `src/db/schema` (catalog, users, sales) · `drizzle/` migraciones · `docs/`.

## Estado de fases (plan en `docs/ARQUITECTURA.md` §13)
1. Arquitectura y BD ✅ · 2. Catálogo público ✅ · 3. Panel administrativo ✅ (+ iteración UI/UX) · 4. Inventario y movimientos ✅ · 5. Carrito y pedidos ✅ · 6. Checkout ✅ · 7. Pagos: base + transferencia ✅, pasarelas online ⏳ · 8. Seguridad, SEO y cierre.
- Cada fase depende de la anterior: los pedidos (5) usan reservas e inventario (4); el checkout (6) usa pedidos; los pagos (7) confirman pedidos.

## Fase 3 — lo implementado
- Panel `/admin`: productos, variantes, imágenes, categorías, marcas, atributos, usuarios y auditoría. Cada página llama `requireStaffPage(permiso)` y cada acción `requirePermission(permiso)`; el layout solo arma el menú. Escrituras con auditoría en la misma transacción.
- Iteración visual: header (franja de despacho, buscador, cuenta, carrito, submenú de categorías; menú móvil con `<details>`), hero con producto destacado real, beneficios, categorías desde la BD, destacados, "Recién llegados" (orden `nuevos`), marcas, footer; catálogo con filtros GET, chips de filtros activos y paginación numerada; ficha con galería (`?foto=`), formato (`?variante=`), precio, stock y cantidad; panel con sidebar oscuro, `StatCard`, tablas, `EmptyState` y `loading.tsx`.
- Provisorio hasta fases siguientes: `/cuenta`, `/info/[tema]` (textos legales/contacto por redactar, no inventar datos). El seed no trae fotos: se muestran placeholders (`ProductImage`).

## Decisiones visuales a conservar
- Tokens en `src/app/globals.css` (`@theme`): eucalipto `leaf` para marca/acciones, `ink` texto, `mist`/`paper` fondos, `fleje` amarillo SOLO para el precio, `oferta` rojo SOLO para ofertas/alertas. Sin gradientes violeta, sombras mínimas, bordes `rounded-md`.
- Precio como fleje de góndola con precio por L/kg/m/c-u (`Fleje`, `modules/catalog/pricing.ts`).
- Tipografía Archivo vía `@fontsource-variable/archivo` (sin Google Fonts). Íconos SVG propios, sin librería de componentes.
- Filtros y variantes por URL, funcionan sin JavaScript. Utilidad `bleed` para bandas a todo el ancho; grids con `grid-cols-1` base para no desbordar en móvil.

## Reglas del proyecto
- Todo cambio de stock pasa por el servicio de inventario y genera un `inventory_movement`; nunca editar `stock_on_hand` directo.
- Montos en CLP enteros, IVA incluido. Totales siempre recalculados en el servidor.
- Un pedido solo pasa a pagado con confirmación verificada del proveedor.
- Una rama y un PR por fase; `npm test`, `npm run typecheck` y `npm run build` deben pasar antes del PR. No hay script de lint.
- Cambios de esquema: editar `src/db/schema/*`, luego `npm run db:generate -- --name <cambio>`; nunca editar migraciones ya publicadas.
- Antes de diagnosticar "funciones faltantes", comparar la rama local con `origin/main` (`git branch -a`, `git log --all --graph`) y que `node_modules` corresponda al lockfile.

## Fase 4 — lo implementado
- `src/modules/inventory`: `applyMovement(tx, …)` (única puerta de `stock_on_hand`; exige `Transaction`, valida signo por tipo y motivo en ajustes), `adjustStock()` (ingreso `PURCHASE`, merma `DAMAGED`, conteo físico → `MANUAL_ADJUSTMENT`; bloquea la fila con `FOR UPDATE`), consultas `listInventory`/`getVariantStock`/`listMovements`.
- Reservas sin UI: `reserveStock(tx, orderId, líneas)` (UPDATE condicional, todo o nada, `InsufficientStockError`, bloqueo en orden de id), `releaseOrderReservations(tx, orderId)`, `releaseExpiredReservations()`; idempotentes (solo `ACTIVE`). Reservar no crea movimientos.
- Migración `0002_movimientos_inmutables.sql`: trigger que impide editar/borrar movimientos. `created_at` del movimiento = `clock_timestamp()`.
- Panel `/admin/inventario` (listado con búsqueda y filtros agotado/bajo mínimo) y `/admin/inventario/[variantId]` (bodega/reservado/disponible/mínimo, 3 formularios, historial). `inventory:read` para ver, `inventory:adjust` para operar. Enlaces desde la ficha de variante y "Reponer pronto".
- Pruebas en `tests/inventory.test.ts` (signos, rollback, inmutabilidad, merma vs. reservado, conteo desactualizado, sobreventa con stock 1, deadlock, concurrencia con historial encadenado). El helper `makeVariant` y el seed crean el stock vía `applyMovement`.

## Fase 5 — lo implementado
- Sin migraciones: las tablas `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `stock_reservations`, `customers` ya venían de la Fase 1 (`drizzle-kit generate` → sin cambios).
- `src/modules/cart`: carrito en servidor identificado por cookie `cart` (UUID aleatorio, `httpOnly`; no requiere sesión). Guarda solo variante + cantidad; `cartLines(tx, cartId)` lee precio/stock/vendible actuales y marca `problem` por línea. `addToCart` (suma, máx. 99 por producto, valida disponible = físico − reservado), `setItemQuantity` (0 = quitar; bajar siempre se permite, subir exige stock). Toda escritura bloquea la fila de `carts` (y marca `updated_at`). El carrito NO reserva.
- `src/modules/orders`: `createOrderFromCart(cartId, input: OrderInput, userId?)` (`orderInputSchema`: contacto, despacho y `expectedTotal`; ver Fase 6) en UNA transacción: bloquea el carrito → valida líneas → compara `expectedTotal` (total que vio el cliente; si cambió, error y no se crea) → cliente (por `user_id` con upsert, o invitado nuevo) → pedido `PENDING_PAYMENT` + ítems snapshot + historial → `reserveStock` → borra el carrito (un doble envío no duplica). Antes llama `expireOrders()` (verificación perezosa).
- Estados: mapa `TRANSITIONS` en el módulo. `changeOrderStatus` (panel, `orders:manage`, auditado como `order.status`) rechaza lo que mueve dinero (`movesMoney`: → `PAID`, → `REFUNDED`, cancelar un pedido pagado o con pago `AUTHORIZED`); cancelar exige motivo, libera reservas y deja `payment_status = CANCELLED`. `manualTransitions(o)` = lo que el panel ofrece.
- Vencimiento: `expireOrders()` cancela pedidos impagos con reserva vencida (`payment_status = EXPIRED`, historial "Reserva vencida"), un pedido por transacción. Tarea cada 60 s en `src/instrumentation.ts` (temporizador en proceso, `ponytail:`) + llamada antes de crear cada pedido.
- Tienda: `(store)/carrito/actions.ts` (agregar / fijar cantidad), `components/store/cart-forms.tsx` (`AddToCartForm`, `CartLineControls`; `useActionState`, funcionan sin JS), `/carrito` real, contador en el header, tarjetas: "Agregar" si hay un formato, "Elegir formato" si hay varios, "Agotado" deshabilitado. El formulario de filtros del catálogo ahora envuelve solo el panel lateral (no puede haber `<form>` anidados); "Ordenar por" usa `form="filtros"`.
- Panel: `/admin/pedidos` (búsqueda por número/cliente/email, filtro por estado) y `/admin/pedidos/[id]` (snapshot, totales, cliente, stock reservado, historial, cambios de estado). `orders:read` ver, `orders:manage` operar. `error.tsx` en tienda y panel; `carrito/loading.tsx`.
- Seed: 2 pedidos de prueba creados por el carrito y el servicio real (uno pendiente que vence solo, uno cancelado).
- Pruebas en `tests/orders.test.ts` (29): carrito, creación, snapshot, precio/stock cambiados, rollback dentro de la transacción (determinista con `pg_stat_activity`), estados, vencimiento, concurrencia (última unidad, doble envío, cancelar vs. vencer) y permisos.

## Robustez para presentar (post Fase 5)
- `npm run dev`/`npm run start` corren antes `scripts/db-up.mjs` (`predev`/`prestart`): si PostgreSQL no responde, `docker desktop start` + `docker compose up -d --wait`; si sigue sin base, mensaje de una línea y exit 1. `docker-compose.yml`: `restart: unless-stopped` + healthcheck `pg_isready`. Docker Desktop del usuario tiene "iniciar al ingresar" desactivado (no se cambia desde aquí).
- `src/db/index.ts`: `pool.on("error")` — sin listener, una conexión inactiva cortada (base reiniciada) emite un error no manejado. `src/instrumentation.ts`: una línea por minuto si la base no responde.
- `src/app/error.tsx` (falla del layout, p. ej. sin base) · `src/app/not-found.tsx` (URL inexistente, con marca, 404 real) · `src/app/(store)/not-found.tsx` (404 dentro de la tienda, con menú). Los `notFound()` de páginas de la tienda responden 200 + `noindex` por el streaming de `(store)/loading.tsx` (pendiente Fase 8).
- `src/app/icon.svg` (favicon), `viewport.themeColor`. Contacto del footer en `SITE.email`/`SITE.hours` (null = no se muestra; no inventar datos).
- Raw SQL en Drizzle: en un select de una sola tabla, `${tabla.col}` se escribe SIN calificar; dentro de una subconsulta se ata a la tabla interna. Escribir `"tabla"."col"` explícito (bug real en `listOrders`, cubierto por test).

## Fase 6 — lo implementado
- Migración `0003_tarifas_despacho`: tabla `shipping_rates` (región → `cost` CLP IVA incl. + `eta` texto). Región sin fila = no se despacha. Editable en `/admin/despacho` (permiso nuevo `shipping:manage`, auditado `shipping.update`). El seed carga tarifas DE PRUEBA para las 16 regiones.
- `src/modules/shipping`: `quoteShipping(communeId, tx?)`, `listDeliveryCommunes()` (solo regiones con tarifa), `listShippingRates()`, `parseShippingForm()`, `saveShippingRates()`.
- `orderInputSchema` ahora incluye teléfono (obligatorio, normalizado +56), RUT (opcional, módulo 11), `communeId`, calle, número, depto., indicaciones. `createOrderFromCart` cotiza el despacho dentro de la transacción, compara `expectedTotal` = subtotal + despacho, guarda `shippingAddress` (copia con nombres de comuna/región), `shippingCommuneId`, `shippingTotal`, teléfono y RUT (pedido y ficha de cliente). Email: recortar ANTES de validar (`z.string().trim().pipe(z.email())`; `z.email().trim()` rechaza espacios finales).
- Tienda: `/checkout` en dos pasos sin JS (GET `?comuna=` cotiza; POST confirma con `checkoutAction`), redirige al carrito si no está listo. `/pedido/[id]`: comprobante para el cliente por enlace secreto (UUID), `noindex`. El carrito enlaza al checkout cuando `ready`.
- Compra solo como invitado (`userId` null): no hay cuentas de cliente. El pedido queda `PENDING_PAYMENT` hasta que se confirme su pago (Fase 7) o venza su reserva.
- Pruebas: `tests/checkout.test.ts` (despacho en el total, copia de dirección, contacto normalizado, comuna sin despacho, tarifa cambiada, validación, tarifas del panel). `makeCommune()` en `tests/helpers.ts` (las tablas de referencia no se vacían entre tests).

## Catálogo real — importación desde Excel (PR #9, mergeado)
- Migración `0004_borradores_sin_categoria`: `products.category_id` opcional + CHECK `products_active_needs_category` (publicado ⇒ categoría). `productSchema` lo exige al marcar «Visible»; tienda/carrito siguen mostrando solo lo publicado.
- `src/lib/xlsx.ts`: lector propio (ZIP con `node:zlib` + XML). Devuelve el TEXTO exacto de cada celda (nunca `Number`); acepta etiquetas con prefijo `x:` (el Excel real lo genera .NET), BOM y destinos absolutos; límites 10 MB / 80 MB descomprimido / 5000 entradas; fórmulas marcadas.
- `src/modules/catalog/import.ts`: perfiles `preparado` (hoja `Catalogo`) y `origen` (hoja `Productos`), detección por hoja + encabezados normalizados. `parseCatalogFile` → `buildPlan(parsed, opts, tx?)` (no escribe; huella sha256) → `applyImport` (UNA transacción, `pg_advisory_xact_lock`, idempotencia por `catalog.import` con entityId = hash archivo + hash opciones, recalcula el plan y exige la misma huella).
- Reglas: SKU = texto tal cual (`skuSchema`: NFC + recorte exterior, sin controles, espacios internos sí); numérico >15 dígitos = error; los marcados `codigo_numerico_mas_15_digitos` exigen la opción «confirmo». Precio = venta bruto entero (`1000.0` ok, `2011.1` error, no redondea). Costo neto → solo auditoría (`product.import` → `after.origen`), nunca `cost_price`. Nuevos: borrador, variante «Unidad», slug único. Stock inicial opcional (apagado), solo variantes nuevas, vía `insertProduct` → `applyMovement`. Existentes: solo campos marcados (precio por defecto); nunca stock/reservas/imágenes; vacío no borra; ausente no desactiva; `publicar=0` no despublica. Marcas/categorías nuevas solo con la opción explícita (ruta completa, «>» o «›»).
- Panel: `/admin/productos/importar` (`catalog:write`; archivo guardado por hash en `UPLOAD_DIR/.importaciones`, no servido por `/media`; vista previa GET con opciones en la URL; confirmar POST con huella). Listado de productos: columna SKU, filtro «Sin categoría» (`categoria=ninguna`), orden. Ficha: categoría opcional, «Hacer principal» en imágenes, vista previa local al elegir. Auditoría: tipo «Importaciones». Inicio: alertas de stock solo de productos publicados.
- Imágenes: `saveImage` decodifica con `sharp` (dependencia declarada) y exige 100–8000 px.
- Datos reales en `/datos/` (ignorado por git). Pruebas con archivos sintéticos: `tests/xlsx-fixture.ts` (`makeXlsx`, opción `dotnet`) y `tests/import.test.ts`.
- Pendiente del catálogo (decisión del negocio): 3 precios con decimales, 9 códigos largos por confirmar, precio $12 a revisar, stocks faltantes/negativos, sin marcas ni categorías.

## Fase 7 — base de pagos implementada (rama `fase-7-pagos`; detalle en `docs/PAGOS.md`)
- Migración `0005_pagos`: `payments` = intento (attempt, `reference` "ORD-…-N" = clave de idempotencia, provider/environment/account, `provider_reference` texto, amount congelado, `checkout` = acción congelada, `raw` sin secretos, received_amount/at, verified_at/by, expires_at, incident, last_error); únicos `payments_external_ref` (proveedor, ambiente, cuenta, ref. externa), `payments_one_pending` (1 PENDING por pedido+método), `payments_order_attempt`. `payment_events`: source, event_id opcional, status RECEIVED/PROCESSED/FAILED/IGNORED, tries, last_error. `payment_methods`: interruptor + config NO secreta. Enum `payment_status` + `UNCERTAIN` (timeout: incierto, no rechazo) + `REVIEW` (dinero que no confirma el pedido: reembolso pendiente). Índice `movements_one_sale_per_order_line`. ALTER TYPE ADD VALUE: no usar los valores nuevos en la misma migración (el migrador corre todo en una transacción).
- `src/modules/payments/providers.ts`: contrato `PaymentProvider` (configure, start → acción `instructions|redirect GET/POST|wait`, verify, parseReturn, parseWebhook; capacidades) + registro: `transferencia` (datos de ejemplo rotulados solo en local/test), `simulado` (testOnly; estado en memoria del proceso: `simulator`), `webpay`/`mercadopago`/`khipu` = `pending()` (implemented false: 404, no habilitables).
- `src/modules/payments/index.ts`: `placeOrder` (pedido+reserva+intento en una tx vía `createOrderFromCart(..., { within })`; luego `beginAttempt` fuera de la tx), `startPayment` (reintento/cambio: mismo intento si está abierto, sin nueva reserva ni plazo), **`applyResult` = único flujo que confirma** (lock pedido → pago `FOR NO KEY UPDATE`; consume reserva → `markOrderPaid`; vencida → re-reserva todo en savepoint o REVIEW; duplicado/cancelado → REVIEW; nunca retrocede PAID), `receiveProviderInput`/`processEvent` (guardar → verificar → aplicar), `reconcilePayments`, `runPaymentJobs`, `confirmTransfer` (lock pedido primero, evento admin deduplicado por `commandId`, monto distinto → REVIEW, operación bancaria única), `resolveIncident` (REVIEW → REFUNDED con nota), `saveTransferSettings`, `setMethodEnabled`, consultas.
- Inventario: `applyMovement({ fromReserved })` (venta baja físico y reservado en el MISMO UPDATE), `consumeOrderReservations`, `reservationState` (vigencia con el reloj de la base). Pedidos: `lockOrder`, `markOrderPaid`, `recoverable` (cancelado por vencimiento), `cancelExpiredWithPayment`, `setOrderPaymentStatus`; cancelar cierra intentos PENDING (EXPIRED por vencimiento, CANCELLED si es manual); vencer conserva un resumen REVIEW/REFUNDED.
- Config (`src/lib/env.ts`): `APP_ENV` (local|test|integration|production; por omisión production si NODE_ENV=production), `PAYMENT_SIMULATION`, `TRANSFER_RESERVATION_MINUTES`; en producción `APP_URL` https. Vitest usa `APP_ENV=test` + simulación; CI `APP_ENV=test`. El `.env` local tiene `APP_ENV=local` y `PAYMENT_SIMULATION=on`.
- Rutas: `/api/payments/[provider]/return` (GET/POST) y `/webhook` (POST; tamaño/tipo/IP) — solo proveedores implementados y configurados; redirección desde `APP_URL`. Tienda: selector de método en `/checkout`, `/pedido/[id]` (instrucciones, ir a pagar, verificando sin ofrecer pagar de nuevo, reintento, `AutoRefresh` acotado), simulador `/pago/simulado/[token]` + `/decision` (POST con navegación completa, mismo origen, 404 fuera de local/test).
- Panel: `/admin/pagos` (lista, filtros, contadores), `/admin/pagos/[id]` (detalle, eventos, confirmar transferencia con `AdminForm confirm`, resolver incidencia), `/admin/pagos/configuracion`; sección Pagos en la ficha del pedido; inicio con "Transferencias por comprobar". Permiso nuevo `payments:manage` (Admin y Super Admin). Auditoría `payment.*`.
- Jobs: `npm run jobs` (`scripts/jobs.ts`) = vencimiento + reconciliación; el temporizador de `instrumentation.ts` llama a lo mismo. Seed: pedidos de prueba por transferencia (1 pendiente, 1 cancelado, 1 pagado confirmado).
- Pruebas: `tests/payments.test.ts` (26) + carrera repetida verificada a mano. No hay pasarelas reales probadas.

## Pendiente de pagos / siguiente
- Primer adaptador real (Webpay Plus o Mercado Pago): seguir `docs/PAGOS.md` §9 (protocolo oficial, sandbox con URL HTTPS pública, pruebas grabadas, recién después `implemented: true`).
- Anular un pedido pagado (`SALE_CANCELLED`) y reembolsos: hoy manuales (incidencia REVIEW → "devuelto").
- Antes de exponer públicamente: limitar pedidos pendientes por IP/email (un bot puede reservar stock por pedido) — Fase 8, ver `docs/DESPLIEGUE.md`.

## Plugins de la sesión
- **Ponytail** (activo por hook): solución más simple que funcione, sin recortar validación, seguridad ni lo pedido explícitamente.
- **Task Observer**: invocar la skill `task-observer:task-observer` antes de la primera llamada a herramientas de cada sesión.
  Workspace: `.claude/` en la raíz del repositorio (contiene `skill-observations/`). Hacer commit de las observaciones nuevas junto con el trabajo; nunca `git clean` sobre esa carpeta.
- **Claude-Mem Cowork**: usar `claude-mem-cowork:mem-search` al iniciar para recuperar contexto de sesiones previas (requiere configuración con `mem-setup`).
