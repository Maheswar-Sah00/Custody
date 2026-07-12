/**
 * Module-owned table for per-asset custom field VALUES.
 *
 * The core `assets` table has no jsonb column for the dynamic, per-category
 * custom fields (e.g. Electronics → warranty_months), and core is off-limits.
 * This sidecar table stores those values as one jsonb row per asset, keyed by
 * the field keys defined on `asset_categories.custom_fields`.
 *
 * It is created by drizzle/0002_asset_attributes.sql (CREATE TABLE IF NOT
 * EXISTS) and is intentionally NOT part of the core schema snapshot.
 */
import { integer, jsonb, pgTable } from "drizzle-orm/pg-core";

import { assets } from "@/core/db/schema";

export const assetAttributes = pgTable("asset_attributes", {
  /** One row per asset; also the primary key. */
  assetId: integer("asset_id")
    .primaryKey()
    .references(() => assets.id, { onDelete: "restrict" }),
  /** key → value map, e.g. { "warranty_months": "24" }. Values stored as strings. */
  values: jsonb("values").notNull().default({}),
});

export type AssetAttributes = typeof assetAttributes.$inferSelect;
export type NewAssetAttributes = typeof assetAttributes.$inferInsert;
