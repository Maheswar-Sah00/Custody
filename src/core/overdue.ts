/**
 * Overdue engine.
 *
 * Two things are "overdue" in AssetFlow:
 *   1. an active allocation whose expected_return_date is in the past, and
 *   2. a booking still marked upcoming/ongoing whose window has already ended.
 *
 * {@link checkOverdue} finds both, raises an in-app `alert` notification for
 * each newly-overdue item (and records it in the activity log), and returns the
 * current overdue set. It is idempotent: an item is "newly overdue" only when no
 * `alert` notification already points at it, so repeated runs never spam.
 *
 * The read helpers ({@link findOverdueAllocations}, {@link findOverdueBookings})
 * are also consumed directly by the dashboard's overdue banner and KPI counts,
 * so they never mutate anything.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { logActivity } from "./activity-log";
import { db, type DbExecutor } from "./db";
import {
  allocations,
  assets,
  bookings,
  departments,
  notifications,
  users,
} from "./db/schema";

/* -------------------------------------------------------------------------- */
/*  Result shapes                                                             */
/* -------------------------------------------------------------------------- */

export interface OverdueAllocation {
  allocationId: number;
  assetId: number;
  tag: string;
  assetName: string;
  /** ISO `YYYY-MM-DD` the item was expected back. */
  expectedReturnDate: string;
  /** Whole days between the due date and now (>= 1 for anything overdue). */
  daysOverdue: number;
  holderUserId: number | null;
  holderDepartmentId: number | null;
  /** Stable pointer used for notification de-duplication, e.g. "allocation:12". */
  entityRef: string;
}

export interface OverdueBooking {
  bookingId: number;
  assetId: number;
  tag: string;
  assetName: string;
  bookedBy: number;
  /** ISO timestamp the booking window closed. */
  endsAt: string;
  daysOverdue: number;
  entityRef: string;
}

export interface CheckOverdueResult {
  allocations: OverdueAllocation[];
  bookings: OverdueBooking[];
  /** How many notifications were created on this run (0 on a warm re-run). */
  newlyNotified: number;
}

/* -------------------------------------------------------------------------- */
/*  Read helpers (safe for the dashboard — no writes)                         */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days elapsed since `iso` (a date or timestamp), floored at 0. */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / MS_PER_DAY));
}

/**
 * Active allocations whose expected return date has passed. Allocations with no
 * expected return date (e.g. open-ended department holdings) are never overdue.
 */
export async function findOverdueAllocations(
  executor: DbExecutor = db,
): Promise<OverdueAllocation[]> {
  const rows = await executor
    .select({
      allocationId: allocations.id,
      assetId: allocations.assetId,
      tag: assets.tag,
      assetName: assets.name,
      expectedReturnDate: allocations.expectedReturnDate,
      holderUserId: allocations.holderUserId,
      holderDepartmentId: allocations.holderDepartmentId,
    })
    .from(allocations)
    .innerJoin(assets, eq(assets.id, allocations.assetId))
    .where(
      and(
        eq(allocations.status, "active"),
        isNotNull(allocations.expectedReturnDate),
        sql`${allocations.expectedReturnDate} < CURRENT_DATE`,
      ),
    );

  return rows.map((r) => ({
    allocationId: r.allocationId,
    assetId: r.assetId,
    tag: r.tag,
    assetName: r.assetName,
    expectedReturnDate: r.expectedReturnDate as string,
    daysOverdue: daysSince(r.expectedReturnDate as string),
    holderUserId: r.holderUserId,
    holderDepartmentId: r.holderDepartmentId,
    entityRef: `allocation:${r.allocationId}`,
  }));
}

/** Bookings still marked upcoming/ongoing whose window has already closed. */
export async function findOverdueBookings(
  executor: DbExecutor = db,
): Promise<OverdueBooking[]> {
  const rows = await executor
    .select({
      bookingId: bookings.id,
      assetId: bookings.assetId,
      tag: assets.tag,
      assetName: assets.name,
      bookedBy: bookings.bookedBy,
      endsAt: bookings.endsAt,
    })
    .from(bookings)
    .innerJoin(assets, eq(assets.id, bookings.assetId))
    .where(
      and(
        inArray(bookings.status, ["upcoming", "ongoing"]),
        sql`${bookings.endsAt} < now()`,
      ),
    );

  return rows.map((r) => {
    const endsAt = (r.endsAt as Date).toISOString();
    return {
      bookingId: r.bookingId,
      assetId: r.assetId,
      tag: r.tag,
      assetName: r.assetName,
      bookedBy: r.bookedBy,
      endsAt,
      daysOverdue: daysSince(endsAt),
      entityRef: `booking:${r.bookingId}`,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  The engine                                                                */
/* -------------------------------------------------------------------------- */

function overduePhrase(days: number): string {
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * Recipients who should hear about an overdue item: everyone who can act on it
 * (active admins + asset managers) plus, where known, the person holding it.
 */
async function alertRecipients(
  executor: DbExecutor,
  holderUserId: number | null,
  holderDepartmentId: number | null,
): Promise<number[]> {
  const managers = await executor
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.role, ["admin", "asset_manager"]),
        eq(users.status, "active"),
      ),
    );

  const recipients = new Set<number>(managers.map((m) => m.id));
  if (holderUserId) recipients.add(holderUserId);

  // Department-held item: loop in the department head so someone owns the return.
  if (holderDepartmentId) {
    const [dept] = await executor
      .select({ headId: departments.headId })
      .from(departments)
      .where(eq(departments.id, holderDepartmentId));
    if (dept?.headId) recipients.add(dept.headId);
  }

  return Array.from(recipients);
}

/**
 * Run the overdue sweep. Finds overdue allocations and bookings, notifies the
 * relevant users about any item that has not been alerted before, logs the
 * event, and returns the full current overdue set.
 *
 * Notifications and their audit-log entries are written in one transaction so a
 * partial failure never leaves an alert without its log (or vice versa).
 */
export async function checkOverdue(
  executor: DbExecutor = db,
): Promise<CheckOverdueResult> {
  const [overdueAllocations, overdueBookings] = await Promise.all([
    findOverdueAllocations(executor),
    findOverdueBookings(executor),
  ]);

  const refs = [
    ...overdueAllocations.map((a) => a.entityRef),
    ...overdueBookings.map((b) => b.entityRef),
  ];

  if (refs.length === 0) {
    return { allocations: [], bookings: [], newlyNotified: 0 };
  }

  // Which refs have already been alerted on a previous run?
  const alerted = await executor
    .select({ entityRef: notifications.entityRef })
    .from(notifications)
    .where(
      and(
        eq(notifications.category, "alert"),
        inArray(notifications.entityRef, refs),
      ),
    );
  const alreadyAlerted = new Set(alerted.map((n) => n.entityRef));

  const freshAllocations = overdueAllocations.filter(
    (a) => !alreadyAlerted.has(a.entityRef),
  );
  const freshBookings = overdueBookings.filter(
    (b) => !alreadyAlerted.has(b.entityRef),
  );

  if (freshAllocations.length === 0 && freshBookings.length === 0) {
    return {
      allocations: overdueAllocations,
      bookings: overdueBookings,
      newlyNotified: 0,
    };
  }

  let newlyNotified = 0;

  // One transaction for every write below: an alert and its audit-log entry
  // always commit together. When `executor` is itself a transaction this opens
  // a harmless savepoint.
  await executor.transaction(async (tx) => {
    for (const item of freshAllocations) {
      const recipients = await alertRecipients(
        tx,
        item.holderUserId,
        item.holderDepartmentId,
      );
      if (recipients.length === 0) continue;

      const message = `Overdue return: ${item.tag} (${item.assetName}) was due ${overduePhrase(
        item.daysOverdue,
      )}.`;

      await tx.insert(notifications).values(
        recipients.map((userId) => ({
          userId,
          category: "alert" as const,
          message,
          entityRef: item.entityRef,
        })),
      );
      newlyNotified += recipients.length;

      // System-initiated event (no human actor) — recorded for the audit trail.
      await logOverdue(tx, "allocation.overdue", "allocation", item.allocationId, {
        tag: item.tag,
        daysOverdue: item.daysOverdue,
        holderUserId: item.holderUserId,
        holderDepartmentId: item.holderDepartmentId,
      });
    }

    for (const item of freshBookings) {
      const recipients = await alertRecipients(tx, item.bookedBy, null);
      if (recipients.length === 0) continue;

      const message = `Overdue booking: ${item.tag} (${item.assetName}) was not returned; the booking window closed ${overduePhrase(
        item.daysOverdue,
      )}.`;

      await tx.insert(notifications).values(
        recipients.map((userId) => ({
          userId,
          category: "alert" as const,
          message,
          entityRef: item.entityRef,
        })),
      );
      newlyNotified += recipients.length;

      await logOverdue(tx, "booking.overdue", "booking", item.bookingId, {
        tag: item.tag,
        daysOverdue: item.daysOverdue,
        bookedBy: item.bookedBy,
      });
    }
  });

  return {
    allocations: overdueAllocations,
    bookings: overdueBookings,
    newlyNotified,
  };
}

/* -------------------------------------------------------------------------- */
/*  Internals                                                                 */
/* -------------------------------------------------------------------------- */

/** System-actor activity-log entry for an overdue event (actorId = null). */
async function logOverdue(
  tx: DbExecutor,
  action: string,
  entityType: string,
  entityId: number,
  after: Record<string, unknown>,
): Promise<void> {
  await logActivity(
    { actorId: null, action, entityType, entityId, after },
    tx,
  );
}
