# Instrucciones para Claude en este repositorio

Proyecto: e-commerce para Chile. Leer `docs/ARQUITECTURA.md` y `docs/BASE_DE_DATOS.md` antes de cambiar el modelo.

## Reglas del proyecto
- Todo cambio de stock pasa por el servicio de inventario y genera un `inventory_movement`; nunca editar `stock_on_hand` directo.
- Montos en CLP enteros, IVA incluido. Totales siempre recalculados en el servidor.
- Un pedido solo pasa a pagado con confirmación verificada del proveedor.
- Una rama y un PR por fase; `npm test`, `npm run typecheck` y `npm run build` deben pasar antes del PR.
- Cambios de esquema: editar `src/db/schema/*`, luego `npm run db:generate -- --name <cambio>`; nunca editar migraciones ya publicadas.

## Plugins de la sesión
- **Ponytail** (activo por hook): solución más simple que funcione, sin recortar validación, seguridad ni lo pedido explícitamente.
- **Task Observer**: invocar la skill `task-observer:task-observer` antes de la primera llamada a herramientas de cada sesión.
  Workspace fijado: `/home/claude/tienda-online/.claude` (contiene `skill-observations/`). Hacer commit de las observaciones nuevas junto con el trabajo; nunca `git clean` sobre esa carpeta.
- **Claude-Mem Cowork**: usar `claude-mem-cowork:mem-search` al iniciar para recuperar contexto de sesiones previas (requiere configuración con `mem-setup`).
