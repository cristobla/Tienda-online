# Presentación para inversores y socios comerciales

**Negocio:** [COMPLETAR: nombre de la tienda]. **Local:** [COMPLETAR: comuna y dirección]. **Presenta:** [COMPLETAR: nombre, cargo y contacto].

Borrador basado en `AGENTS.md`, `CLAUDE.md`, `README.md` y `docs/LANZAMIENTO.md`. Las capacidades construidas no equivalen a servicios ya habilitados en producción ni a resultados comerciales. Completar los marcadores con antecedentes verificables antes de presentar.

## 1. Resumen y versión de una línea

[COMPLETAR: nombre de la tienda] es una tienda de barrio en Chile dedicada a higiene personal, cuidado personal, aseo del hogar y accesorios. Desde su local físico, prepara el lanzamiento de una tienda online propia para vender directamente, con despacho a todo Chile como alcance previsto y retiro gratis en el local. La plataforma reúne catálogo, compra, pagos y gestión de pedidos e inventario, con precios claros y atención por WhatsApp. Buscamos convertir la cercanía del comercio de barrio en una experiencia de compra que también funcione a distancia, y sumar capital y acuerdos comerciales para completar el lanzamiento y crecer con resultados medibles.

**En una línea:** Una tienda de barrio con local físico y canal online propio, que combina compra simple, retiro gratis y despacho con una gestión centralizada del negocio.

## 2. El problema y la oportunidad

El cliente compara surtido, precio y conveniencia entre supermercados, marketplaces y comercios cercanos. Para una tienda de barrio, competir exige que sus productos sean fáciles de encontrar, que el precio y la entrega se entiendan antes de comprar y que la atención mantenga la confianza del local.

Un canal propio permite administrar la presentación del catálogo, las promociones y el contacto con los compradores. La tienda vende sus productos directamente: no opera un marketplace ni cobra comisiones a vendedores externos. Esto permite decidir la experiencia comercial, aunque también exige financiar la captación de clientes, la operación y la tecnología.

La oportunidad que queremos validar es atender compras de reposición del hogar y, más adelante, compras recurrentes de empresas y comunidades. El local aporta un punto de atención y retiro; el canal online amplía las formas de comprar. No suponemos que esa combinación asegure demanda o rentabilidad.

- Tamaño del mercado relevante: [COMPLETAR: fuente, año, definición del mercado y cifra].
- Participación de la compra online en estas categorías: [COMPLETAR: fuente, período y cifra].
- Demanda en la zona del local: [COMPLETAR: fuente, metodología y cifra].
- Evidencia propia de interés: [COMPLETAR: consultas, solicitudes o ventas verificadas y período].

## 3. La solución y sus diferencias

La propuesta une un local físico con una tienda online bajo la misma identidad y un panel propio para gestionar el canal digital.

- **Precios comprensibles:** montos en pesos chilenos, IVA incluido, y precio por litro o kilo cuando el producto tiene cargados su contenido y unidad. Facilita comparar formatos sin afirmar que siempre somos la alternativa más barata.
- **Entrega a elección:** retiro gratis, una vez habilitado con los datos del local, o despacho con costo informado antes de confirmar. Para ofrecer cobertura nacional se deben validar y cargar tarifas y plazos reales en todas las regiones; una región sin tarifa queda fuera del checkout.
- **Atención cercana:** acceso a WhatsApp desde la tienda y consultas desde una ficha que incluyen el producto y su enlace. La atención la presta el equipo del negocio.
- **Control comercial:** gestión propia de productos, ofertas, cupones, pedidos, inventario y reportes.
- **Presencia del local:** dirección, horario y acceso a Google Maps cuando esos datos están configurados.

La operación física requiere coordinar sus movimientos de stock con el panel. No se presenta como existente una integración automática con la caja del local.

## 4. Lo que ya está construido

### Tienda

- Catálogo con búsqueda, categorías, marcas, filtros, formatos, fotos, disponibilidad, destacados, novedades y ofertas.
- Carrito con revisión de precio y stock; compra como invitado, despacho por comuna o retiro en el local.
- Comprobante con estado del pedido y recuperación del enlace mediante número de pedido y correo. No equivale a seguimiento del transportista en tiempo real.
- Consulta y opción de compartir productos por WhatsApp. Las cuentas de clientes siguen siendo un próximo paso.

### Pagos

- Transferencia bancaria con instrucciones y confirmación por personal autorizado después de revisar el abono en la cuenta.
- Registro de intentos, reintentos e incidencias; controles para evitar confirmaciones duplicadas o montos incorrectos.
- Gestión de anulaciones y devoluciones, con reposición de stock cuando corresponde y tratamiento del reembolso según el medio de pago.
- Mercado Pago Checkout Pro implementado, pendiente de prueba real en su entorno de pruebas y habilitación productiva. Webpay y Khipu siguen pendientes. El pago simulado sirve solo para demostraciones locales y pruebas.

### Operación / Panel

- Administración del catálogo, importación desde Excel con vista previa, carga masiva de fotos, acciones por grupos de productos y exportación del catálogo.
- Inventario con existencias físicas, reservadas y disponibles; ingresos, mermas, conteos e historial. Los pedidos reservan stock y los impagos vencidos lo liberan.
- Gestión de preparación, despacho, retiro y entrega; hoja imprimible para preparar pedidos y registro de correos al cliente.
- Reportes de ventas y productos más vendidos, exportación de pedidos y fichas de clientes agrupadas por correo.
- Configuración de tarifas, datos del local, medios de pago y páginas informativas desde el panel.

### Seguridad

- Accesos del personal por función, verificación en dos pasos y registro de quién hizo cada cambio.
- Validación de precios, totales y disponibilidad al confirmar la compra; límites a intentos de acceso y creación de pedidos.
- Historial de inventario protegido contra edición y borrado, registro de errores y respaldos automáticos preparados para el despliegue.
- La puesta en producción debe completar la configuración de seguridad, la copia externa de respaldos y la prueba de recuperación en ese entorno. Estas medidas no significan riesgo cero.

### Marketing y presencia

- Ofertas, productos destacados, cupones con condiciones y despacho gratis desde un monto configurable.
- Preparación para aparecer en buscadores, imágenes al compartir y catálogo de productos para Google Merchant Center y Meta.
- Google Analytics 4 y píxel de Meta integrados, sujetos a configuración y aceptación de cookies; eventos de agregar al carrito y compra.
- Solicitud de reseña en Google al entregar o retirar el pedido, mediante correo y botón, si el enlace está configurado.

Las cuentas externas, sus verificaciones y la publicación de campañas requieren trabajo del negocio. La boleta electrónica, los textos definitivos y la validación de datos comerciales forman parte de los pendientes de lanzamiento.

## 5. Modelo de negocio

| Fuente | Cómo funciona | Datos por completar |
|---|---|---|
| Venta de productos | Compra y reventa con margen; ingreso principal del negocio. | [COMPLETAR: ventas mensuales, costo de mercadería y margen por categoría]. |
| Despacho | Cobro informado al comprador para financiar la entrega; puede quedar parcial o totalmente subsidiado por promociones. | [COMPLETAR: tarifa, costo efectivo y contribución por región]. |
| Convenios comerciales | Próximo paso: acuerdos de abastecimiento a empresas o comunidades y acciones con proveedores o marcas. | [COMPLETAR: condiciones, volumen mínimo e ingreso o ahorro esperado]. |

El cobro de despacho no se considera utilidad completa. Para evaluar cada pedido se deben descontar mercadería, descuentos, embalaje, preparación, transporte subsidiado y costos de cobro. La operación también debe cubrir personal, local, tecnología y captación.

**Economía por pedido:** [COMPLETAR: ticket promedio, costo de productos, costo variable total y contribución]. **Costos fijos:** [COMPLETAR: monto mensual y detalle]. **Punto de equilibrio:** [COMPLETAR: pedidos o ventas necesarios, supuestos y cálculo]. El reporte de ventas no reemplaza el cálculo contable del margen.

## 6. Métricas a mostrar

Usar el período [COMPLETAR: período de medición] y distinguir datos del local, del canal online y de demostración. Los reportes de la plataforma no prueban ventas físicas que no hayan sido registradas en ella.

| Métrica | Cómo se obtiene y qué significa | Valor |
|---|---|---|
| Ventas por día y mes | `/admin/reportes`: agrupa por fecha de pago en hora de Chile. Mostrar también anulaciones y devoluciones; el registro original del pago permanece. | [COMPLETAR: CLP, pedidos y período]. |
| Ticket promedio | Reportes: total de ventas del período dividido por pedidos pagados del período. Incluye despacho e IVA; revisar devoluciones al interpretar el resultado. | [COMPLETAR: CLP por pedido y período]. |
| Productos más vendidos | Reportes: unidades y monto por producto/formato. Revisar devoluciones antes de usarlo para proyectar reposición. | [COMPLETAR: productos, unidades, montos y período]. |
| Clientes recurrentes | `/admin/clientes` agrupa pedidos por correo y muestra compras y gasto. A partir de esos antecedentes, calcular compradores con más de una compra válida sobre compradores del período. La tasa por período requiere análisis adicional; no se afirma que exista un indicador automático. | [COMPLETAR: compradores recurrentes, total, porcentaje y período]. |
| Reseñas en Google | La tienda facilita pedirlas; cantidad, nota y evolución se consultan en el Perfil de Empresa de Google, fuera del panel. | [COMPLETAR: cantidad, nota y fecha de corte]. |
| Captación y conversión | GA4 y Meta, una vez configurados, registran eventos con consentimiento. Complementar con gasto publicitario y pedidos verificados; no todos los compradores quedan medidos. | [COMPLETAR: inversión, compras atribuidas, costo de adquisición y período]. |

El «neto» tributario excluye IVA; no representa utilidad. La recurrencia por correo tampoco identifica de forma perfecta a una persona que usa distintos correos.

## 7. Hoja de ruta: próximos pasos

Horizontes propuestos desde [COMPLETAR: hito de inicio acordado], sujetos a presupuesto y resultados. No constituyen fechas comprometidas.

| Horizonte | Próximos pasos | Evidencia para avanzar |
|---|---|---|
| 3 meses | Completar catálogo vendible con fotos, categorías, precios y stock revisados. Resolver boleta electrónica y revisión de textos antes de cobrar al público. Configurar dominio, servidor, correos, respaldos externos, retiro y despacho nacional validado. Probar y habilitar pago con tarjeta mediante Mercado Pago. Lanzar y activar presencia en Google y redes. | [COMPLETAR: responsables, presupuesto, catálogo objetivo y criterios de lanzamiento]. |
| 6 meses | Completar y mantener el catálogo comercial acordado, mejorar reposición con datos de ventas, crecer en redes y evaluar campañas por su contribución. Pilotear abastecimiento B2B a empresas y convenios comunitarios. Cotización, facturación y condiciones especiales B2B requieren definición y posibles desarrollos; no son un portal mayorista existente. | [COMPLETAR: metas de ventas, recompra, contribución y convenios validados]. |
| 12 meses | Evaluar expansión del surtido y de los acuerdos B2B. Estudiar más locales o una franquicia solo si la operación y la rentabilidad son replicables. La gestión de múltiples locales o franquicias es un desarrollo futuro. | [COMPLETAR: criterios de rentabilidad, capacidad, inversión y decisión de expansión]. |

## 8. Qué se busca

**Para inversores:** capital para ejecutar un plan comercial y operativo medible, con seguimiento de uso de fondos y resultados.

- Monto y modalidad de inversión: [COMPLETAR: CLP e instrumento].
- Uso de fondos: [COMPLETAR: distribución en inventario, operación, lanzamiento, tecnología y capital de trabajo].
- Participación ofrecida y condiciones: [COMPLETAR: porcentaje, valorización y términos propuestos].
- Plazo financiado e hitos: [COMPLETAR: duración, entregables y frecuencia de rendición].

**Para socios comerciales:** proveedores con mejores precios y condiciones de pago; marcas interesadas en exhibición física y productos destacados online; empresas que compren insumos de aseo; y juntas de vecinos o comunidades que quieran acordar beneficios de compra. Volúmenes, descuentos, exclusividades y condiciones se negocian con respaldo de costos y capacidad real.

## 9. Propuesta para proveedores y marcas

Proponemos una relación de abastecimiento que combine vitrina online y presencia en el local. La tienda puede organizar productos por marca y categoría, publicar fichas con formatos y fotos, destacar productos y mostrar ofertas. La exhibición física y sus espacios se acuerdan según la capacidad disponible: [COMPLETAR: ubicación, espacios y condiciones].

La plataforma ya permite administrar destacados, precios rebajados y cupones. Sobre esa base podemos acordar acciones comerciales con objetivos claros: dar a conocer un producto, probar un formato o apoyar la reposición. Cada acción debe definir surtido, disponibilidad, duración y aporte de las partes. No se garantizan ventas ni audiencia: [COMPLETAR: tráfico medido, alcance del local y ventas históricas relevantes].

Ofrecemos preparar un resumen de ventas de los productos de la marca a partir de los reportes y exportaciones de pedidos. El análisis se hará por los productos acordados, con unidades, montos y período, sin entregar datos personales de compradores. Este trabajo requiere consolidación; no existe un portal de autoservicio para proveedores ni un reporte automático por marca. Su frecuencia y alcance serán [COMPLETAR: periodicidad y contenido del informe].

Pedimos una propuesta que incluya precio de compra, descuentos por volumen, mínimos, plazos de pago, disponibilidad, frecuencia de reposición y tratamiento de faltantes o productos dañados. También necesitamos fichas de producto, códigos de barras, contenido por formato y fotografías autorizadas para uso comercial.

Como próximo paso, proponemos seleccionar un surtido inicial y evaluar un piloto con condiciones escritas: [COMPLETAR: productos, cantidades, presupuesto, duración y responsables]. La continuidad se decidirá según ventas, contribución, cumplimiento de entrega y capacidad de reposición, con información compartida entre ambas partes.

## 10. Guion de demostración de 5 minutos

Preparación: abrir las pantallas y un pedido de demostración, usar datos identificados como prueba y mantener ocultos datos personales y bancarios reales. No confirmar pagos ficticios en producción. Tener un producto con contenido por unidad y un reporte preparados; no presentar los datos de prueba como tracción comercial.

| Tiempo | Qué mostrar | Qué decir |
|---|---|---|
| 0:00–0:35 | Portada: categorías, destacados y sección del local. | «Esta es la tienda online propia de nuestro local. El cliente puede conocer el surtido y elegir cómo recibir su compra». |
| 0:35–1:10 | Búsqueda, filtros y ficha: formato, disponibilidad, precio por litro/kilo y WhatsApp. | «Facilitamos comparar formatos y consultar por un producto específico. La atención mantiene el vínculo con el negocio». |
| 1:10–1:55 | Carrito y checkout: despacho y retiro. | «El comprador conoce el costo total antes de confirmar. El retiro habilitado no tiene costo de entrega; el despacho depende de la región configurada». |
| 1:55–2:25 | Comprobante de un pedido de prueba con transferencia. | «El pedido reserva stock. La transferencia se confirma tras verificar el abono. Mercado Pago está implementado y su activación requiere completar las pruebas reales». |
| 2:25–3:10 | Panel: pedido, historial, correos y hoja de preparación. | «El equipo ve qué preparar y registra el avance hasta la entrega o el retiro. La operación deja un historial». |
| 3:10–3:45 | Inventario y productos: reservas, movimientos, importación y fotos. | «Podemos mantener el catálogo y registrar reposiciones, mermas y conteos. Debemos coordinar también las ventas del local para mantener el stock correcto». |
| 3:45–4:30 | Reportes y ficha de cliente. | «Medimos ventas, ticket y productos más vendidos. El historial por correo ayuda a estudiar recompra. Estos valores son de prueba; los resultados comerciales se presentarán con su período». |
| 4:30–5:00 | Promociones y cierre con la propuesta de acuerdo. | «La base operativa está construida. Buscamos [COMPLETAR: inversión o acuerdo concreto] para [COMPLETAR: hito verificable]. El siguiente paso es revisar condiciones y responsables». |

## 11. Preguntas difíciles y respuestas

1. **¿Por qué comprarían aquí y no en un supermercado o marketplace?** La propuesta combina atención directa, retiro local y claridad de catálogo y entrega. Debemos demostrar que eso influye en la decisión: [COMPLETAR: evidencia de clientes, comparación de canasta y recompra]. No basamos la propuesta en ser siempre los más baratos.

2. **¿Cuánto venden realmente?** Separaremos ventas del local y online, y distinguiremos pedidos pagados de pendientes y devoluciones. Ventas verificadas: [COMPLETAR: monto, canal, período y respaldo]. La plataforma construida no demuestra por sí sola demanda.

3. **¿Qué margen queda después de despachar?** Hay que calcular la contribución por pedido y región, incluyendo descuentos y costos de operación. Resultado: [COMPLETAR: cálculo y casos por zona]. El despacho gratis se habilitará solo con una evaluación de su costo.

4. **¿Cuánto cuesta conseguir un cliente y cuándo vuelve a comprar?** Aún debemos respaldarlo con campañas y cohortes de compradores. [COMPLETAR: costo de adquisición, frecuencia de recompra, período y método]. La medición web requiere configuración y consentimiento; se contrastará con pagos verificados.

5. **¿Qué falta para vender al público?** Completar catálogo y datos reales, puesta en producción, correos, logística, boleta electrónica y revisión de textos. Para tarjetas, falta validar Mercado Pago en su entorno real de pruebas y habilitarlo. [COMPLETAR: responsables, costo y estado de cada pendiente].

6. **¿Pueden cumplir despachos a todo Chile?** Es el alcance propuesto, pero depende de acuerdos logísticos y tarifas reales. La plataforma solo permite comprar con despacho donde hay cobertura configurada. [COMPLETAR: transportistas, regiones habilitadas, plazos, costos y manejo de incidencias].

7. **¿Cómo evitan vender online algo que ya salió por caja?** El canal online reserva y descuenta stock con controles. La coordinación con el local necesita un procedimiento de registro y conteo; no afirmamos sincronización automática con su caja. [COMPLETAR: sistema actual, responsables y frecuencia de actualización].

8. **¿Qué pasa con un pago duplicado, una devolución o una caída?** Hay controles de confirmación, gestión de incidencias, historial y respaldos. La respuesta operativa debe asignar responsables y probar recuperación. [COMPLETAR: procedimiento, tiempos de atención y evidencia de restauración en producción].

9. **¿Por qué invertir ese monto y aceptar esa valorización?** La propuesta debe sostenerse en resultados, presupuesto y escenarios. [COMPLETAR: monto, valorización, participación, proyección y supuestos]. No ofrecemos retornos garantizados; proponemos evaluar hitos y rendición del uso de fondos.

10. **¿Cómo escalan sin multiplicar costos y complejidad?** Primero se validarán contribución, reposición y capacidad de preparación. B2B, más locales o franquicias son próximos pasos condicionados a esos resultados, y requieren procesos y desarrollo adicional. [COMPLETAR: capacidad actual, costo incremental, equipo responsable y criterios de expansión].
