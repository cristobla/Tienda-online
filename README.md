# Tienda online

Plataforma e-commerce para el mercado chileno (higiene personal, cuidado personal y aseo del hogar), con arquitectura genérica para sumar otras categorías.

**Stack:** Next.js · TypeScript · PostgreSQL · Drizzle ORM · Zod · Vitest

## Puesta en marcha (desarrollo)

Requisitos: Node 22+, Docker (o un PostgreSQL 16 local).

```bash
npm install
cp .env.example .env          # completar SEED_ADMIN_PASSWORD
docker compose up -d          # PostgreSQL con bases tienda y tienda_test
npm run db:migrate            # crea las tablas
npm run db:seed               # datos de prueba + usuario admin
npm run dev                   # http://localhost:3000
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (usa `DATABASE_URL_TEST`, la recrea en cada corrida) |
| `npm run typecheck` | Verificación de tipos |
| `npm run db:generate` | Genera una migración a partir de cambios en el esquema |
| `npm run db:migrate` | Aplica migraciones pendientes |
| `npm run db:reference` | Carga regiones y comunas (producción) |
| `npm run db:seed` | Reemplaza la BD de desarrollo con datos de prueba |
| `npm run db:studio` | Explorador visual de las tablas en el navegador |

## Usuario de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Super Admin | `SEED_ADMIN_EMAIL` (por defecto `admin@demo.local`) | `SEED_ADMIN_PASSWORD` de tu `.env` |

## Tienda (catálogo público)

| Ruta | Qué muestra |
|---|---|
| `/` | Buscador, categorías, destacados y marcas |
| `/productos` | Todo el catálogo; con `?q=` es la búsqueda (no indexada) |
| `/categoria/[slug]` | Categoría con sus subcategorías |
| `/marca/[slug]` | Productos de una marca |
| `/producto/[slug]` | Ficha con selector de formato (`?variante=SKU`), cantidad, agregar al carrito, características y JSON-LD |
| `/carrito` | Carrito: cambiar cantidades y quitar, con precio y stock actuales (no reserva stock). El checkout llega en la FASE 6 |
| `/cuenta`, `/info/[tema]` | Páginas provisorias (cuenta de cliente, ayuda y legales por redactar) |
| `/sitemap.xml`, `/robots.txt` | Generados desde la base |

Filtros por URL: `marca`, `precio_min`, `precio_max`, `disponible=1`, `a_<atributo>` (atributos marcados como filtrables), `orden`, `pagina`.
El nombre de la tienda se cambia en `src/lib/site.ts`.

## Panel de administración

Entrar en `/admin` con el usuario del seed. Cada sección exige su permiso (ver `src/modules/auth/rbac.ts`).

| Ruta | Qué permite | Permiso |
|---|---|---|
| `/admin` | Indicadores, variantes a reponer y actividad reciente | staff |
| `/admin/pedidos`, `/admin/pedidos/[id]` | Pedidos con búsqueda y filtro por estado; detalle con productos (copia al momento de la compra), totales, stock reservado e historial; cancelar antes del pago y avanzar preparación/despacho/entrega | `orders:read` / cambiar estado: `orders:manage` |
| `/admin/productos` | Listado con búsqueda (nombre, SKU, código de barras) y filtros | `catalog:read` |
| `/admin/productos/nuevo`, `/admin/productos/[id]` | Producto + variantes, atributos, imágenes, SEO | `catalog:write` |
| `/admin/inventario`, `/admin/inventario/[variante]` | Stock por variante (bodega, reservado, disponible), historial; ingresos, mermas y conteo físico | `inventory:read` / ajustar: `inventory:adjust` |
| `/admin/categorias`, `/admin/marcas`, `/admin/atributos` | Árbol de categorías, marcas y definiciones de atributos | `catalog:write` |
| `/admin/usuarios` | Usuarios del staff, roles, contraseñas | `users:manage` (Super Admin) |
| `/admin/auditoria` | Quién cambió qué y cuándo | `audit:read` |

- El stock nunca se edita directo: cada cambio (stock inicial, ingreso, merma, conteo) es un movimiento de inventario con usuario y motivo; el historial no se puede editar ni borrar.
- Descripciones con formato básico: `**negrita**`, `*cursiva*`, listas `- ` / `1. ` y títulos `## `.
- Imágenes: JPG, PNG, WebP o AVIF, máx. 5 MB c/u, guardadas en `UPLOAD_DIR` (por defecto `./uploads`, fuera del repositorio). **En producción, montar esa carpeta en un volumen persistente.**
- Lo que tiene historial (stock, ventas, productos asociados) no se elimina: se desactiva.
- Pedidos: nacen "Pendiente de pago" con el stock reservado; si no se paga a tiempo (`RESERVATION_TTL_MINUTES`) se cancelan solos y el stock vuelve a estar disponible. Marcar como pagado, reembolsar o anular un pedido pagado solo lo hace el módulo de pagos (FASE 7), nunca el panel.

## Documentación

- [Arquitectura y decisiones](docs/ARQUITECTURA.md)
- [Base de datos](docs/BASE_DE_DATOS.md)

## Estado

- [x] FASE 1 — Arquitectura y base de datos
- [x] FASE 2 — Catálogo, productos, categorías y marcas
- [x] FASE 3 — Panel administrativo
- [x] FASE 4 — Inventario y movimientos
- [x] FASE 5 — Carrito y pedidos
- [ ] FASE 6 — Checkout
- [ ] FASE 7 — Integración de pagos
- [ ] FASE 8 — Seguridad, testing, SEO y optimización
