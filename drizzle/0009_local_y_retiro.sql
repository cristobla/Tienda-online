CREATE TYPE "public"."fulfillment" AS ENUM('DELIVERY', 'PICKUP');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment" "fulfillment" DEFAULT 'DELIVERY' NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "store_address" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "store_commune" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "store_region" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "maps_url" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "pickup_enabled" boolean DEFAULT false NOT NULL;