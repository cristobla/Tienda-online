# Etapa 1 — Revisión funcional (inventario, recorrido y correcciones)

Fecha: 2026-10-19. Autor: Claude (Claude Code). Este informe alimenta la etapa 2 (`docs/qa/02-pruebas-integrales.md`).

## 1. Revisión de código evaluada

| | |
|---|---|
| Rama | `fase-17-revision` |
| Commit base | `91019d8` (`fase-16-movil`) — apilada sobre los PR abiertos #20 (`fase-15-movimiento`, animaciones) y #21 (`fase-16-movil`, revisión móvil). `main` = `65b3287` (PR #19). |
| Cambios de esta etapa | `src/app/(store)/cuenta/page.tsx` (S-01), `src/app/admin/(panel)/pagos/configuracion/page.tsx` (B-002), `scripts/qa-preparar.ts`, `scripts/qa-sesiones.ts`, este informe. |
| Cambios ajenos | Ninguno en el árbol (solo `.claude/launch.json`, local y sin versionar). |

Versiones: Next 16.3.8 (App Router), React 19.3, TypeScript 5.9, Tailwind 4.3, Drizzle, PostgreSQL 16 (Docker), Vitest 5. No hay script de lint en el repositorio.

## 2. Entorno de prueba (sin secretos)

- **Base de la demo** `tienda` (47 productos reales; servidor en `:3001`): solo **lecturas** (GET). No se escribió nada.
- **Base de tests** `tienda_test`: la usa `npm test` (la vacía cada prueba).
- **Base de QA aislada** `tienda_qa` (creada en esta etapa, mismo contenedor Docker): migraciones + comunas + seed sintético (22 productos `DEMO-*`, pedidos de prueba) + cuentas por rol. Servidor de QA en `:3002` con `.env.qa` (ignorado por git: `.env.*`). `APP_ENV=local`, `PAYMENT_SIMULATION=on` (pago simulado en memoria), correos a la consola, fotos en una carpeta temporal.
- **Cuentas de QA** (contraseñas generadas al azar, solo en `.env.qa`): `qa-admin@qa.test` (SUPER_ADMIN, del seed), `qa-rol-admin@`, `qa-rol-sales@`, `qa-rol-warehouse@qa.test`. Quedan también `qa-sales@` y `qa-warehouse@qa.test` de un primer intento (mismos roles; inofensivas).

Comandos reproducibles:

```bash
docker exec tienda-online-db-1 sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "create database tienda_qa"'
# .env.qa: copia de .env con DATABASE_URL → /tienda_qa, APP_URL http://localhost:3002, SEED_ADMIN_* y QA_STAFF_PASSWORD de prueba
npx tsx --env-file=.env.qa src/db/migrate.ts
npx tsx --env-file=.env.qa src/db/load-reference.ts
npx tsx --env-file=.env.qa src/db/seed.ts
npx tsx --env-file=.env.qa scripts/qa-preparar.ts          # cuentas por rol (se niega fuera de una base *_qa)
node --env-file=.env.qa node_modules/next/dist/bin/next start -p 3002   # tras npm run build
npx tsx --env-file=.env.qa scripts/qa-sesiones.ts <archivo>  # sesiones por rol para recorrer el panel con curl
```

Herramientas: navegador del panel de Claude (Chromium, emulación de tamaño), `curl`, Node. WEB-Designer se usó como guía visual en las etapas 15–16; aquí la revisión es funcional.

**Límites de esta etapa**
- El clasificador de permisos de la sesión **bloqueó materializar la contraseña de QA** para escribirla en el navegador. Por eso las **acciones del panel no se ejecutaron por la interfaz**. Sí se ejecutó: cada pantalla del panel con cada rol (sesión real creada con el mismo `authenticate()` del login) y la lectura de su contenido. Las acciones del panel (confirmar transferencia, estados, reembolsos, ajustes) quedan cubiertas por las pruebas de integración existentes y son el núcleo de la etapa 2.
- El navegador del panel solo dibuja cuadros al tomar una captura. Las navegaciones con View Transition esperan un cuadro, así que en él parecen «colgadas» hasta forzar uno (no afecta a navegadores reales; observación 0005 del registro de skills).

## 3. Matriz de funciones

Estados: **E** = comprobada en ejecución en esta etapa · **T** = cubierta por pruebas automáticas (integración contra PostgreSQL) · **C** = revisada solo en código · **P** = pendiente de configuración · **N** = no verificable aquí.
Decisión: Conservar · Corregir · Simplificar · Ocultar · Retirar (propuesta).

### Tienda (cliente invitado; no existen cuentas de cliente)

| ID | Función | Ruta / módulo | Depende de | Estado | Decisión |
|---|---|---|---|---|---|
| F-001 | Portada (héroe con destacado real, pasillos, destacados, recién llegados, ofertas, marcas) | `/` | catálogo publicado | E | Conservar |
| F-002 | Catálogo con pasillos, filtros, orden, paginación, transiciones | `/productos`, `CatalogView` | — | E (etapas 15–16 y aquí) | Conservar |
| F-003 | Categoría con subcategorías; slug viejo → 308 | `/categoria/[slug]`, `catalog/redirects` | — | E (404 de inexistente), T (308) | Conservar |
| F-004 | Marca | `/marca/[slug]` | — | E | Conservar |
| F-005 | Ofertas (solo si hay `compare_at_price`) | `/ofertas` | precios con «antes» | E | Conservar |
| F-006 | Búsqueda del encabezado (`?q=`) sin recarga | `SearchBar` | — | E | Conservar |
| F-007 | Ficha: galería `?foto=`, formato `?variante=`, cantidad, stock, WhatsApp, compartir, relacionados, JSON-LD | `/producto/[slug]` | WhatsApp (dato de la tienda) | E (sin WhatsApp configurado: no aparece) | Conservar |
| F-008 | Agregar al carrito (tarjeta y ficha), funciona sin JS | `carrito/actions` | stock | E (también por envío nativo antes de hidratar) | Conservar |
| F-009 | Carrito: cantidades, eliminar, avisos de stock, «te faltan $X» | `/carrito`, `modules/cart` | — | E | Conservar |
| F-010 | Checkout: entrega (despacho por comuna / retiro), tarifa | `/checkout`, `modules/shipping` | tarifas; retiro requiere dirección del local | E (despacho); C (retiro: sin local en QA) | Conservar |
| F-011 | Cupón en el checkout (GET, sin recarga) | `modules/promotions` | cupones | E (cupón inexistente → error, datos conservados), T | Conservar |
| F-012 | Confirmar pedido (transferencia / simulado) | `checkoutAction` → `placeOrder` | medios de pago | E (pedido ORD-001003 en QA) | Conservar |
| F-013 | Comprobante con enlace secreto, instrucciones, plazo, cambio de medio | `/pedido/[id]` | — | E | Conservar |
| F-014 | Pasarela simulada | `/pago/simulado/*` | solo local/test | C, T (404 fuera de local/test) | Conservar (solo pruebas) |
| F-015 | Sigue tu pedido (número + email; límite de intentos) | `/seguimiento` | — | E (email ajeno rechazado; mayúsculas/espacios normalizados) | Conservar |
| F-016 | Mi cuenta | `/cuenta` | — | E | **Simplificada (S-01)** |
| F-017 | Páginas informativas (ayuda, despacho, cambios, contacto, términos, privacidad) | `/info/[slug]` | textos del panel | E; contacto/términos/privacidad = «Contenido pendiente» | Conservar (pendiente comercial) |
| F-018 | Encabezado, menú móvil `<dialog>`, pie, WhatsApp flotante | `shell.tsx`, `mobile-menu.tsx` | WhatsApp | E (etapa 16) | Conservar |
| F-019 | Consentimiento + GA4/píxel | `analytics.tsx` | `GA_ID`/`META_PIXEL_ID` | P (sin IDs no aparece) | Conservar |
| F-020 | SEO: robots, sitemap, feed `productos.xml`, imagen OG, JSON-LD | rutas raíz | `APP_URL` | E (200) | Conservar |
| F-021 | Correos al cliente (cola + envío) | `modules/mail` | Resend + dominio | P (consola en local), T | Conservar |
| F-022 | 404 reales y pantallas de error | `not-found`, `error.tsx` | — | E (404 en producto/categoría/marca/info/pedido inexistentes) | Conservar |
| F-023 | Retorno y webhook de pasarelas | `/api/payments/[provider]/*` | credenciales | E (404 para no configuradas, 405/400 en entradas inválidas), T | Conservar |
| F-024 | Fotos subidas | `/media/[name]` | `UPLOAD_DIR` | E (sin traversal: `..%2F` → 404; `.importaciones` no se sirve) | Conservar |

### Panel (`/admin`)

| ID | Función | Ruta | Permiso | Estado | Decisión |
|---|---|---|---|---|---|
| F-030 | Ingreso, salida, sesiones, 2FA TOTP | `/admin/login`, `/admin/cuenta` | — | E (anónimo → 307 al login), T | Conservar |
| F-031 | Inicio con alertas (2FA, pendientes, transferencias, stock, sin foto, errores) | `/admin` | staff | E (lectura con datos de QA) | Conservar |
| F-032 | Productos: lista, búsqueda, filtros, acciones masivas | `/admin/productos` | catalog:read / write | E (lectura), T | Conservar |
| F-033 | Producto y variante: crear, editar, imágenes, atributos | `/admin/productos/*` | catalog:write | E (lectura), T | Conservar |
| F-034 | Fotos por SKU (masivo) | `/admin/productos/fotos` | catalog:write | E (lectura), T | Conservar |
| F-035 | Importar Excel (vista previa, huella, idempotencia) | `/admin/productos/importar` | catalog:write | E (lectura), T | Conservar |
| F-036 | Exportar productos CSV | `/admin/productos/productos.csv` | catalog:read | E (403 anónimo, 200 con rol) | Conservar |
| F-037–039 | Categorías, marcas, atributos | `/admin/categorias` … | catalog:write | E (lectura), T | Conservar |
| F-040 | Inventario: lista, ingreso / merma / conteo, historial | `/admin/inventario` | inventory:read / adjust | E (lectura), T | Conservar |
| F-041 | Pedidos: lista, ficha, estados, cancelar, imprimir | `/admin/pedidos` | orders:read / manage | E (lectura de ORD-001003), T | Conservar |
| F-042 | Pagos: lista, ficha, confirmar transferencia, incidencias, reembolso | `/admin/pagos` | ver: orders:read · operar: payments:manage | E (lectura), T | Conservar |
| F-043 | Medios de pago y cuenta de transferencia | `/admin/pagos/configuracion` | payments:manage | E (lectura) | **Corregida (B-002)** |
| F-044 | Clientes (por email) | `/admin/clientes` | customers:read | E (lectura) | Conservar |
| F-045 | Reportes + CSV | `/admin/reportes` | reports:read | E (cifras cuadran: $6.480 = neto $5.445 + IVA $1.035) | Conservar |
| F-046 | Promociones: cupones y despacho gratis | `/admin/promociones` | promotions:manage | E (lectura), T | Conservar |
| F-047 | Tarifas de despacho por región | `/admin/despacho` | shipping:manage | E (lectura), T | Conservar |
| F-048 | Datos de la tienda (contacto, local, retiro, reseñas) | `/admin/tienda` | settings:manage | E (lectura) | Conservar |
| F-049 | Páginas informativas (Markdown) | `/admin/paginas` | settings:manage | E (lectura) | Conservar |
| F-050 | Usuarios del personal | `/admin/usuarios` | users:manage (solo Super Admin) | E (matriz de roles) | Conservar |
| F-051 | Auditoría | `/admin/auditoria` | audit:read | E (lectura) | Conservar |
| F-052 | Errores registrados | `/admin/errores` | audit:read | E (lectura) | Conservar |
| F-053 | Jobs: vencimiento, reconciliación, correos, purga | `npm run jobs`, `instrumentation.ts` | — | T, C | Conservar |
| F-054 | Respaldos (`docker-compose.prod.yml`) | `scripts/respaldo.sh` | servidor | N (probado en fase 10; no aplica en local) | Conservar |
| F-055 | Carga de catálogo desde manifiesto | `npm run catalogo:cargar` | — | T | Conservar |

### Matriz de permisos ejecutada (página → resultado por rol)

Sesiones reales por rol contra `:3002`. «sin permiso» = el servidor redirige a `/admin?sin_permiso=1`: llega como 200 + redirección en el flujo, porque el layout ya empezó a transmitirse, y **el contenido restringido no se envía**, comprobado buscando los correos de otros usuarios.

| Página | Anónimo | Super | Admin | Ventas | Bodega |
|---|---|---|---|---|---|
| Productos (lista), Inventario, Pedidos, Pagos (ver), Mi cuenta | login | ✓ | ✓ | ✓ | ✓ |
| Nuevo producto, Importar, Fotos, Categorías, Marcas, Atributos | login | ✓ | ✓ | sin permiso | sin permiso |
| Configuración de pagos, Promociones, Despacho, Tienda, Páginas, Auditoría, Errores | login | ✓ | ✓ | sin permiso | sin permiso |
| Clientes, Reportes | login | ✓ | ✓ | ✓ | sin permiso |
| Usuarios | login | ✓ | sin permiso | sin permiso | sin permiso |
| `productos.csv` | 403 | ✓ | ✓ | ✓ | ✓ |
| `pedidos.csv` | 403 | ✓ | ✓ | ✓ | 403 |

Coincide con `src/modules/auth/rbac.ts`. Las acciones (server actions) exigen permiso aparte con `requirePermission`; por ejemplo, Pagos se ve con `orders:read` y se opera con `payments:manage`.

## 4. Problemas (B-xxx)

| ID | Severidad | Reproducción | Causa | Arreglo | Estado / evidencia |
|---|---|---|---|---|---|
| B-001 | Media (UX, callejón sin salida) | Encabezado o menú → «Mi cuenta» | Página provisoria que promete «Pronto podrás crear tu cuenta…» y solo ofrece «Ver productos» | S-01: explica la compra sin cuenta y lleva a «Sigue tu pedido» y «Centro de ayuda»; sin prometer funciones | **Corregido**; texto verificado en `:3002/cuenta` |
| B-002 | Baja (texto contradictorio) | Panel → Pagos → Configuración | La tabla dice «Mercado Pago: Implementado Sí» y la nota lo agrupaba con Webpay/Khipu «pendientes hasta implementar su protocolo» | Nota corregida: Webpay y Khipu pendientes; Mercado Pago implementado y sin probar en sandbox (§10) | **Corregido** |
| B-003 | Baja (legibilidad) | Comprobante: «Tienes hasta el 19-10-26, 3:03 a. m.» | Formato corto de `es-CL` con año de 2 dígitos | Propuesta: fecha con mes en palabras o año completo | **Pendiente** (decisión de formato; se usa en todo el sitio) |
| B-004 | Media (riesgo comercial) | Pedido por transferencia: plazo de pago de 30 min | `TRANSFER_RESERVATION_MINUTES` sin definir → usa `RESERVATION_TTL_MINUTES` (30) | Definir el plazo real de transferencia en el entorno (5–4320 min permitido) | **Pendiente: decisión comercial / configuración** |
| B-005 | Muy baja (código) | — | Permiso `customers:write` definido y nunca usado | Propuesta: quitarlo o usarlo cuando exista edición de clientes | Pendiente (sin impacto) |

Revisados sin hallazgos (ejecución):
- Rastreo de **182 páginas** públicas: 61 en QA y 121 en la demo, sin ningún enlace roto ni respuesta distinta de 200.
- 404 reales en recursos inexistentes.
- `/media` sin recorrido de rutas.
- Webhooks y retornos de pasarelas no configuradas → 404; entrada inválida → 400/405.
- Seguimiento sin filtración con un email ajeno.
- Checkout sin medios de pago: muestra «no hay medios de pago disponibles» y no deja confirmar.
- Transferencia en producción sin datos bancarios: el método no se ofrece; los datos de ejemplo solo aparecen rotulados en local/test.

## 5. Simplificaciones

| ID | Aplicada / propuesta | Qué resuelve | Cómo sigue accesible lo necesario |
|---|---|---|---|
| S-01 | Aplicada: «Mi cuenta» informativa | Promesa de una función inexistente y página sin salida | La URL `/cuenta` y el enlace se conservan; ahora lleva al seguimiento y a la ayuda. Si se crean cuentas, se reemplaza la página |
| S-02 | Propuesta: quitar `customers:write` | Permiso muerto | No hay acción que lo use |
| S-03 | Propuesta (decisión comercial): ocultar del pie «Términos», «Privacidad» y «Contacto» mientras digan «Contenido pendiente» | Enlaces a páginas vacías | Hoy son honestas (rotuladas pendientes y `noindex`); se recomienda **completarlas** antes de publicar, no ocultarlas |
| S-04 | Revisado, se conserva: «Pago simulado (solo pruebas)» visible en la demo local | — | Solo existe con `APP_ENV` local/test + `PAYMENT_SIMULATION=on`; en producción no se ofrece |

No se retiró ninguna función de negocio: auditoría, permisos, 2FA, movimientos, respaldos, reembolsos y controles de seguridad se conservan.

## 6. Reglas reales detectadas (del código y `docs/PAGOS.md`; la etapa 2 debe probarlas)

- **Montos**: CLP enteros, IVA incluido; totales recalculados en el servidor. El checkout envía `expectedTotal` y, si el servidor calcula otro total, el pedido no se crea.
- **Carrito**: no reserva. Máximo 99 unidades por producto. Subir la cantidad exige disponible (físico − reservado); bajarla siempre se permite.
- **Pedido**:
  - se crea en una transacción: bloquea el carrito, valida líneas, cotiza el despacho o valida el retiro, aplica el cupón con bloqueo de su fila, reserva el stock todo o nada y borra el carrito;
  - el doble envío no lo duplica;
  - hay como máximo 3 pedidos pendientes por email (con *advisory lock*) y 10 pedidos cada 15 min por conexión.
- **Reservas**: vencen a los `RESERVATION_TTL_MINUTES` (30), o a los `TRANSFER_RESERVATION_MINUTES` si es transferencia. Al vencer, el pedido se cancela con `payment_status = EXPIRED` y libera el stock. Las reservas se liberan una sola vez (solo las `ACTIVE`).
- **Pago**:
  - solo `applyResult` marca pagado: bloquea el pedido y el intento, y consume la reserva (la venta baja el físico y el reservado en el mismo UPDATE);
  - si la reserva venció, vuelve a reservar todo o pasa a REVIEW;
  - un pago duplicado o de un pedido cancelado → REVIEW;
  - nunca retrocede desde PAID;
  - el retorno del navegador no basta: se verifica con el proveedor;
  - una transferencia la confirma el panel (`confirmTransfer`): evento deduplicado por `commandId`, operación bancaria única y monto distinto → REVIEW.
- **Estados**:
  - mapa `TRANSITIONS`; el panel no puede hacer transiciones que mueven dinero (→ PAID, → REFUNDED, cancelar un pagado);
  - cancelar exige motivo y libera reservas;
  - SHIPPED/DELIVERED se rotulan «Listo para retiro» / «Retirado» en pedidos con retiro.
- **Cupones**:
  - % (≤ 90) o monto fijo; mínimo, vigencia en días de Chile, máximo de usos, uno por email;
  - un uso = un pedido no cancelado, así que un pedido vencido devuelve su uso;
  - el descuento aplica solo sobre productos y se redondea hacia abajo;
  - un total de $0 se rechaza;
  - no se puede renombrar un cupón con usos.
- **Despacho**: tarifa por región; una región sin tarifa no se despacha. Despacho gratis si productos − descuento ≥ el umbral.
- **Reembolsos**: `refundOrder` sale de una transacción. Repone stock (`SALE_CANCELLED`/`RETURN`) **solo si se marca reponer**, y luego pide el reembolso al proveedor con una clave idempotente.
- **Stock**: solo a través de `applyMovement`; los movimientos son inmutables (trigger); como máximo una venta por pedido y línea, y una reversa por pedido y línea.

**Contradicciones o decisiones pendientes** (no inventadas; documentadas en el código):
- Un pedido vencido que se recupera con un pago tardío **no revalida el cupón** (shortcut documentado, fase 13 punto 6). Decide el negocio.
- Plazo de 30 min para transferencias (B-004).

## 7. Resultados de checks y recorrido

| Check | Resultado (esta revisión) |
|---|---|
| `npm run typecheck` | OK |
| `npm test` | **23 archivos, 244 pruebas aprobadas** |
| `npm run build` | OK |
| Lint | No existe en el repositorio |
| Rastreo de enlaces (`:3002` y `:3001`) | 61 + 121 páginas, 0 errores |
| Recorrido del cliente en `:3002` | Agregar 2 productos (uno por envío nativo antes de hidratar) → carrito → checkout con despacho a Providencia ($2.990) → transferencia → ORD-001003 por $13.670 (= $10.680 + $2.990) → comprobante → seguimiento (correcto y con email ajeno) |
| Matriz de permisos del panel | Tabla de la §3, 24 páginas × 5 perfiles |

## 8. Riesgos y casos prioritarios para la etapa 2

1. Ciclo de una transferencia por la interfaz y por servicios: confirmar → preparar → despachar → entregar; repetir la confirmación; confirmación junto con vencimiento.
2. Concurrencia: última unidad, último uso de un cupón, doble envío, vencimiento junto con pago tardío.
3. Manipulación de importes (`expectedTotal`, cantidades negativas, decimales o > 99, `variantId` ajeno).
4. Reembolso con y sin reposición; reconciliación de movimientos con pedidos y con el reporte.
5. Webhooks de Mercado Pago con la API simulada (eventos duplicados, fuera de orden, monto o moneda distintos, pedido ajeno). **Sin sandbox real.**
6. Reimportación de Excel: no duplicar stock y no pisar ediciones.
7. Acceso: pedido ajeno por UUID (no adivinable), seguimiento por número + email, CSV y acciones por rol mediante peticiones directas.

## 9. Pendientes clasificados

| Tipo | Pendiente |
|---|---|
| Bug | B-003 (formato de fecha, baja) |
| Configuración | B-004 plazo de transferencia; datos bancarios; Resend + dominio; `GA_ID`/`META_PIXEL_ID`; WhatsApp y datos de la tienda |
| Integración | Mercado Pago en sandbox; Webpay y Khipu no implementados |
| Decisión comercial | Cuentas de cliente (hoy compra como invitado); textos de términos, privacidad y contacto; cupón en pedidos recuperados; S-02/S-03 |

## 10. Evaluación

**Apta para pruebas profundas.** Las funciones existen, cargan y responden como dicen; no hay enlaces rotos ni filtración de permisos en lo ejecutado; los problemas encontrados son de texto o de configuración. Límite: las acciones del panel no se ejecutaron por la interfaz (§2), así que la etapa 2 debe ejecutarlas, por servicios y, si se habilita el ingreso, por la interfaz. Esto **no** autoriza la venta real.
