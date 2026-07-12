-- Hand-written constraints that Drizzle's schema DSL cannot express.
-- Applied after 0000_init.sql by `npm run db:migrate`.

-- Required for the GiST exclusion constraint below (equality on integer asset_id).
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- No two live (upcoming/ongoing) bookings for the same asset may overlap in time.
-- Cancelled and completed bookings are exempt, so history never blocks new bookings.
ALTER TABLE bookings ADD CONSTRAINT no_overlapping_bookings
  EXCLUDE USING gist (asset_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('upcoming','ongoing'));--> statement-breakpoint

-- An asset can have at most one active allocation at a time.
CREATE UNIQUE INDEX one_active_allocation ON allocations(asset_id) WHERE status = 'active';--> statement-breakpoint

-- An allocation is held by exactly one party: a user XOR a department.
ALTER TABLE allocations ADD CONSTRAINT allocation_single_holder
  CHECK (num_nonnulls(holder_user_id, holder_department_id) = 1);--> statement-breakpoint

-- A booking must end after it starts (also guarantees a non-empty tstzrange above).
ALTER TABLE bookings ADD CONSTRAINT booking_ends_after_start
  CHECK (ends_at > starts_at);--> statement-breakpoint

-- Asset tag auto-generation: 'AF-' || zero-padded sequence value (e.g. AF-0001).
-- The sequence and column default are created in 0000_init.sql from schema.ts;
-- restated here idempotently so this migration stands alone as documentation.
CREATE SEQUENCE IF NOT EXISTS asset_tag_seq START WITH 1;--> statement-breakpoint
ALTER TABLE assets ALTER COLUMN tag SET DEFAULT 'AF-' || lpad(nextval('asset_tag_seq')::text, 4, '0');
