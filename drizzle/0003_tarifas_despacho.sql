CREATE TABLE "shipping_rates" (
	"region_id" integer PRIMARY KEY NOT NULL,
	"cost" integer NOT NULL,
	"eta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_rates_cost_nonneg" CHECK ("shipping_rates"."cost" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE cascade ON UPDATE no action;