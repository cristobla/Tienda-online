CREATE TABLE "info_pages" (
	"slug" text PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"email" text,
	"whatsapp" text,
	"hours" text,
	"instagram" text,
	"facebook" text,
	"tiktok" text,
	"order_notify_email" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_settings_single_row" CHECK ("store_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "info_pages" ADD CONSTRAINT "info_pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "movements_one_reversal_per_order_line" ON "inventory_movements" USING btree ("reference_id","variant_id") WHERE "inventory_movements"."movement_type" IN ('SALE_CANCELLED', 'RETURN') AND "inventory_movements"."reference_type" = 'ORDER';--> statement-breakpoint
CREATE INDEX "orders_paid_idx" ON "orders" USING btree ("paid_at");