import { z } from "zod";

/** Órdenes disponibles en la tienda. La clave es la que va en la URL (?orden=). */
export const SORTS = {
  destacados: "Destacados",
  relevancia: "Más relevantes",
  nuevos: "Más nuevos",
  precio_asc: "Menor precio",
  precio_desc: "Mayor precio",
  nombre: "Nombre A–Z",
} as const;
export type Sort = keyof typeof SORTS;

export const PAGE_SIZE = 24;

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

// Parámetros inválidos se ignoran (catch) en vez de romper la página: la URL la escribe cualquiera.
const money = z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined);
const schema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined).transform((v) => v || undefined),
  sort: z.enum(Object.keys(SORTS) as [Sort, ...Sort[]]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(1000).catch(1),
  minPrice: money,
  maxPrice: money,
  inStock: z.boolean(),
});

/** Prefijo de los filtros por atributo en la URL: ?a_aroma=Coco&a_aroma=Limón */
export const ATTR_PREFIX = "a_";

export type CatalogParams = z.infer<typeof schema> & { brandSlugs: string[]; attrs: Record<string, string[]> };

export function parseCatalogParams(sp: SearchParams): CatalogParams {
  const attrs: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith(ATTR_PREFIX)) attrs[key.slice(ATTR_PREFIX.length)] = all(value).slice(0, 20);
  }
  return {
    ...schema.parse({
      q: first(sp.q),
      sort: first(sp.orden),
      page: first(sp.pagina),
      minPrice: first(sp.precio_min) || undefined,
      maxPrice: first(sp.precio_max) || undefined,
      inStock: first(sp.disponible) === "1",
    }),
    brandSlugs: all(sp.marca).slice(0, 50),
    attrs,
  };
}
