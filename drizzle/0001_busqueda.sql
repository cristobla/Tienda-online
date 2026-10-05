-- Búsqueda del catálogo: full-text en español sin tildes + trigramas para tolerar errores de tipeo.
-- unaccent y pg_trgm son extensiones "trusted": las puede instalar el dueño de la base.
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
-- unaccent() no es IMMUTABLE, así que no sirve en índices; este envoltorio sí.
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint
-- La consulta en src/modules/catalog/queries.ts usa exactamente estas expresiones (si cambian aquí, cambian allá).
CREATE INDEX products_search_idx ON products
  USING gin (to_tsvector('spanish', f_unaccent(name || ' ' || coalesce(short_description, ''))));
--> statement-breakpoint
CREATE INDEX products_name_trgm_idx ON products USING gin (f_unaccent(lower(name)) gin_trgm_ops);
