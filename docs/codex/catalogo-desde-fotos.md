Tarea: armar el catálogo de la tienda a partir de FOTOS de productos reales. Trabajas en esta carpeta (no es el repositorio de la tienda). Fotos: `entrada/`. Escribe solo `catalogo.json` e `informe.md` aquí.

La tienda: e-commerce chileno de higiene personal, cuidado personal, aseo del hogar y accesorios, con local físico.

Para CADA imagen de `entrada/`:
1. Identifica el producto mirando la foto: marca, nombre comercial, variante (aroma, tipo) y formato (contenido y unidad, o cantidad de unidades). Si la foto no es un producto, está borrosa o no se puede identificar con seguridad, NO la incluyas en el JSON: anótala en el informe.
2. EXCLUYE (no en el JSON, sí en el informe) medicamentos y productos farmacéuticos con registro sanitario de medicamento, suplementos alimenticios y productos de venta en farmacia con indicación terapéutica. Si dudas (p. ej. una crema para la piel), inclúyelo pero márcalo en el informe como «revisar: posible producto farmacéutico».
3. Busca en internet el precio de venta ACTUAL en Chile, en pesos, IVA incluido. Prioriza estas tiendas: Jumbo, Líder, Santa Isabel, Unimarc, Tottus, Cruz Verde, Salcobrand, Farmacias Ahumada, Preunic, Falabella. Usa el precio normal publicado (no el precio de una oferta temporal, ni el de tarjeta o socios). Si hay 2 o más fuentes, usa la mediana. Debe ser el MISMO formato (mismo contenido): no compares 400 ml con 750 ml. Si no encuentras el mismo formato, no inventes: deja el producto fuera del JSON y anótalo en el informe.
4. Si el código de barras (EAN-13) se ve claramente en la foto o aparece en la página de la tienda para ese mismo producto, anótalo; si no, null. Nunca lo inventes.
5. Elige la categoría de la tienda (texto EXACTO de esta lista; si ninguna calza, null):
{{CATEGORIAS}}
6. Escribe una descripción breve (2 o 3 frases, español de Chile, tono cercano y claro) con lo que dice el envase: para qué es, características visibles (aroma, tipo, cantidad). SIN afirmaciones de salud, efectos médicos ni superlativos («el mejor»). Si no hay información, null.

`catalogo.json`: un arreglo; una entrada por producto con EXACTAMENTE estas claves:
- "archivo": nombre del archivo de la foto en entrada/ (tal cual).
- "nombre": nombre para la tienda: «Tipo de producto + Marca + variante», p. ej. «Shampoo Sedal Ceramidas». Sin el formato.
- "marca": la marca, o null.
- "categoria": de la lista, o null.
- "formato": como se muestra al cliente: «400 ml», «20 g», «1 L», «Pack 4 rollos», «Unidad».
- "contenido": número del contenido (400, 20, 1) o null si no aplica.
- "unidad": una de "ML", "L", "G", "KG", "CM", "M", "UNIT".
- "unidades": cantidad de unidades del pack (1 si es una sola).
- "precio_referencia": entero en CLP (el precio online encontrado, la mediana si hay varias fuentes).
- "fuente": la URL de donde sacaste el precio (si hay varias, la principal; las demás en el informe).
- "codigo_barras": EAN de 8, 12, 13 o 14 dígitos, o null.
- "descripcion": texto o null.
No calcules el precio de la tienda (lo hace el cargador: 15 % menos).

`informe.md`: tabla con una fila por foto: archivo, producto identificado, formato, precios encontrados con tienda y URL, precio_referencia usado, y observaciones (dudas de identificación, posible farmacéutico, formato no encontrado, excluido y por qué).

Al terminar responde solo con: cuántas fotos había, cuántas entraron al JSON y cuántas quedaron fuera (con el motivo en una línea cada una).
