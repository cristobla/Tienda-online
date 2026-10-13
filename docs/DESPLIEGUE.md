# Despliegue y puesta en producción

Guía para pasar de "funciona en mi PC" a una tienda pública. Está ordenada por prioridad: primero lo que bloquea vender, después la infraestructura y al final la operación diaria.

## 1. Qué falta antes de vender (bloqueantes)

| # | Tema | Por qué bloquea | Quién |
|---|---|---|---|
| 1 | **Pagos (FASE 7)** | Base lista con **transferencia bancaria** (el admin confirma en `/admin/pagos`). Falta: cargar la cuenta real en `/admin/pagos/configuracion` y programar `npm run jobs`. Pagos con tarjeta: pendientes (docs/PAGOS.md §9). | Negocio (cuenta) + desarrollo (pasarelas) |
| 2 | **Credenciales de pago** | Webpay Plus (código de comercio + API key) y/o Mercado Pago (access token + secreto de webhook). Se tramitan con Transbank / Mercado Pago a nombre de la empresa. Transferencia bancaria no necesita credenciales (el admin confirma). | Negocio |
| 3 | **Boleta / factura electrónica (SII)** | Cada venta debe emitir documento tributario. Contratar un proveedor de DTE con API. | Negocio + desarrollo |
| 4 | **Textos legales** | Términos y condiciones, política de privacidad, cambios y devoluciones (derecho a retracto en compras a distancia, Ley 19.496), tratamiento de datos personales (Ley 19.628 y Ley 21.719, que entra en vigencia en diciembre de 2026). Revisar con asesoría legal. Se publican en `/info/*`. | Negocio + legal |
| 5 | **Datos reales** | Contacto y horario (`src/lib/site.ts`: `email`, `hours`), tarifas y plazos de despacho reales (`/admin/despacho`), categorías, marcas, productos, fotos y stock real. **Nunca correr `npm run db:seed` en producción** (borra todo; además se niega con `NODE_ENV=production`). | Negocio |
| 6 | **Endurecimiento (FASE 8)** | Ver §4. Varias piezas son necesarias antes de abrir al público. | Desarrollo |

## 2. Dónde alojarla

La aplicación es un servidor Node.js de larga duración (`next start`) + PostgreSQL 16 + una carpeta persistente para las imágenes subidas (`UPLOAD_DIR`). **No sirve un hosting "serverless" puro** (p. ej. funciones de Vercel) tal como está: la tarea que vence pedidos corre dentro del proceso, las imágenes se guardan en disco y el límite de intentos de login vive en memoria (todo está marcado con `ponytail:` en el código, con su alternativa).

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. VPS + Docker Compose** (recomendada para empezar) | Un servidor Linux (2 vCPU / 4 GB RAM alcanza para partir) con Docker: contenedor de la app + PostgreSQL + Caddy como proxy HTTPS. | Barato, control total, coincide con la arquitectura (§2 de ARQUITECTURA). | Tú administras actualizaciones, respaldos y monitoreo. |
| **B. Plataforma administrada (PaaS)** | Railway, Render o Fly.io: servicio Node + PostgreSQL administrado + volumen persistente para `UPLOAD_DIR`. | Menos mantención, respaldos y HTTPS incluidos. | Más caro a medida que crece; revisar que el volumen sea persistente. |

Elegir el servidor en una región cercana (São Paulo / Santiago si el proveedor la ofrece) para menor latencia en Chile.

## 3. Lo que ya está listo en el código

- Migraciones versionadas (`npm run db:migrate`) y carga de regiones/comunas apta para producción (`npm run db:reference`).
- `npm run start` verifica la base antes de arrancar (en producción solo avisa; no levanta contenedores).
- Variables validadas al iniciar (`src/lib/env.ts`): si falta una, la app no arranca.
- Página de error amigable si la base cae, reconexión automática del pool, pedidos vencidos liberados cada minuto.
- Sesiones con cookie `httpOnly` + `Secure` (en producción) + `SameSite=Lax`, contraseñas Argon2id, permisos por rol, auditoría.

## 4. Lo que hay que agregar antes de publicar (FASE 8)

1. **Imagen Docker de la app**: `Dockerfile` multi-etapa con `output: "standalone"` en `next.config.ts`, y un `docker-compose.prod.yml` (app + PostgreSQL con contraseña propia, sin publicar el puerto 5432 + Caddy). El `docker-compose.yml` actual es **solo de desarrollo** (usuario y clave `tienda`).
2. **Crear el primer Super Admin en producción**: hoy el usuario admin solo lo crea el seed. Hace falta un comando tipo `npm run admin:create` que pida email y contraseña.
3. **Cabeceras de seguridad** (`next.config.ts`): Content-Security-Policy, Strict-Transport-Security, X-Frame-Options/`frame-ancestors`, Referrer-Policy.
4. **IP real detrás del proxy**: el límite de intentos de login usa `x-forwarded-for`; configurar que solo se confíe en el proxy propio.
5. **Límite de pedidos pendientes** por IP/email: sin él, un bot puede reservar stock 30 minutos por pedido.
6. **Correo transaccional** (confirmación de pedido, cambios de estado): proveedor tipo Resend, Postmark, Amazon SES o SMTP del dominio.
7. **SEO de producción**: 404 reales en productos/categorías inexistentes (hoy 200 + `noindex` por el streaming), redirecciones 301 al cambiar slugs, `APP_URL` con el dominio para sitemap y canónicas.
8. **Imágenes**: si se usa una plataforma sin disco persistente, implementar el adaptador S3 (la interfaz `saveImage/readImage/deleteImageFile` en `src/lib/storage.ts` ya está preparada).

## 5. Variables de entorno en producción

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `postgres://USUARIO:CLAVE_LARGA@HOST:5432/tienda` (usuario propio, no `tienda/tienda`) |
| `APP_URL` | `https://tu-dominio.cl` |
| `SESSION_TTL_DAYS` | `30` (o menos para el panel) |
| `APP_ENV` | `production` (explícito; habilita las reglas de producción: sin pago simulado ni datos de ejemplo, `APP_URL` https) |
| `RESERVATION_TTL_MINUTES` | `30` (tiempo para pagar antes de liberar el stock) |
| `TRANSFER_RESERVATION_MINUTES` | Opcional: plazo propio para transferencias (p. ej. `1440` = 24 h); sin definir usa el anterior |
| `PAYMENT_SIMULATION` | `off` (en producción no tiene efecto aunque esté `on`) |
| `UPLOAD_DIR` | Ruta de un volumen persistente, p. ej. `/data/uploads` |

No van en producción: `DATABASE_URL_TEST`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. Las credenciales de pago se agregan en la FASE 7. Nunca subir `.env` al repositorio.

## 6. Pasos de la primera puesta en marcha

1. **Dominio**: registrar el `.cl` en NIC Chile y apuntar el DNS (registro A/AAAA) al servidor o al PaaS.
2. **Servidor y base**: crear PostgreSQL 16 con usuario y contraseña propios; habilitar respaldos.
3. **Código**: clonar el repositorio en la rama `main`, `npm ci`, crear las variables de §5.
4. **Base de datos**:
   ```bash
   npm run db:migrate      # crea las tablas
   npm run db:reference    # 16 regiones y 346 comunas
   ```
   Crear el Super Admin (comando de §4.2).
   Programar las tareas de pedidos y pagos (vencimiento + reconciliación), p. ej. cron cada minuto:
   ```bash
   npm run jobs
   ```
5. **Compilar y arrancar**: `npm run build` y `npm run start` (o la imagen Docker). Detrás de Caddy/PaaS con HTTPS.
6. **Cargar el negocio desde el panel**: tarifas de despacho, categorías, marcas, atributos, productos con fotos y stock inicial (cada ingreso queda como movimiento de inventario).
7. **Prueba completa** con un pedido real de bajo monto (cuando existan los pagos): pagar, ver el pedido pagado en el panel, stock descontado, boleta emitida.
8. **Abrir al público**.

## 7. Operación diaria

- **Respaldos**: `pg_dump` diario (o el respaldo del PaaS) + copia de `UPLOAD_DIR`. Probar una restauración al menos una vez antes de abrir.
- **Actualizaciones**: cada versión = `git pull` → `npm ci` → `npm run db:migrate` → `npm run build` → reiniciar. Las migraciones nunca se editan, solo se agregan.
- **Monitoreo**: revisar los logs del proceso (errores y el aviso "Error al vencer pedidos"); agregar un servicio de errores (p. ej. Sentry) y un chequeo de disponibilidad del sitio.
- **Pedidos pendientes y stock**: el panel muestra pendientes de pago, por preparar y variantes bajo el mínimo.
- **Usuarios del panel**: un usuario por persona, con el rol mínimo (Ventas, Bodega, Administrador); desactivar a quien deja la empresa.
