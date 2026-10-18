# Auditoría del repositorio (2026-10-18)

Revisión de frontend, backend, base de datos y operación, comparada con lo que se espera de un e-commerce chileno serio: seguridad, cumplimiento legal, performance, SEO, conversión y retención.

**Alcance.** Rama `fase-9-panel`, con cambios sin commit: panel de la Fase 9, transiciones, Mercado Pago y reembolsos.

**Qué se verificó y qué no.**
- **Leído y comprobado:** el código y la configuración, `npm audit` (0 vulnerabilidades en dependencias de producción) y las 195 pruebas en verde.
- **Revisado antes en el navegador:** tienda y panel.
- **Inferido, sin ejecutar:** carga real, entregabilidad de correos, comportamiento en producción y todo lo que depende de servicios externos.

## Resumen

| Área | Estado | Comentario |
|---|---|---|
| Integridad de datos y pagos | **Muy bueno** | CHECK en la base, movimientos inmutables, un solo flujo que confirma pagos, idempotencia, bloqueos ordenados, pruebas contra PostgreSQL real |
| Seguridad de la aplicación | Bueno | Argon2id, cookies httpOnly, CSP y HSTS, auditoría, firmas de webhook, protección contra fórmulas en CSV. Falta 2FA y límites persistentes |
| Cumplimiento legal (Chile) | **Bloqueante** | Sin boleta electrónica (SII) y sin textos legales. Ley 21.719 de datos personales a semanas de entrar en vigencia |
| Operación (DevOps) | Regular | Docker, CI y healthchecks bien. Sin monitoreo de errores, respaldos automáticos ni limpieza de datos |
| Performance | Bueno hoy, frágil al crecer | Todo dinámico sin caché; índices y búsqueda bien resueltos |
| SEO | Bueno | JSON-LD, sitemap, canónicas, 404 reales, OG, feed. Falta contenido (fotos, textos, reseñas) |
| UX / UI | Bueno | Rediseño con identidad, sin JS obligatorio, accesible (foco, reducir movimiento, contraste AA) |
| Conversión y retención | **Débil** | Solo invitado, sin cupones, envío gratis, carrito abandonado, «volver a comprar», reseñas ni avisos de stock |

## Hallazgos priorizados

### Críticos: antes de vender

1. **Boleta electrónica.** Toda venta a consumidor final exige boleta electrónica (SII). El sistema no emite DTE.
   - **Hacer:** integrar un proveedor (p. ej. Bsale, OpenFactura, LibreDTE) que emita la boleta al confirmarse el pago (`markOrderPaid`), con el mismo patrón de cola y reintentos que `email_outbox`. Guardar folio y PDF en el pedido.
   - Hoy los correos dicen, con razón, «no es una boleta».
2. **Textos legales vacíos.** Términos, privacidad, cambios y devoluciones aparecen como «Contenido pendiente» (ya se editan en `/admin/paginas`). Deben cubrir:
   - **Ley 19.496:** derecho a retracto de 10 días en compras a distancia (art. 3 bis, salvo exclusión expresa e informada) y garantía legal de 6 meses.
   - Identificación del proveedor (razón social, RUT, domicilio) y medios de contacto.
   - **Ley 21.719 de protección de datos**, en plena vigencia desde diciembre de 2026: finalidades, base de licitud, plazos de conservación y derechos del titular (acceso, rectificación, supresión, oposición y portabilidad).

   Los debe redactar o revisar un abogado; este repositorio no los inventa.
3. **Medios de pago.** Solo opera la transferencia.
   - Mercado Pago está implementado y probado contra una API simulada, **no contra su sandbox real**: falta el paso de `docs/PAGOS.md` §10.
   - Sin pago con tarjeta, la conversión cae fuerte.
4. **Trabajo sin integrar.** La Fase 9, las transiciones y Mercado Pago con reembolsos están sin commit. La Fase 9 no tiene pruebas propias para reportes, clientes, contraseña propia, datos de la tienda, páginas y aviso de pedido nuevo.

### Altos

5. **Acceso al panel.**
   - Sin segundo factor (2FA/TOTP), aunque el personal opera dinero y datos personales. **Corregido:** TOTP opcional en «Mi cuenta», con aviso a administradores.
   - Las sesiones del personal duraban 30 días (`SESSION_TTL_DAYS`). **Corregido:** ahora 1 día por omisión.
   - Los límites de intentos (login, checkout, webhooks) viven en memoria de un proceso: con dos instancias o un reinicio se pierden.
   - **Hacer:** TOTP para Administrador y Super administrador, sesión del panel de horas con expiración por inactividad, y límites en la base o en Redis.
6. **Operación sin red de seguridad.**
   - No hay seguimiento de errores (Sentry o similar), alertas ni monitor de disponibilidad.
   - Los respaldos están documentados (`pg_dump` en `DESPLIEGUE.md`) pero no automatizados ni probados con una restauración.
   - Las fotos viven en el disco del servidor (S3 pendiente).
7. **Datos que crecen sin límite.**
   - `purgeExpiredSessions()` existe pero **nunca se llama**.
   - Los carritos abandonados no se borran.
   - `audit_logs`, `payment_events` y `email_outbox` no tienen retención.
   - Para la Ley 21.719 hace falta un plazo de conservación de datos personales y una forma de anonimizar a un cliente que pide supresión (hoy hay copias de su nombre, email, teléfono y dirección en pedidos, clientes, correos y auditoría).
8. **Correo.** No está documentada la autenticación del dominio (SPF, DKIM, DMARC) que exige Resend. Sin ella, los avisos de pedido terminan en spam.
9. **Medición.**
   - No hay analítica (GA4 o similar), píxel de Meta ni conversión de compra, así que no se puede medir el embudo.
   - Al agregarla hace falta un aviso de cookies con consentimiento (Ley 21.719) y ampliar la CSP.
   - Search Console y Merchant Center están documentados (`DESPLIEGUE.md` §8), no conectados.

### Medios: conversión y retención (estándar de la industria)

10. **Compra repetida.** Productos de aseo e higiene se compran cada mes. Faltan:
    - «volver a comprar» desde el pedido o el correo;
    - recordatorios de reposición;
    - cuentas opcionales con historial;
    - más adelante, suscripción («recíbelo cada 30 días»), que exige cobros recurrentes.
11. **Promociones.** `orders.discount_total` existe pero no se usa. Faltan cupones, envío gratis sobre un monto, precio por cantidad y **packs** (el negocio los quiere). Son la palanca de ticket promedio más común.
12. **Carrito abandonado.** El email se pide recién en el checkout. Guardarlo antes y enviar un recordatorio, con consentimiento, recupera ventas.
13. **Confianza en la ficha.** Faltan:
    - reseñas y valoraciones (también dan estrellas en Google);
    - «avísame cuando llegue» en agotados;
    - costo de despacho estimado según comuna en la propia ficha;
    - recomendaciones («frecuentemente comprados juntos»).
14. **Despacho.** No hay número de seguimiento ni courier (Starken, Chilexpress, Blue Express) en el pedido ni en el correo de despacho. Tampoco retiro en tienda.
15. **Catálogo real.** No tiene fotos, marcas ni categorías completas. Sin fotos, el feed de Google y Meta no publica nada y la tienda se ve vacía. Es la mejora de conversión más barata.
16. **Búsqueda.** Buena base (texto completo en español y trigramas), pero sin autocompletar ni sugerencias cuando no hay resultados.

### Bajos: calidad y endurecimiento

17. **Sin linter** (ESLint o Biome) ni actualizaciones automáticas de dependencias (Dependabot o Renovate) en CI. Hoy hay 0 vulnerabilidades.
18. **CSP con `script-src 'unsafe-inline'`** (lo exige Next sin nonce). Como las páginas ya son dinámicas, una CSP con nonce por solicitud es viable y cierra XSS reflejado.
19. **Sin pruebas de extremo a extremo en navegador** (Playwright) del flujo de compra en CI. Las pruebas de servicios son fuertes; faltan las de la interfaz.
20. **Caché.** Todas las páginas de la tienda son dinámicas (`force-dynamic`). Con tráfico real conviene cachear catálogo y fichas con `"use cache"` e invalidarlos al editar desde el panel. El stock y los precios se seguirían validando en el carrito y el checkout.
21. **Accesibilidad.** La base es buena (salto al contenido, foco visible, reducir movimiento, etiquetas, contraste AA verificado). Falta una pasada con lector de pantalla y un chequeo automático (axe) en CI.

## Fortalezas (ya al nivel de la industria)

- **Dinero y stock difíciles de corromper:**
  - restricciones en la base (stock nunca negativo, montos cuadrados);
  - movimientos inmutables (trigger);
  - una sola puerta para el stock;
  - un solo flujo que confirma pagos;
  - idempotencia en checkout, confirmaciones y reembolsos;
  - pago incierto que no se trata como rechazo;
  - dinero dudoso que nunca se descarta.
- **Auditoría en la misma transacción** de cada cambio del panel.
- **Seguridad:**
  - Argon2id con parámetros OWASP;
  - cookies `httpOnly` y `SameSite`;
  - CSP, HSTS, `nosniff`, `frame-ancestors`;
  - IP real solo detrás de proxies confiables;
  - firmas de webhook con comparación en tiempo constante;
  - datos de pago sin secretos guardados;
  - CSV protegido contra inyección de fórmulas.
- **Funciona sin JavaScript** (filtros, carrito, checkout) y con transiciones cuando hay soporte.
- **SEO técnico completo:** datos estructurados, canónicas, 404 reales, redirecciones 308 de slugs, sitemap, imagen al compartir y feed para Google y Meta.
- **Despliegue reproducible:** Docker, migraciones al arrancar, jobs separados, HTTPS automático, CI con typecheck, pruebas, build e imagen.

## Orden recomendado

1. **Integrar lo abierto:** pruebas de la Fase 9, commit y PRs (panel, transiciones, Mercado Pago) y prueba en el sandbox de Mercado Pago.
2. **Mínimo legal para vender:** textos legales (abogado), boleta electrónica y política de retracto visible en la compra.
3. **Operación:** respaldos automáticos con restauración probada, Sentry y monitor de disponibilidad, SPF/DKIM/DMARC, limpieza de sesiones, carritos y registros, y retención de datos personales.
4. **Panel seguro:** 2FA, sesión corta para el personal y límites persistentes.
5. **Contenido y conversión:** fotos y catálogo real, cupones y envío gratis sobre un monto, packs, «volver a comprar», carrito abandonado, reseñas y avisos de stock.
6. **Medición:** analítica, Search Console y Merchant Center, con consentimiento.
7. **Escala:** caché del catálogo, almacenamiento S3 para fotos, CSP con nonce y pruebas E2E.

## Segunda revisión (Codex, 2026-10-18)

Auditoría independiente de solo lectura hecha por Codex (OpenAI) y verificada hallazgo por hallazgo por Claude. Corregidos: reconciliación que podía consultar siempre los mismos intentos, reembolsos o contracargos externos ignorados en pagos confirmados, intentos inciertos que no volvían a pendiente, cupón que dejaba el total en $0, renombrar cupones con usos, y el límite de pedidos pendientes con envíos simultáneos. Queda como decisión documentada: un pedido vencido que se recupera con un pago tardío no vuelve a validar su cupón.
