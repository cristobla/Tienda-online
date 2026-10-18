CREATE TYPE "public"."coupon_kind" AS ENUM('PERCENT', 'FIXED');--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "coupon_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_subtotal" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_uses" integer,
	"once_per_email" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_value" CHECK ("coupons"."value" > 0 AND ("coupons"."kind" <> 'PERCENT' OR "coupons"."value" <= 90)),
	CONSTRAINT "coupons_limits" CHECK ("coupons"."min_subtotal" >= 0 AND ("coupons"."max_uses" IS NULL OR "coupons"."max_uses" > 0)),
	CONSTRAINT "coupons_code_format" CHECK ("coupons"."code" ~ '^[A-Z0-9_-]{3,30}$')
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "free_shipping_from" integer;--> statement-breakpoint
CREATE INDEX "orders_coupon_idx" ON "orders" USING btree ("coupon_code");