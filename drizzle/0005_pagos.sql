CREATE TYPE "public"."payment_event_status" AS ENUM('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'UNCERTAIN';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'REVIEW';--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"provider" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_provider_ref";--> statement-breakpoint
ALTER TABLE "payment_events" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "source" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "status" "payment_event_status" DEFAULT 'RECEIVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "tries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "payment_events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "environment" text NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "account" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "received_amount" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "incident" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "movements_one_sale_per_order_line" ON "inventory_movements" USING btree ("reference_id","variant_id") WHERE "inventory_movements"."movement_type" = 'SALE' AND "inventory_movements"."reference_type" = 'ORDER';--> statement-breakpoint
CREATE INDEX "payment_events_status_idx" ON "payment_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending" ON "payments" USING btree ("order_id","provider") WHERE "payments"."status" = 'PENDING';--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_unique" UNIQUE("reference");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_attempt" UNIQUE("order_id","attempt");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_external_ref" UNIQUE("provider","environment","account","provider_reference");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_pos" CHECK ("payments"."received_amount" IS NULL OR "payments"."received_amount" > 0);