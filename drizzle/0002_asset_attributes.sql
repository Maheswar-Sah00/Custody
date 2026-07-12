-- Module-owned sidecar table for per-asset custom field values (Assets module).
-- Idempotent so it is safe to (re)apply. See src/app/(app)/assets/_schema.ts.
CREATE TABLE IF NOT EXISTS "asset_attributes" (
  "asset_id" integer PRIMARY KEY NOT NULL,
  "values" jsonb DEFAULT '{}'::jsonb NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "asset_attributes" ADD CONSTRAINT "asset_attributes_asset_id_assets_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
