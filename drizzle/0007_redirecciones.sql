CREATE TABLE "slug_redirects" (
	"kind" text NOT NULL,
	"old_slug" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slug_redirects_kind_old_slug_pk" PRIMARY KEY("kind","old_slug"),
	CONSTRAINT "slug_redirects_kind" CHECK ("slug_redirects"."kind" IN ('product', 'category', 'brand'))
);
