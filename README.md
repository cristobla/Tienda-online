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
| `/producto/[slug]` | Ficha con selector de formato (`?variante=SKU`), características y JSON-LD |
| `/sitemap.xml`, `/robots.txt` | Generados desde la base |

Filtros por URL: `marca`, `precio_min`, `precio_max`, `disponible=1`, `a_<atributo>` (atributos marcados como filtrables), `orden`, `pagina`.
El nombre de la tienda se cambia en `src/lib/site.ts`.

## Documentación

- [Arquitectura y decisiones](docs/ARQUITECTURA.md)
- [Base de datos](docs/BASE_DE_DATOS.md)

## Estado

- [x] FASE 1 — Arquitectura y base de datos
- [x] FASE 2 — Catálogo, productos, categorías y marcas
- [ ] FASE 3 — Panel administrativo
- [ ] FASE 4 — Inventario y movimientos
- [ ] FASE 5 — Carrito y pedidos
- [ ] FASE 6 — Checkout
- [ ] FASE 7 — Integración de pagos
- [ ] FASE 8 — Seguridad, testing, SEO y optimización
