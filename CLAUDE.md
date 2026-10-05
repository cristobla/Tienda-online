# Instrucciones para Claude en este repositorio

Proyecto: e-commerce para Chile (higiene personal, cuidado personal, aseo del hogar y accesorios). Leer `docs/ARQUITECTURA.md` y `docs/BASE_DE_DATOS.md` antes de cambiar el modelo. Puesta en marcha y rutas: `README.md`.

## Stack y arquitectura
- Next.js App Router · TypeScript estricto · PostgreSQL 16 (Docker Compose) · Drizzle ORM + drizzle-kit · Zod · Tailwind CSS v4 · Vitest contra PostgreSQL real · sesiones propias + Argon2id.
- Monolito modular: lógica de negocio en `src/modules/<dominio>/` (servicios); páginas y server actions delgadas (validan, verifican permiso, llaman al servicio). Nada de lógica de negocio en componentes visuales.
- Carpetas clave: `src/app/(store)` tienda pública · `src/app/admin` panel · `src/app/media/[name]` imágenes subidas (disco local, `UPLOAD_DIR`) · `src/components/{store,admin}` + `src/components/icons.tsx` · `src/db/schema` (catalog, users, sales) · `drizzle/` migraciones · `docs/`.

## Estado de fases (plan en `docs/ARQUITECTURA.md` §13)
1. Arquitectura y BD ✅ · 2. Catálogo público ✅ · 3. Panel administrativo ✅ (+ iteración UI/UX) · 4. Inventario y movimientos ✅ · 5. Carrito y pedidos ⏳ · 6. Checkout · 7. Pagos · 8. Seguridad, SEO y cierre.
- Cada fase depende de la anterior: los pedidos (5) usan reservas e inventario (4); el checkout (6) usa pedidos; los pagos (7) confirman pedidos.

## Fase 3 — lo implementado
- Panel `/admin`: productos, variantes, imágenes, categorías, marcas, atributos, usuarios y auditoría. Cada página llama `requireStaffPage(permiso)` y cada acción `requirePermission(permiso)`; el layout solo arma el menú. Escrituras con auditoría en la misma transacción.
- Iteración visual: header (franja de despacho, buscador, cuenta, carrito, submenú de categorías; menú móvil con `<details>`), hero con producto destacado real, beneficios, categorías desde la BD, destacados, "Recién llegados" (orden `nuevos`), marcas, footer; catálogo con filtros GET, chips de filtros activos y paginación numerada; ficha con galería (`?foto=`), formato (`?variante=`), precio, stock y cantidad; panel con sidebar oscuro, `StatCard`, tablas, `EmptyState` y `loading.tsx`.
- Provisorio hasta fases siguientes: `/carrito` (solo interfaz; `?vista_previa=1` muestra el diseño), `/cuenta`, `/info/[tema]` (textos legales/contacto por redactar, no inventar datos). Botones de compra deshabilitados hasta la Fase 5. El seed no trae fotos: se muestran placeholders (`ProductImage`).

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

## Para comenzar la Fase 5 (carrito y pedidos)
- Crear el pedido `PENDING_PAYMENT` y llamar `reserveStock(tx, orderId, líneas)` en la MISMA transacción; capturar `InsufficientStockError` (trae `variantId` y `available`) para avisar al cliente.
- Cancelación antes de pagar / pago fallido: `releaseOrderReservations`. Vencidas: `releaseExpiredReservations()` desde una tarea periódica o verificación perezosa (aún no hay programador de tareas).
- Falta (cuando exista el pago): consumir la reserva → `SALE` con `stock_on_hand` y `stock_reserved` bajando en el mismo UPDATE (extender `applyMovement`; hacerlo en dos UPDATE rompe el CHECK `reserved <= on_hand`). También `SALE_CANCELLED` y `RETURN`.
- El carrito NO reserva stock; los totales se recalculan en el servidor. `/carrito` hoy es solo interfaz.

## Plugins de la sesión
- **Ponytail** (activo por hook): solución más simple que funcione, sin recortar validación, seguridad ni lo pedido explícitamente.
- **Task Observer**: invocar la skill `task-observer:task-observer` antes de la primera llamada a herramientas de cada sesión.
  Workspace: `.claude/` en la raíz del repositorio (contiene `skill-observations/`). Hacer commit de las observaciones nuevas junto con el trabajo; nunca `git clean` sobre esa carpeta.
- **Claude-Mem Cowork**: usar `claude-mem-cowork:mem-search` al iniciar para recuperar contexto de sesiones previas (requiere configuración con `mem-setup`).
