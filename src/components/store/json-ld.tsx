/** Datos estructurados (schema.org) para buscadores. "<" se escapa para que el texto no pueda cerrar el <script>. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }} />;
}
