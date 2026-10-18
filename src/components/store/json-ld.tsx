/**
 * Datos estructurados (schema.org) para buscadores. Cada "<" se escribe como la secuencia de 6 caracteres <
 * (JSON válido, mismo texto): así un nombre o una descripción no pueden cerrar el <script> e inyectar HTML.
 */
export const jsonLdText = (data: object) => JSON.stringify(data).replace(/</g, "\\u003c");

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
