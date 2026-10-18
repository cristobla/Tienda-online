# Instrucciones para agentes (Codex) en este repositorio

E-commerce para Chile (higiene personal, cuidado personal, aseo del hogar y accesorios). Este archivo resume las reglas; el detalle completo de cada fase está en `CLAUDE.md` y la arquitectura en `docs/ARQUITECTURA.md`. Léelos antes de cambiar código.

## Cómo se trabaja aquí
- Escribe en español de Chile (textos, comentarios, mensajes).
- Trabajas en tu propia rama y copia del repositorio. **No hagas commit, push, merge ni cambies de rama**: deja los cambios en el directorio de trabajo; los revisa Claude y el dueño decide.
- Haz solo la tarea pedida. No reformatees ni "mejores" archivos que la tarea no necesita.
- Al terminar, resume en pocas líneas qué archivos cambiaste y qué quedó pendiente o con duda.

## Zonas que NO tocas (salvo que la tarea lo pida explícitamente)
- `src/modules/payments`, `src/modules/orders`, `src/modules/inventory`, `src/modules/auth`, `src/modules/promotions`: dinero, stock y seguridad.
- `src/db/schema`, `drizzle/` (migraciones), `next.config.ts` (seguridad), `Dockerfile`, `docker-compose*.yml`.
- `.env*`, `/datos/` (datos reales del negocio), `.claude/`.

## Reglas del proyecto
- Stack: Next.js App Router · TypeScript estricto · PostgreSQL 16 · Drizzle · Zod · Tailwind CSS v4 · Vitest contra PostgreSQL real.
- Monolito modular: la lógica de negocio va en `src/modules/<dominio>/`; páginas y server actions delgadas. Nada de lógica de negocio en componentes visuales.
- Todo cambio de stock pasa por el servicio de inventario (`applyMovement`); nunca editar `stock_on_hand` directo.
- Montos en CLP enteros, IVA incluido; los totales se recalculan siempre en el servidor.
- **No inventar datos del negocio** (dirección, teléfono, RUT, precios, plazos, políticas). Si un texto los necesita, deja un marcador `[COMPLETAR: …]`.
- Diseño: tokens de `src/app/globals.css` (`leaf`, `ink`, `menta` solo para comprar, `fleje` solo para precios, `oferta` solo para ofertas). Íconos propios en `src/components/icons.tsx`, sin librerías de componentes.
- Antes de entregar cambios de código: `npm run typecheck` y `npm test` (las pruebas necesitan la base de pruebas; si no tienes acceso, dilo).
