/**
 * Server-side data access for the Dashboard ("Today's Overview"). Read-only.
 *
 * Everything the dashboard shows is computed live from the DB on each request:
 *   - six headline KPI counts (see {@link loadDashboardKpis}),
 *   - the current overdue set (via the core overdue read helpers — no writes),
 *   - a short "recent activity" feed off the shared activity log.
 *
 * The same loaders back both the server component (which renders them directly)
 * and GET /api/dashboard, so the numbers can never drift between the two.
 */
import "server-only";

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/core/db";
import {
  activityLogs,
  allocations,
  assets,
  bookings,
  maintenanceRequests,
  transferRequests,
  users,
} from "@/core/db/schema";
import { findOverdueAllocations, findOverdueBookings } from "@/core/overdue";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export interface DashboardKpis {
  /** Assets sitting in inventory, ready to hand out. */
  assetsAvailable: number;
  /** Assets currently checked out to a user or department. */
  assetsAllocated: number;
  /** Open maintenance requests (pending → in progress) needing attention. */
  maintenanceToday: number;
  /** Live resource holds — bookings whose window hasn't closed yet. */
  activeBookings: number;
  /** Transfer requests awaiting an approve/reject decision. */
  pendingTransfers: number;
  /** Active allocations due back today or later (overdue ones excluded). */
  upcomingReturns: number;
}

export interface DashboardOverdue {
  /** Overdue allocations + overdue bookings combined. */
  total: number;
  allocations: number;
  bookings: number;
}

export interface RecentActivityEntry {
  id: number;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number;
  after: unknown;
  before: unknown;
  createdAt: string;
}

export interface DashboardData {
  kpis: DashboardKpis;
  overdue: DashboardOverdue;
  activity: RecentActivityEntry[];
}

/* -------------------------------------------------------------------------- */
/*  Statuses that count as "open maintenance" / "active booking"              */
/* -------------------------------------------------------------------------- */

/** Maintenance rows still in flight (everything except the terminal states). */
const OPEN_MAINTENANCE = [
  "pending",
  "approved",
  "assigned",
  "in_progress",
] as const;

/* -------------------------------------------------------------------------- */
/*  KPI counts                                                                */
/* -------------------------------------------------------------------------- */

/** The six headline numbers, each a single COUNT, all issued in parallel. */
export async function loadDashboardKpis(): Promise<DashboardKpis> {
  const [
    available,
    allocated,
    maintenance,
    activeBookings,
    pendingTransfers,
    upcomingReturns,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(assets)
      .where(eq(assets.status, "available")),

    db
      .select({ value: count() })
      .from(assets)
      .where(eq(assets.status, "allocated")),

    db
      .select({ value: count() })
      .from(maintenanceRequests)
      .where(inArray(maintenanceRequests.status, [...OPEN_MAINTENANCE])),

    // Live holds: still marked upcoming/ongoing and the window hasn't ended.
    db
      .select({ value: count() })
      .from(bookings)
      .where(
        and(
          inArray(bookings.status, ["upcoming", "ongoing"]),
          sql`${bookings.endsAt} > now()`,
        ),
      ),

    db
      .select({ value: count() })
      .from(transferRequests)
      .where(eq(transferRequests.status, "requested")),

    // Due today or later — overdue allocations (return date already past) are
    // deliberately excluded so they only ever show in the red banner.
    db
      .select({ value: count() })
      .from(allocations)
      .where(
        and(
          eq(allocations.status, "active"),
          sql`${allocations.expectedReturnDate} >= CURRENT_DATE`,
        ),
      ),
  ]);

  return {
    assetsAvailable: available[0].value,
    assetsAllocated: allocated[0].value,
    maintenanceToday: maintenance[0].value,
    activeBookings: activeBookings[0].value,
    pendingTransfers: pendingTransfers[0].value,
    upcomingReturns: upcomingReturns[0].value,
  };
}

/* -------------------------------------------------------------------------- */
/*  Overdue banner counts (read-only; no notifications side effects)          */
/* -------------------------------------------------------------------------- */

/**
 * Current overdue set for the banner. Uses the overdue engine's read helpers so
 * the dashboard render never writes alert notifications — the sweep that does
 * that runs from GET /api/overdue and the notification center.
 */
export async function loadDashboardOverdue(): Promise<DashboardOverdue> {
  const [overdueAllocations, overdueBookings] = await Promise.all([
    findOverdueAllocations(),
    findOverdueBookings(),
  ]);
  return {
    allocations: overdueAllocations.length,
    bookings: overdueBookings.length,
    total: overdueAllocations.length + overdueBookings.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  Recent activity feed                                                      */
/* -------------------------------------------------------------------------- */

/** The last `limit` activity-log entries, newest first, joined to the actor. */
export async function loadRecentActivity(
  limit = 5,
): Promise<RecentActivityEntry[]> {
  const rows = await db
    .select({
      id: activityLogs.id,
      actorName: users.name,
      action: activityLogs.action,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      after: activityLogs.after,
      before: activityLogs.before,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.actorId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    after: r.after,
    before: r.before,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Everything at once                                                        */
/* -------------------------------------------------------------------------- */

export async function loadDashboard(): Promise<DashboardData> {
  const [kpis, overdue, activity] = await Promise.all([
    loadDashboardKpis(),
    loadDashboardOverdue(),
    loadRecentActivity(5),
  ]);
  return { kpis, overdue, activity };
}
