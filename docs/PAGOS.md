# Pagos (Fase 7 — base + transferencia bancaria)

Estado: **operativo en local** con transferencia bancaria (confirmación en el panel) y un proveedor simulado para pruebas.
**Pasarelas online (Webpay Plus, Mercado Pago, Khipu): pendientes**, registradas pero deshabilitadas. Nada de esto está desplegado.

## 1. Arquitectura

```
checkout / página del pedido / panel / rutas externas      (validan, autorizan, llaman al servicio)
            │
            ▼
src/modules/payments/index.ts  ← PaymentService: intentos, transiciones, eventos, confirmación del pedido
            │        ▲
            │        └── src/modules/payments/providers.ts  ← contrato PaymentProvider + adaptadores
            ▼
modules/orders (markOrderPaid, cancelar)  ·  modules/inventory (consumir/reservar)  ·  audit
```

- **Un solo flujo confirma pedidos:** `applyResult(tx, paymentId, resultadoVerificado, actor)`. Lo usan igual la confirmación de transferencia del admin y las pasarelas (retorno, webhook, consulta). Bloquea primero el pedido y después el intento: es el mismo orden que el vencimiento, así no hay *deadlocks*.
- **Los adaptadores solo hablan con su proveedor** y normalizan lo que responde. Nunca escriben el pedido, el pago ni el stock.
- **No hay condiciones «si es Webpay»** en carrito, pedidos ni inventario. Agregar un proveedor es escribir su adaptador, su configuración, la verificación y las pruebas.

### Contrato `PaymentProvider` (contract.ts; registro en providers.ts)

| Miembro | Para qué |
|---|---|
| `implemented`, `testOnly`, `capabilities` | Registro: qué existe y qué sabe hacer. Capacidades: `verify`, `browserReturn`, `webhook`, `manualConfirmation`, `refund`, `remoteCancel` |
| `configure(settings, appEnv)` | Configuración efectiva: datos no secretos desde la base y credenciales desde el entorno. Si falta algo, dice qué falta |
| `reservationMinutes()` | Plazo de reserva del pedido con este método |
| `start(intento, ctx)` | Inicia el intento **ya persistido**. Devuelve una acción tipada: `instructions`, `redirect` (GET o POST con campos) o `wait`. Puede devolver `externalId` |
| `verify?(intento, ctx)` | Consulta autorizada del estado real. Lanza `ProviderTimeoutError` si no hay respuesta confiable (resultado **incierto**) |
| `parseReturn?(req)` | Del retorno del navegador saca **solo** un valor no adivinable que identifica el intento. No decide el resultado |
| `parseWebhook?(req, ctx)` | Valida la autenticidad según el protocolo del proveedor y extrae el id del evento y del intento: `externalId` (lo guardado al iniciar) o `reference` (la referencia interna, si el proveedor solo la conoce así). Lanza `ProviderTimeoutError` si tuvo que consultar al proveedor y no respondió (la ruta responde 503 y el proveedor reenvía) |
| `refund?(intento, ctx, clave)` | Reembolso **total** de lo cobrado en el intento, idempotente con la clave (`refund-<referencia>`). Devuelve `REFUNDED` o `PENDING` (en proceso); sin respuesta, `ProviderTimeoutError` |

La cancelación remota queda como capacidad. La transferencia manual no finge tener una API bancaria: se devuelve desde el banco y se registra en el pago.

### Registro: implementado / configurado / habilitado

`methodStates()` calcula las tres cosas por separado. Al cliente solo se le ofrece lo que cumple las tres.

- El interruptor del panel **solo apaga**. Un método pendiente no se vuelve operativo con un interruptor ni con credenciales: `setMethodEnabled` lo rechaza.
- Si un método se deshabilita, deja de ofrecerse para pagos nuevos, pero los intentos en curso se siguen verificando.

## 2. Datos (migración `0005_pagos`)

- **`payments` = intento de pago** (un pedido puede tener varios).
  - Identificación: `attempt`, `reference` (`ORD-001234-2`, única y corta; es también la clave de idempotencia ante el proveedor).
  - Contexto: `provider`, `environment`, `account`.
  - Referencia externa: `provider_reference` (siempre texto).
  - Montos: `amount` (total del pedido congelado), `currency`.
  - Estado y acción: `status`, `checkout` (la acción congelada: la cuenta que vio el cliente queda en el intento), `raw` (último resultado, sin secretos).
  - Dinero y verificación: `received_amount`, `received_at`, `verified_at`, `verified_by`.
  - Otros: `expires_at`, `incident`, `last_error`.
  - Restricciones:
    - `payments_external_ref`: única por (proveedor, ambiente, cuenta, referencia externa). Una operación bancaria no se aplica a dos pagos.
    - `payments_one_pending`: un solo intento `PENDING` por pedido y método.
    - `payments_order_attempt`: el número de intento es único dentro del pedido.
- **`payment_events`**
  - Campos: `source` (webhook / return / admin), `event_id` (opcional), `payment_id`, `reference`, `payload` (sin secretos), `status` (RECEIVED / PROCESSED / FAILED / IGNORED), `tries`, `last_error`, `processed_at`.
  - Única por (proveedor, `event_id`): deduplica eventos y comandos del admin.
- **`payment_methods`:** interruptor y configuración **no secreta** (la cuenta para transferencias). Las credenciales nunca van aquí.
- **`inventory_movements`:** el índice `movements_one_sale_per_order_line` impide una segunda venta del mismo pedido y producto.

## 3. Estados

Son tres cosas distintas:

| | Dónde | Valores |
|---|---|---|
| Estado del **intento** | `payments.status` | PENDING, AUTHORIZED, UNCERTAIN, PAID, FAILED, CANCELLED, EXPIRED, REVIEW, REFUNDED, PARTIALLY_REFUNDED |
| **Dinero recibido** | `payments.received_amount/received_at` | Lo verificado como recibido (en PAID y REVIEW) |
| Estado del **pedido** | `orders.status` + resumen `orders.payment_status` | PENDING_PAYMENT → PAID → …; el resumen indica PENDING / PAID / REVIEW / EXPIRED / CANCELLED / REFUNDED |

Los dos valores nuevos del enum:
- **`UNCERTAIN`:** timeout o error de red. No es un rechazo. Se resuelve consultando al proveedor y nunca se repite el cobro a ciegas.
- **`REVIEW`:** hay dinero que no confirma el pedido (monto distinto, pago tardío sin stock, pago duplicado o pago sobre un pedido cancelado). Queda la revisión o el reembolso pendiente.

Transiciones del intento (`ATTEMPT_TRANSITIONS`):

| Desde | Puede pasar a |
|---|---|
| PENDING | AUTHORIZED, PAID, FAILED, CANCELLED, EXPIRED, UNCERTAIN, REVIEW |
| AUTHORIZED | PAID, FAILED, CANCELLED, EXPIRED, UNCERTAIN, REVIEW |
| UNCERTAIN | AUTHORIZED, PAID, FAILED, CANCELLED, EXPIRED, REVIEW |
| FAILED, CANCELLED, EXPIRED | PAID, REVIEW (el dinero llegó igual: cerrar el checkout no prueba que no se cobró) |
| PAID | REFUNDED, PARTIALLY_REFUNDED |
| REVIEW | REFUNDED (devuelto fuera del sistema, con nota) |
| REFUNDED | — |

- Un pago verificado **nunca retrocede** a rechazado por un evento viejo o fuera de orden: queda IGNORED con su motivo.
- Una devolución no borra el pago.

## 4. Flujos

**Checkout (`placeOrder`).** El pedido, la reserva y el intento se crean en una sola transacción (`createOrderFromCart(..., { within })`).
- Un doble envío no crea nada más, porque el carrito queda bloqueado y luego se borra.
- Después, fuera de la transacción, `beginAttempt` pide la acción al proveedor. Si se cae entre medio, la página del pedido la completa.

**Reintento o cambio de medio (`startPayment`).**
- Un doble clic devuelve el mismo intento abierto.
- Tras un rechazo se crea otro intento sobre el mismo pedido, con la misma reserva y el mismo plazo (no se extiende).
- Con un resultado incierto o un pago en revisión no se ofrece pagar de nuevo.

**Transferencia:**
1. El cliente ve banco, titular, RUT, tipo y n.º de cuenta, email, monto exacto, el n.º de pedido como referencia y el plazo real.
2. En `/admin/pagos/[id]`, un usuario con `payments:manage` registra el monto, la fecha, el n.º de operación y una nota, después de ver el dinero en la cuenta. Hay una confirmación del navegador antes de aplicar.
3. Si el monto coincide, el pedido queda pagado y la reserva se convierte en venta. Si no coincide, queda como incidencia y el total no se toca.
4. Un doble clic o dos administradores a la vez producen una sola venta. La misma operación bancaria no se aplica a dos pedidos.

**Pasarelas (contrato listo; probado con el simulador):**
- **Retorno** `GET|POST /api/payments/[proveedor]/return`: guarda el evento, consulta al proveedor (`verify`) y aplica. Redirige a `APP_URL/pedido/[id]`, armado desde el intento encontrado y nunca desde el Host ni de un `returnUrl`.
- **Webhook** `POST /api/payments/[proveedor]/webhook`: tiene límite de tamaño y de tipo, y bloqueo por IP ante entradas inválidas repetidas.
  - Guarda primero, luego verifica y aplica.
  - Responde 200 cuando quedó aplicado y 500 si falló; el evento queda guardado y el proveedor reintenta.
  - Un evento que falló no queda bloqueado por la deduplicación.
- Los pendientes, deshabilitados o sin configuración responden **404**: ni aceptan nada ni devuelven un ejemplo aprobado.
- Un `?status=approved`, un token falso o un «ya transferí» nunca aprueban. La pantalla solo dice «Pago confirmado» si el servidor lo verificó.

**Vencimiento y pagos tardíos:**
- `expireOrders` cancela los pedidos impagos con reserva vencida, libera el stock y deja sus intentos `PENDING` como `EXPIRED`.
- La confirmación compara el vencimiento con el reloj de la base, aunque el job no haya corrido.
- Pago verificado con la reserva vencida:
  - Se intenta reservar de nuevo **todo**. Si hay stock, se vende y el pedido queda pagado (también si el job ya lo había cancelado por vencimiento).
  - Si no hay stock, queda **REVIEW** con el dinero registrado: sin sobreventa, sin venta parcial y sin confirmación falsa.
- Un pedido cancelado **expresamente** no se reabre: el dinero tardío queda como incidencia.
- Una falla de un intento no libera la reserva que usa otro intento vigente. Solo liberan el vencimiento y la cancelación.

**Jobs:**
- `npm run jobs` (`scripts/jobs.ts`) corre `runPaymentJobs()`: vence pedidos y reconcilia pagos.
- La reconciliación reprocesa los eventos RECEIVED o FAILED (máximo 10 intentos cada uno) y consulta los intentos abiertos de los últimos 3 días y los cerrados localmente en las últimas 2 horas. Toma como máximo 50 por corrida.
- En el servidor también corre cada minuto (`src/instrumentation.ts`), pero nada depende de eso. En producción, programar `npm run jobs` con cron o el scheduler del hosting, cada 1 a 5 minutos.
- La red y PostgreSQL nunca comparten una transacción: el intento se persiste antes de llamar al proveedor, y no se mantiene stock bloqueado mientras se espera la red.

## 5. Permisos y auditoría

- **`orders:read`:** ver `/admin/pagos` y el detalle de cada pago.
- **`payments:manage`** (Administrador y Super Admin): confirmar transferencias, resolver incidencias y configurar medios de pago. Ventas y Bodega no lo tienen.
- **Auditoría:** `payment.result` (cada transición, con su origen), `payment.confirm_transfer`, `payment.resolve`, `payment.settings` y `payment.method`. Se filtran en Auditoría → Pagos.
- **Cliente:** ve y paga su pedido solo con el enlace secreto (`/pedido/[uuid]`); el número de pedido no basta. Su vista (`customerPayments`) no incluye cuenta interna, referencias externas, respuestas del proveedor ni notas.

## 6. Configuración

| Variable | Local | Integración / sandbox | Producción |
|---|---|---|---|
| `APP_ENV` | `local` | `integration` | `production` (es el valor por omisión si `NODE_ENV=production`) |
| `APP_URL` | `http://localhost:3000` | URL HTTPS pública del ambiente | `https://dominio.cl` (se exige https) |
| `PAYMENT_SIMULATION` | `on` para probar | `off` | `off` (aunque esté `on`, no tiene efecto) |
| `RESERVATION_TTL_MINUTES` | 30 | 30 | 30 (por omisión) |
| `TRANSFER_RESERVATION_MINUTES` | opcional | opcional | opcional (5 a 4320; por omisión, el plazo general) |
| `MERCADOPAGO_ACCESS_TOKEN` | opcional (sandbox) | credencial de prueba | credencial de producción (`APP_USR-…`; se rechaza `TEST-…`) |
| `MERCADOPAGO_WEBHOOK_SECRET` | con el token | clave del webhook de la app de prueba | clave del webhook de producción |

- La cuenta para transferencias se configura en `/admin/pagos/configuracion` y es **no secreta**.
- En local y test, mientras no se complete, se muestran **datos de ejemplo rotulados**. En integración y producción el método no se ofrece hasta tener una cuenta válida.
- Las credenciales de pasarelas se agregan como variables del servidor al implementar cada adaptador (nunca `NEXT_PUBLIC_`, nunca en `payment_methods`). No hay formulario de tarjeta propio: sin PAN ni CVV.

## 7. Pruebas

`tests/payments.test.ts` (26 pruebas, PostgreSQL real) cubre:
- **Métodos:** métodos ofrecidos y pendientes no habilitables; producción sin simulación (servicio y rutas) y sin cuenta.
- **Checkout:** instrucciones congeladas; intento creado con el pedido; total manipulado; doble envío; reintento sin reservar de nuevo; vista segura del cliente.
- **Transferencia:** confirmación exacta (venta, reservas, auditoría); monto distinto y su resolución; operación bancaria reutilizada; doble clic y dos administradores; permisos; transferencia frente a pasarela; cancelación y dinero tardío; rollback técnico.
- **Vencimiento:** reserva vencida sin job; pedido vencido con y sin stock; confirmación frente a vencimiento concurrente; un fallo con otro intento vigente.
- **Simulador:** el retorno no aprueba sin consulta; token falso; webhook duplicado y fuera de orden; timeout → incierto → reconciliado; falla entre la verificación y la escritura; reinicio antes de procesar; dos intentos aprobados; secretos redactados.

`tests/mercadopago.test.ts` (13) prueba el adaptador de Mercado Pago contra la API simulada con `fetch`: preferencia, reintento, URL ajena, consulta y estados, ambientes, timeouts, retorno, firma `x-signature`, notificaciones y reembolsos. Las respuestas siguen la **forma documentada** por Mercado Pago; **no son grabaciones del sandbox**.

`tests/refunds.test.ts` (7) cubre `refundOrder` contra la base real: anular antes del despacho (stock de vuelta y reembolso por API con el simulado), devolución después del despacho con y sin reingreso, transferencia (reembolso manual), proveedor que no responde y reintento sin doble reembolso, doble envío, permisos y Mercado Pago sin credenciales (404).

Las pruebas de retorno y webhook del servicio son del **contrato** y del **simulador**: ningún flujo se probó todavía contra el sandbox real de Mercado Pago ni de Webpay.

## 8. Límites actuales

- Mercado Pago está implementado pero **sin probar contra su sandbox real** (ver §10). Webpay y Khipu siguen pendientes. No hay pagos parciales ni combinados, reembolsos parciales, subida de comprobantes, DTE ni conciliación contable.
- Una transferencia se reembolsa a mano (desde el banco) y se registra en el pago. Un contracargo o reembolso hecho desde el panel de Mercado Pago sobre un pedido ya confirmado no se detecta solo: se ve en la consulta del pago y se registra a mano.
- Un reembolso «en proceso» o sin respuesta se confirma reintentando desde el pago (la misma clave no devuelve dos veces); la reconciliación automática no reintenta reembolsos.
- El simulador guarda su estado en la memoria del servidor. `npm run jobs` (otro proceso) o un reinicio no lo ven, y sus consultas quedan como inciertas.
- El temporizador del servidor y el límite de webhooks por IP viven en memoria de un proceso (marcados con `ponytail:`).
- Un intento abierto con más de 3 días sin resolver ya no se consulta solo: aparece en el filtro «Por verificar» del panel.

## 9. Agregar el primer adaptador real (p. ej. Webpay Plus)

No basta con pegar una API key. Pasos:

1. **Elegir el producto y el SDK vigentes** y leer la documentación oficial:
   - Transbank (Webpay Plus): https://www.transbankdevelopers.cl/documentacion/webpay-plus
   - SDK de Node: https://github.com/TransbankDevelopers/transbank-sdk-nodejs
   - Ejemplo oficial: https://proyecto-ejemplo-node.transbankdevelopers.cl/api-reference/webpay-plus
   - Mercado Pago Checkout Pro: https://www.mercadopago.cl/developers/es/docs/checkout-pro/overview
   - Khipu: https://docs.khipu.com/
   - Seguridad (OWASP): https://cheatsheetseries.owasp.org/cheatsheets/Third_Party_Payment_Gateway_Integration_Cheat_Sheet.html
2. **Implementar el adaptador** en `providers.ts`, reemplazando su `pending(...)`.
   - `configure`: credenciales por ambiente desde `env` (agregarlas al esquema Zod de `src/lib/env.ts`, sin `NEXT_PUBLIC_`). Devuelve `environment` (integration/production) y `account` (código de comercio).
   - `start`: en Webpay, `create` con `buy_order` = `reference` (≤ 26 caracteres, ya cumple), `session_id`, `amount` y `return_url = APP_URL/api/payments/webpay/return`. Devuelve `redirect` **POST** a `url` con `token_ws`, y `externalId = token`.
   - `parseReturn`: solo extrae `token_ws` (o `TBK_TOKEN` en abortos) y su forma. Recibir el token no es una aprobación.
   - `verify`: `commit` la primera vez y `status` después. Mapear AUTHORIZED, FAILED, abortos, timeout y retornos incompletos según el protocolo oficial. Validar monto, `buy_order`, comercio y ambiente. Un timeout lanza `ProviderTimeoutError`.
   - Webpay no tiene webhook: `webhook: false`. Mercado Pago sí: validar su firma y consultar el pago real con su API. Verificar la cuenta receptora y el modo de prueba o producción; Checkout Pro, otras APIs e IPN no son intercambiables.
   - Si el retorno del proveedor no trae un valor no adivinable, redirigir a una página genérica en vez de revelar el enlace del pedido.
3. **Probar contra el ambiente de integración** con `APP_ENV=integration` y una URL pública HTTPS (las pruebas de retorno lo exigen), usando las tarjetas y montos de prueba oficiales. Agregar pruebas del adaptador con respuestas grabadas del sandbox: aprobado, rechazado, abortado, timeout, retorno repetido.
4. **Programar `npm run jobs`** en el servidor y revisar que la reconciliación resuelva los intentos inciertos.
5. **Validar** concurrencia, recuperación (reinicio a mitad del flujo) y que un pendiente o deshabilitado siga respondiendo 404.
6. **Permitir su dominio en la CSP** de `next.config.ts` (`form-action`, y `connect-src`/`script-src` si usa un script propio), porque hoy solo se permiten formularios hacia la propia tienda.
7. **Recién entonces** marcar `implemented: true`, cargar las credenciales de producción en el servidor y habilitar el método desde el panel.

## 10. Mercado Pago (Checkout Pro) — `src/modules/payments/mercadopago.ts`

**Flujo.**
1. `start` crea una preferencia: un ítem por el total en CLP, `external_reference` igual a la referencia del intento, `binary_mode` y sin efectivo ni cupones (no quedan pagos pendientes por días), con vencimiento igual al de la reserva. Redirige con un enlace GET al checkout; la URL se valida como https de `mercadopago.cl` o `.com`.
2. El retorno trae `preference_id`: es el valor no adivinable que se guardó como `provider_reference`. `external_reference` sería adivinable y revelaría el enlace del pedido.
3. La notificación se valida con `x-signature`, se consulta el pago para saber su `external_reference` y se guarda como evento.
4. En todos los casos `verify` busca en la API los pagos de esa `external_reference`, y solo eso decide. Se valida monto, moneda (CLP), cuenta receptora (el id de usuario del token) y modo real o de prueba: un pago real en un ambiente de pruebas queda como «otro ambiente» y no confirma nada.

**Reembolso.** `refund` busca el pago aprobado y pide `POST /v1/payments/{id}/refunds` con cuerpo vacío (total) y `X-Idempotency-Key`. Si el pago ya estaba devuelto, no lo pide de nuevo.

**Probar en sandbox (local con una URL HTTPS pública).**
1. En [Tus integraciones](https://www.mercadopago.cl/developers/panel/app), crea una aplicación de Checkout Pro y usuarios de prueba (vendedor y comprador). Copia el **Access Token de prueba** del vendedor.
2. Expón la tienda con HTTPS. Elige uno de estos comandos y copia la URL `https://…` que imprime:

   ```bash
   ngrok http 3000
   ```

   ```bash
   npx localtunnel --port 3000
   ```
3. En `.env` (local), con esa URL:

   ```bash
   APP_ENV=integration
   APP_URL=https://xxxx.ngrok-free.app
   MERCADOPAGO_ACCESS_TOKEN=TEST-…
   MERCADOPAGO_WEBHOOK_SECRET=…
   ```

   Con `APP_ENV=integration` el pago simulado y los datos bancarios de ejemplo dejan de existir. Para volver a usarlos, deja `APP_ENV=local`: Mercado Pago funciona igual, pero el retorno automático exige https.
4. En la aplicación, sección **Webhooks**, configura la URL `https://xxxx.ngrok-free.app/api/payments/mercadopago/webhook` con el evento **Pagos** y copia la **clave secreta** a `MERCADOPAGO_WEBHOOK_SECRET`. Reinicia `npm run dev`.
5. Compra en la tienda eligiendo Mercado Pago y paga con el comprador de prueba y las [tarjetas de prueba](https://www.mercadopago.cl/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards). El nombre del titular decide el resultado (`APRO` aprobado, `OTHE` rechazado).
6. Verifica en `/admin/pagos`:
   - el evento «Notificación del proveedor» queda PROCESSED;
   - el pedido pasa a pagado con el stock descontado;
   - un rechazo deja el intento rechazado y permite reintentar.

   Sin webhook, `npm run jobs` (o el temporizador del servidor) también consulta los intentos abiertos.
7. Prueba el reembolso: en `/admin/pedidos/<id>`, «Anular pedido pagado». El pago debe quedar «Reembolsado» y el reembolso aparecer en el panel de Mercado Pago.
8. Prueba también un retorno repetido (recarga), una notificación con firma alterada (400), la caída de la red al iniciar (el intento falla y el cliente reintenta) y el reinicio a mitad de flujo. Guarda respuestas reales del sandbox en `tests/` como pruebas grabadas.
9. **Recién después** carga las credenciales de producción en el servidor (`APP_ENV=production`, token `APP_USR-…`, webhook de la app de producción) y revisa el método en `/admin/pagos/configuracion`.

## 11. Anular un pedido pagado y reembolsar (`refundOrder`, `refundPayment`)

Desde `/admin/pedidos/<id>` (permiso `payments:manage`: Administrador y Super administrador):

1. **En una transacción:**
   - El stock vuelve: `SALE_CANCELLED` si el pedido no se había despachado; `RETURN` si se despachó y el admin marca que los productos volvieron en buen estado. El índice `movements_one_reversal_per_order_line` impide devolverlo dos veces.
   - El pedido pasa a **CANCELLED** (pagado o en preparación) o **REFUNDED** («Devuelto»: despachado o entregado), con `payment_status = REVIEW` (dinero por devolver).
   - Cada pago PAID pasa a REVIEW con el motivo. Todo queda auditado (`order.cancel_paid` / `order.return`).
2. **Fuera de la transacción:** `refundPayment` pide el reembolso a cada proveedor con `refund`.
   - Antes de llamar, registra un evento `admin` en `payment_events`.
   - Si se reembolsa, el pago pasa a REFUNDED y, sin otros pagos en revisión, el pedido queda con el dinero REFUNDED (`payment.refund`).
   - Sin respuesta o con un error, el pago sigue en REVIEW y el evento queda FAILED. Se reintenta con «Reembolsar» en el pago, con la misma clave.
3. **Medios sin reembolso por API** (transferencia): se devuelve el dinero desde el banco y se registra con «Registrar devolución hecha» (`resolveIncident`).

Primero se anula y después se devuelve: nunca queda dinero devuelto sobre un pedido vigente. La llamada al proveedor no va dentro de la transacción, para no dejar el stock bloqueado esperando la red ni un estado incierto a medio escribir.
