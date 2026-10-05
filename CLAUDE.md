# Instrucciones para Claude en este repositorio

Proyecto: e-commerce para Chile (higiene personal, cuidado personal, aseo del hogar y accesorios). Leer `docs/ARQUITECTURA.md` y `docs/BASE_DE_DATOS.md` antes de cambiar el modelo. Puesta en marcha y rutas: `README.md`.

## Stack y arquitectura
- Next.js App Router · TypeScript estricto · PostgreSQL 16 (Docker Compose) · Drizzle ORM + drizzle-kit · Zod · Tailwind CSS v4 · Vitest contra PostgreSQL real · sesiones propias + Argon2id.
- Monolito modular: lógica de negocio en `src/modules/<dominio>/` (servicios); páginas y server actions delgadas (validan, verifican permiso, llaman al servicio). Nada de lógica de negocio en componentes visuales.
- Carpetas clave: `src/app/(store)` tienda pública · `src/app/admin` panel · `src/app/media/[name]` imágenes subidas (disco local, `UPLOAD_DIR`) · `src/components/{store,admin}` + `src/components/icons.tsx` · `src/db/schema` (catalog, users, sales) · `drizzle/` migraciones · `docs/`.

## Estado de fases (plan en `docs/ARQUITECTURA.md` §13)
1. Arquitectura y BD ✅ · 2. Catálogo público ✅ · 3. Panel administrativo ✅ (+ iteración UI/UX) · 4. Inventario y movimientos ✅ · 5. Carrito y pedidos ✅ · 6. Checkout ⏳ · 7. Pagos · 8. Seguridad, SEO y cierre.
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
- `src/modules/orders`: `createOrderFromCart(cartId, {email, firstName, lastName, expectedTotal}, userId?)` en UNA transacción: bloquea el carrito → valida líneas → compara `expectedTotal` (total que vio el cliente; si cambió, error y no se crea) → cliente (por `user_id` con upsert, o invitado nuevo) → pedido `PENDING_PAYMENT` + ítems snapshot + historial → `reserveStock` → borra el carrito (un doble envío no duplica). Antes llama `expireOrders()` (verificación perezosa).
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

## Para comenzar la Fase 6 (checkout)
- Formulario de checkout que llame `createOrderFromCart` con `expectedTotal = getCart(...).subtotal` mostrado al cliente. Extender `orderInputSchema` con teléfono/RUT (`normalizeChileanPhone`, `normalizeRut`), dirección (`shippingAddress` snapshot + `shippingCommuneId`) y costo de despacho (`shippingTotal`; el CHECK exige `total = subtotal − descuento + envío`).
- Capturar `UserError`/`InsufficientStockError` y devolver al carrito, que ya muestra cada problema por línea.
- Pendiente de decidir: cuentas de cliente (registro/ingreso, "mis pedidos"; hoy el login es solo staff) y fusionar el carrito de la cookie al ingresar (`carts.user_id` existe, sin uso). Página de confirmación/detalle del pedido para el cliente.
- Fase 7: consumir la reserva → `SALE` (físico y reservado bajan en el mismo UPDATE; extender `applyMovement`), `SALE_CANCELLED`, reembolsos; el pago tardío sobre un pedido vencido (`CANCELLED`/`EXPIRED`) intenta re-reservar. Esas transiciones son las que `movesMoney` hoy bloquea en el panel.
- `releaseExpiredReservations()` (Fase 4) quedó sin uso en la app: `expireOrders()` también cancela el pedido.

## Plugins de la sesión
- **Ponytail** (activo por hook): solución más simple que funcione, sin recortar validación, seguridad ni lo pedido explícitamente.
- **Task Observer**: invocar la skill `task-observer:task-observer` antes de la primera llamada a herramientas de cada sesión.
  Workspace: `.claude/` en la raíz del repositorio (contiene `skill-observations/`). Hacer commit de las observaciones nuevas junto con el trabajo; nunca `git clean` sobre esa carpeta.
- **Claude-Mem Cowork**: usar `claude-mem-cowork:mem-search` al iniciar para recuperar contexto de sesiones previas (requiere configuración con `mem-setup`).
