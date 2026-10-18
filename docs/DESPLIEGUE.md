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

## 4. Endurecimiento (FASE 8)

Hecho:
- ✅ **Primer Super Admin**: `npm run admin:create -- correo@dominio.cl` (pide la contraseña sin mostrarla).
- ✅ **Cabeceras de seguridad** (`next.config.ts`): Content-Security-Policy (solo recursos propios, sin frames ni formularios hacia otros sitios), HSTS, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Al sumar una pasarela, analytics o píxeles de redes hay que agregar sus dominios a la CSP.
- ✅ **IP real detrás del proxy**: `TRUSTED_PROXY_HOPS` (por omisión 1 en producción). Lo usan el límite de ingreso al panel, el de pedidos y el de webhooks.
- ✅ **Límite de pedidos pendientes**: máximo 3 esperando pago por email y 10 pedidos cada 15 minutos por conexión.
- ✅ **Correos al cliente** (pedido recibido con las instrucciones de pago, pago confirmado, despachado): cola en la base, enviada por `npm run jobs`. Proveedor: Resend (`RESEND_API_KEY`, `MAIL_FROM`); sin clave, en local se muestran en la consola y en producción esperan en cola.
- ✅ **SEO de producción**: 404 reales, JSON-LD (tienda, buscador, producto, migas), imagen para compartir y feed de productos (§8).
- ✅ **Imagen Docker** (`Dockerfile`, `docker-compose.prod.yml`, `Caddyfile`, `.env.production.example`; §6). El CI la compila en cada PR.
- ✅ **Redirecciones permanentes**: al cambiar el slug de un producto, categoría o marca, la dirección anterior responde 308 hacia la nueva (con sus parámetros). Tabla `slug_redirects`.

Pendiente:
1. **Imágenes en S3** (solo si la plataforma no tiene disco persistente): implementar el adaptador en la interfaz `saveImage/readImage/deleteImageFile` de `src/lib/storage.ts`, que ya está preparada. El `docker-compose.yml` sin sufijo sigue siendo **solo de desarrollo** (usuario y clave `tienda`).

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
| `TRUSTED_PROXY_HOPS` | Proxies propios delante de la app (Caddy o el del hosting). Por omisión `1` en producción |
| `MAIL_FROM` | Remitente verificado en el proveedor, p. ej. `Tienda <pedidos@tu-dominio.cl>` |
| `RESEND_API_KEY` | Clave de Resend (secreta). Sin ella los correos quedan en cola |

No van en producción: `DATABASE_URL_TEST`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`. Las credenciales de pago se agregan en la FASE 7. Nunca subir `.env` al repositorio.

## 6. Pasos de la primera puesta en marcha

### A. Servidor propio (VPS) con Docker — recomendado para partir

Archivos listos en el repositorio: `Dockerfile`, `docker-compose.prod.yml` (tienda + PostgreSQL privado + tareas cada minuto + Caddy con HTTPS automático), `Caddyfile` y `.env.production.example`. Probado de punta a punta en local con HTTPS.

1. **Dominio**: registrar el `.cl` en NIC Chile y apuntar el DNS (registro A/AAAA) a la IP del servidor.
2. **Servidor**: Linux con Docker (2 vCPU / 4 GB alcanzan), con los puertos 80 y 443 abiertos.
3. **Código y variables**:
   ```bash
   git clone https://github.com/cristobla/Tienda-online.git && cd Tienda-online
   cp .env.production.example .env.production
   ```
   Editar `.env.production`: dominio, `APP_URL`, una contraseña larga para la base (`openssl rand -hex 24`), remitente y clave de correo.
4. **Levantar**: compila la imagen, aplica las migraciones al arrancar y obtiene el certificado HTTPS:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```
5. **Datos iniciales y primer admin** (una sola vez):
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app npm run db:reference
   docker compose --env-file .env.production -f docker-compose.prod.yml run --rm app npm run admin:create -- correo@tu-dominio.cl
   ```
6. **Cargar el negocio desde el panel**: cuenta para transferencias, tarifas de despacho, categorías, marcas, productos con fotos y stock inicial (por el importador de Excel o a mano).
7. **Prueba completa** con un pedido real de bajo monto: transferir, confirmar en `/admin/pagos`, ver el stock descontado, el correo recibido y emitir la boleta.
8. **Abrir al público** y conectar buscadores y redes (§8).

### B. Plataforma administrada (Railway, Render, Fly.io)

- Servicio web desde el `Dockerfile` del repositorio (puerto 3000), con las variables de §5 (`TRUSTED_PROXY_HOPS=1`).
- PostgreSQL 16 administrado → su URL en `DATABASE_URL`.
- Volumen persistente montado en `/data/uploads` con `UPLOAD_DIR=/data/uploads`. Sin disco persistente, implementar el adaptador S3 (§4).
- Tarea programada cada 1 a 5 minutos con el comando `npm run jobs` (la app también las corre cada minuto mientras está encendida).
- Una sola vez, desde la consola de la plataforma: `npm run db:reference` y `npm run admin:create -- correo@tu-dominio.cl`. Las migraciones se aplican solas al arrancar.

## 7. Operación diaria

- **Respaldos**: `pg_dump` diario (o el respaldo del PaaS) + copia de las fotos. Con Docker, p. ej. un cron diario:
  ```bash
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db pg_dump -U tienda tienda | gzip > respaldo-$(date +%F).sql.gz
  ```
  y el volumen `uploads`. Guardar las copias fuera del servidor y probar una restauración al menos una vez antes de abrir.
- **Actualizaciones**: con Docker, `git pull` y el mismo `up -d --build` de §6 (las migraciones se aplican solas al arrancar). Sin Docker: `git pull` → `npm ci` → `npm run db:migrate` → `npm run build` → reiniciar. Las migraciones nunca se editan, solo se agregan.
- **Monitoreo**: `docker compose … logs -f app jobs` (errores y el aviso "Error en las tareas de pedidos y pagos"); agregar un servicio de errores (p. ej. Sentry) y un chequeo de disponibilidad del sitio.
- **Pedidos pendientes y stock**: el panel muestra pendientes de pago, por preparar y variantes bajo el mínimo.
- **Usuarios del panel**: un usuario por persona, con el rol mínimo (Ventas, Bodega, Administrador); desactivar a quien deja la empresa.

## 8. Buscadores y redes (después de publicar)

La tienda ya entrega lo que estas plataformas leen. Estas son las conexiones, en orden:

1. **Datos de la marca**: en `src/lib/site.ts`, el nombre, el email, el horario y las URL de los perfiles (`social`: Instagram, Facebook, TikTok). Aparecen en el pie, en la imagen al compartir y en los datos para Google (`sameAs`).
2. **Google Search Console**: verificar el dominio (registro DNS TXT, sin tocar el código) y enviar `https://tu-dominio.cl/sitemap.xml`. Revisar «Resultados enriquecidos»: cada producto declara precio, stock, marca, GTIN y migas.
3. **Google Merchant Center** (Google Shopping y las fichas gratuitas): fuente de datos programada → `https://tu-dominio.cl/feed/productos.xml` (diaria). Solo entran los productos publicados **con foto**; con un código de barras real (EAN-13 válido) se identifican mejor.
4. **Meta Commerce Manager** (catálogo de Instagram y Facebook Shops): catálogo → fuente de datos → la misma URL del feed, programada.
5. **Perfil de empresa en Google** (Maps): con la dirección o la zona de despacho del negocio.
6. **Medición** (Google Analytics, píxel de Meta): necesitan su ID y agregar sus dominios a la CSP de `next.config.ts`. Revisar el consentimiento según la Ley 21.719.

Fotos: cuadradas, de 1200 px o más y con fondo blanco. Las usan la ficha, Google Shopping, el catálogo de Meta y la vista previa al compartir un producto.
