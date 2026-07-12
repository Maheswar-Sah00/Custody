/**
 * Server-side data access for the Resource Booking screen. Read-only — every
 * mutation lives in actions.ts.
 *
 * Two things are loaded:
 *   1. The list of bookable resources (assets with is_bookable = true) that fill
 *      the resource selector at the top of the screen.
 *   2. For a chosen resource + calendar day, the bookings whose window touches
 *      that day — the blocks the day-view calendar renders.
 *
 * Booking rows keep a persisted status enum, but with no background scheduler
 * running we derive a *live* display status from the current clock so a seeded
 * "upcoming" booking correctly reads as "ongoing" or "completed" once its window
 * arrives. See {@link liveBookingStatus}.
 */
import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/core/db";
import {
  assetCategories,
  assets,
  bookings,
  users,
  type BookingStatus,
} from "@/core/db/schema";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export interface BookableResource {
  id: number;
  tag: string;
  name: string;
  categoryName: string;
  location: string | null;
}

export interface BookingBlock {
  id: number;
  assetId: number;
  bookedById: number;
  bookedByName: string;
  startsAt: string;
  endsAt: string;
  /** Persisted status column. */
  status: BookingStatus;
  /** Status derived from the current clock (see liveBookingStatus). */
  displayStatus: BookingStatus;
}

/* -------------------------------------------------------------------------- */
/*  Resources                                                                 */
/* -------------------------------------------------------------------------- */

/** Every bookable asset, ordered by tag, for the resource selector. */
export async function loadBookableResources(): Promise<BookableResource[]> {
  const rows = await db
    .select({
      id: assets.id,
      tag: assets.tag,
      name: assets.name,
      categoryName: assetCategories.name,
      location: assets.location,
    })
    .from(assets)
    .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
    .where(eq(assets.isBookable, true))
    .orderBy(asc(assets.tag));

  return rows;
}

/* -------------------------------------------------------------------------- */
/*  Bookings for a resource + day                                             */
/* -------------------------------------------------------------------------- */

/**
 * Bookings for `assetId` whose window overlaps the calendar day `dateISO`
 * (a `YYYY-MM-DD` string, interpreted in the server's local time zone).
 * Cancelled bookings are included so the calendar can show freed slots as
 * struck-through history; the caller decides how to render each status.
 */
export async function loadBookingsForDay(
  assetId: number,
  dateISO: string,
): Promise<BookingBlock[]> {
  const dayStart = new Date(`${dateISO}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const rows = await db
    .select({
      id: bookings.id,
      assetId: bookings.assetId,
      bookedById: bookings.bookedBy,
      bookedByName: users.name,
      startsAt: bookings.startsAt,
      endsAt: bookings.endsAt,
      status: bookings.status,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.bookedBy))
    .where(
      and(
        eq(bookings.assetId, assetId),
        // Window intersects [dayStart, dayEnd): starts before the day ends AND
        // ends after the day begins.
        sql`${bookings.startsAt} < ${dayEnd.toISOString()}`,
        sql`${bookings.endsAt} > ${dayStart.toISOString()}`,
      ),
    )
    .orderBy(asc(bookings.startsAt));

  const now = Date.now();
  return rows.map((r) => {
    const startsAt = r.startsAt.toISOString();
    const endsAt = r.endsAt.toISOString();
    return {
      id: r.id,
      assetId: r.assetId,
      bookedById: r.bookedById,
      bookedByName: r.bookedByName,
      startsAt,
      endsAt,
      status: r.status,
      displayStatus: liveBookingStatus(r.status, r.startsAt, r.endsAt, now),
    };
  });
}

/**
 * Derive the status a booking should *appear* as right now. A cancelled booking
 * stays cancelled; otherwise the window relative to `now` decides:
 *   before start → upcoming, inside → ongoing, after end → completed.
 */
export function liveBookingStatus(
  persisted: BookingStatus,
  startsAt: Date,
  endsAt: Date,
  now = Date.now(),
): BookingStatus {
  if (persisted === "cancelled") return "cancelled";
  if (now < startsAt.getTime()) return "upcoming";
  if (now < endsAt.getTime()) return "ongoing";
  return "completed";
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers used by the client                                         */
/* -------------------------------------------------------------------------- */

/** Bookings whose live status counts as an active hold (blocks new overlaps). */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = [
  "upcoming",
  "ongoing",
];

/** True if a persisted status is one the DB overlap constraint enforces on. */
export function isConstraintStatus(status: BookingStatus): boolean {
  return ACTIVE_BOOKING_STATUSES.includes(status);
}
