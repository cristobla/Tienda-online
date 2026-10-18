CREATE TABLE "app_errors" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"route" text NOT NULL,
	"method" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_errors_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "review_url" text;--> statement-breakpoint
CREATE INDEX "app_errors_last_idx" ON "app_errors" USING btree ("last_at");