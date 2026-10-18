# Lanzamiento: lo que tiene que hacer el negocio

Lista práctica para empezar a vender y a aparecer en Google, Maps y redes. El código ya está listo para cada punto. Lo que falta son datos, cuentas y trámites que solo puede hacer el dueño del negocio. Detalle técnico del servidor: `DESPLIEGUE.md`. Pagos: `PAGOS.md`.

Regla de oro: **nombre, dirección y teléfono idénticos en todas partes** (tienda, Google, Instagram, Facebook, WhatsApp). Google compara estos datos para confiar en el negocio.

## 1. Antes de cargar el catálogo (mañana)

- [ ] **Nombre definitivo de la tienda.** Hoy dice «Tienda». Se cambia en `/admin/tienda` y se usa en el logo, las pestañas, los correos y la imagen al compartir.
- [ ] **Fotos de producto:** cuadradas, de 1200 px o más, con fondo blanco y el producto centrado. Una foto principal limpia, sin texto encima. Pueden ir más fotos (uso, tamaño, reverso). Google Shopping y el catálogo de Meta rechazan productos sin foto.
  - **Nombra cada archivo con el SKU o el código de barras** (`DET-500.jpg`, `7801234567890.jpg`; la segunda foto `DET-500-2.jpg`) y súbelas todas juntas, o la carpeta completa, en `/admin/productos/fotos`. Se asocian solas, se reducen si son pesadas y se les quita la ubicación del celular. La misma página lista los productos que aún no tienen foto.
  - Orden recomendado: 1) importar el Excel, 2) subir las fotos, 3) revisar «Productos sin foto», 4) publicar.
- [ ] **Precios finales con IVA, en pesos enteros.** Quedan 3 precios con decimales, 1 de $12 y stocks faltantes o negativos en el Excel (ver `CLAUDE.md`, «Catálogo real»).
- [ ] **Códigos de barras (EAN-13)** de los productos que lo tengan. Con un código real, Google y Meta identifican mejor el producto. 9 códigos largos esperan confirmación.
- [ ] **Categorías y marcas** reales. Hoy son de demostración.
- [ ] **Stock real** por variante, contado en bodega. Se carga en `/admin/inventario` (o con la importación, opción de stock inicial).

## 2. Datos que se cargan en el panel

- [ ] `/admin/tienda` → **Identidad**: nombre y descripción de 1 o 2 frases (sale en Google y al compartir).
- [ ] `/admin/tienda` → **Contacto**: correo, WhatsApp (celular), horario.
- [ ] `/admin/tienda` → **Local físico**: dirección, comuna, región y el enlace de Google Maps (en Maps: tu local → Compartir → Copiar vínculo). Marca **«Ofrecer retiro en el local»** si los clientes pueden retirar sin costo.
- [ ] `/admin/tienda` → **Redes sociales**: los enlaces de Instagram, Facebook y TikTok cuando existan.
- [ ] `/admin/tienda` → **Avisos de pedidos**: el correo que recibe cada pedido nuevo.
- [ ] `/admin/despacho`: **tarifas y plazos reales** por región. Hoy son DE PRUEBA. Una región sin tarifa no ofrece despacho.
- [ ] `/admin/pagos/configuracion`: la **cuenta bancaria real** para transferencias.
- [ ] `/admin/paginas`: los textos de ayuda, despacho, cambios y devoluciones, términos y privacidad (ver §5).
- [ ] `/admin/promociones`: **cupón de apertura** (p. ej. `BIENVENIDA10`, 10 %, uno por cliente, con fecha de término) y, si conviene, **despacho gratis desde un monto** (se avisa en la franja superior y en el carrito: «Te faltan $X»). Revisar el margen antes: el despacho gratis aplica a todas las regiones.
- [ ] `/admin/cuenta`: **activar la verificación en dos pasos** en cada cuenta de administrador (app Google Authenticator o similar). El inicio del panel lo recuerda mientras no esté activa.

Con la dirección cargada, la tienda muestra sola: la franja «Visítanos» en la portada, el local en el pie y en Contacto, «Cómo llegar» con Google Maps, el botón fijo de WhatsApp, «Retiro gratis en tienda» arriba y los datos del local para Google.

## 3. Presencia: Google y Maps

1. [ ] **Perfil de Empresa en Google** (business.google.com) con la cuenta de Google del negocio, no una personal.
   - Categoría principal precisa (por ejemplo «Tienda de artículos de limpieza» o «Droguería», la que mejor describa el local).
   - Dirección exacta y pin bien ubicado, horario (y horarios especiales en feriados), teléfono, sitio web = el dominio de la tienda.
   - **Verificación**: Google pide un video del local (fachada, letrero, interior y algo que pruebe que es tuyo) o una carta. Tenerlo listo.
   - Fotos: fachada de día, interior, góndolas, logo y portada. Subir fotos nuevas cada mes.
   - Copiar el enlace **«Pedir reseñas»** del perfil y pegarlo en `/admin/tienda` → Local físico: la tienda lo envía sola a cada cliente cuando su pedido se marca como entregado o retirado.
   - Productos destacados y publicaciones semanales (ofertas, novedades).
2. [ ] **Reseñas**: pedirlas a los primeros clientes. Imprimir un QR con el enlace «Pedir reseñas» del perfil y ponerlo en caja. Responder todas, también las malas, con calma.
3. [ ] **Google Search Console**: verificar el dominio y enviar `https://tu-dominio.cl/sitemap.xml`.
4. [ ] **Google Merchant Center**: fuente de datos programada con `https://tu-dominio.cl/feed/productos.xml`. Activar las «fichas gratuitas» (Google Shopping sin pagar). Se puede vincular con el Perfil de Empresa para mostrar «En stock en la tienda cercana».
5. [ ] **Apple Maps** (Apple Business Connect) y **Waze** (Waze Ads, perfil gratis): los mismos datos.

## 4. Presencia: redes sociales y WhatsApp

1. [ ] **Instagram** profesional (cuenta de empresa), mismo nombre de usuario en todas las redes si está libre. Biografía: qué vendes, «Despacho a todo Chile y retiro en [comuna]», enlace a la tienda.
2. [ ] **Facebook**: página del negocio con la misma dirección y horario. Conectarla con Instagram en el **Meta Business Suite**.
3. [ ] **Catálogo de Meta** (Commerce Manager): fuente de datos = la misma URL del feed. Permite etiquetar productos en publicaciones de Instagram y Facebook.
4. [ ] **TikTok** (opcional, recomendado para limpieza y orden: videos de «antes y después», trucos de aseo).
5. [ ] **WhatsApp Business** en el celular del negocio: perfil de empresa con dirección, horario, catálogo y respuestas rápidas. El número se carga en `/admin/tienda`.
6. [ ] Pegar los enlaces de los perfiles en `/admin/tienda` → Redes sociales.
7. [ ] Material para el local: QR a la tienda online y a Instagram, cartel «Compra online y retira aquí».

## 5. Bloqueantes legales y tributarios (antes de cobrar a público)

- [ ] **Boleta electrónica (SII)**: contratar un proveedor con API (por ejemplo los de facturación electrónica que integran e-commerce). Cada venta online debe emitir boleta.
- [ ] **Textos legales revisados por un abogado**: términos y condiciones, derecho a retracto de 10 días y garantía legal (Ley 19.496 del consumidor), privacidad y datos personales (Ley 19.628 y Ley 21.719, vigente desde diciembre de 2026). Se publican en `/admin/paginas`.
- [ ] **Patente municipal y giro** que cubran venta online y despacho.
- [ ] **Medicamentos y suplementos**: quedan fuera del catálogo (requieren autorización sanitaria).

## 6. Cobros con tarjeta (Mercado Pago)

- [ ] Cuenta de **Mercado Pago empresa** a nombre del negocio (RUT de la empresa).
- [ ] Credenciales **de prueba** primero: probar el flujo completo en sandbox siguiendo `PAGOS.md` §10 (necesita una URL HTTPS pública, ngrok o similar).
- [ ] Recién después, las credenciales de producción en el servidor (`.env.production`). No se activan cobros reales sin esa prueba.
- [ ] Webpay Plus (Transbank) es opcional: más trámites, pero es el medio que más usan los chilenos.

## 7. Dominio, servidor y correo

- [ ] **Dominio `.cl`** en NIC Chile (a nombre del negocio).
- [ ] **Servidor** (VPS con Docker) siguiendo `DESPLIEGUE.md` §6. HTTPS automático con Caddy.
- [ ] **Correo con el dominio** (por ejemplo contacto@tu-dominio.cl) y **Resend** para los correos de pedidos, con SPF, DKIM y DMARC en el DNS. Sin esto, los correos llegan a spam.
- [ ] **Respaldos**: ya son automáticos (servicio `respaldos`, diario, 14 días). Falta **copiarlos fuera del servidor** (rsync o rclone a Drive/S3) y hacer una restauración de prueba (`DESPLIEGUE.md` §7).
- [ ] **Super Admin real** con `npm run admin:create` y contraseña larga. Cuentas separadas por persona.

## 8. Medición (después de abrir)

- [ ] Google Analytics 4 y el píxel de Meta: **ya integrados**. Crear las cuentas, copiar los IDs a `GA_ID` (G-…) y `META_PIXEL_ID` en `.env.production` y recompilar (`up -d --build`). La tienda muestra el aviso de cookies y solo mide a quien acepta; envía «agregar al carrito» y «compra» con el SKU, el mismo id del catálogo de Google y Meta (sirve para campañas de catálogo y remarketing).
- [ ] Revisar cada semana: pedidos y ventas en `/admin/reportes`, búsquedas en Search Console, vistas y llamadas en el Perfil de Empresa.

## 9. Primer mes: generar movimiento

- Lanzamiento con oferta de apertura (en el local y online) y un pack de limpieza armado con productos reales.
- Retiro gratis en el local como gancho para la zona; despacho con tarifa clara por región.
- Publicar 3 a 4 veces por semana: productos, trucos de limpieza, el local y el equipo.
- Pedir reseñas a cada cliente del local y online (el correo de «pedido entregado/retirado» es buen momento).
- Responder WhatsApp e Instagram rápido: es lo que más convierte en tiendas de barrio.
