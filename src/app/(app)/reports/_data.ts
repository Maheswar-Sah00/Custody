/**
 * Server-side analytics for the Reports screen. Read-only — one loader,
 * {@link loadReports}, computes every card's data from the live tables and both
 * the page and GET /api/reports consume it.
 *
 * Nothing here is a materialized view or a nightly job; the numbers are always
 * current as of the request. Heavier shaping (filling missing months, building
 * the heatmap grid) is done in JS after a small set of grouped queries.
 */
import "server-only";

import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/core/db";
import {
  allocations,
  assets,
  bookings,
  departments,
  maintenanceRequests,
  users,
} from "@/core/db/schema";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export interface DeptUtilization {
  department: string;
  allocated: number;
}

export interface MaintenancePoint {
  /** Short month label, e.g. "Feb". */
  month: string;
  count: number;
}

export interface UsedAsset {
  tag: string;
  name: string;
  bookings: number;
}

export interface IdleAsset {
  tag: string;
  name: string;
  /** Whole days since the asset was last used. */
  daysIdle: number;
  /** True when it has never been allocated or booked. */
  neverUsed: boolean;
}

export interface LifecycleAsset {
  tag: string;
  name: string;
  /** Short reason chip, e.g. "In maintenance" or "Nearing retirement". */
  reason: string;
  /** Supporting detail, e.g. "6 yrs old". */
  detail: string;
}

export interface DeptAllocationRow {
  department: string;
  activeAllocations: number;
  overdue: number;
}

export interface Heatmap {
  /** grid[dayOfWeek 0..6][hour 0..23] = booking count. */
  grid: number[][];
  maxCount: number;
}

export interface ReportsData {
  utilizationByDept: DeptUtilization[];
  maintenanceFrequency: MaintenancePoint[];
  mostUsed: UsedAsset[];
  idleAssets: IdleAsset[];
  lifecycle: LifecycleAsset[];
  deptAllocationSummary: DeptAllocationRow[];
  heatmap: Heatmap;
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const IDLE_DAYS = 60;
const RETIREMENT_YEARS = 5;
const OPEN_MAINTENANCE = [
  "pending",
  "approved",
  "assigned",
  "in_progress",
] as const;
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* -------------------------------------------------------------------------- */
/*  Loader                                                                    */
/* -------------------------------------------------------------------------- */

export async function loadReports(): Promise<ReportsData> {
  const now = new Date();
  const holder = alias(users, "holder_user");

  const [
    deptRows,
    activeAllocRows,
    maintByMonth,
    bookingsLast30,
    lastAllocByAsset,
    lastBookingByAsset,
    inventory,
    openMaintAssetRows,
    heatmapBookings,
  ] = await Promise.all([
    // Departments (for stable labels + a row per department).
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.status, "active"))
      .orderBy(asc(departments.name)),

    // Active allocations with the holder's department context + overdue flag.
    db
      .select({
        holderDepartmentId: allocations.holderDepartmentId,
        holderUserDeptId: holder.departmentId,
        expectedReturnDate: allocations.expectedReturnDate,
      })
      .from(allocations)
      .leftJoin(holder, eq(holder.id, allocations.holderUserId))
      .where(eq(allocations.status, "active")),

    // Maintenance requests grouped by calendar month.
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${maintenanceRequests.createdAt}), 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(maintenanceRequests)
      .groupBy(sql`date_trunc('month', ${maintenanceRequests.createdAt})`),

    // Bookings in the last 30 days per asset (excludes cancelled).
    db
      .select({
        assetId: bookings.assetId,
        tag: assets.tag,
        name: assets.name,
        count: sql<number>`count(*)::int`,
      })
      .from(bookings)
      .innerJoin(assets, eq(assets.id, bookings.assetId))
      .where(
        and(
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, new Date(now.getTime() - 30 * MS_PER_DAY)),
        ),
      )
      .groupBy(bookings.assetId, assets.tag, assets.name)
      .orderBy(desc(sql`count(*)`))
      .limit(6),

    // Most recent allocation per asset.
    db
      .select({
        assetId: allocations.assetId,
        last: sql<string>`max(${allocations.allocatedAt})`,
      })
      .from(allocations)
      .groupBy(allocations.assetId),

    // Most recent booking per asset (excludes cancelled).
    db
      .select({
        assetId: bookings.assetId,
        last: sql<string>`max(${bookings.startsAt})`,
      })
      .from(bookings)
      .where(ne(bookings.status, "cancelled"))
      .groupBy(bookings.assetId),

    // Inventory snapshot for idle + lifecycle analysis (drop disposed).
    db
      .select({
        id: assets.id,
        tag: assets.tag,
        name: assets.name,
        status: assets.status,
        acquisitionDate: assets.acquisitionDate,
        createdAt: assets.createdAt,
      })
      .from(assets)
      .where(ne(assets.status, "disposed"))
      .orderBy(asc(assets.tag)),

    // Assets with an open maintenance request.
    db
      .selectDistinct({ assetId: maintenanceRequests.assetId })
      .from(maintenanceRequests)
      .where(inArray(maintenanceRequests.status, [...OPEN_MAINTENANCE])),

    // Bookings for the heatmap (last 90 days, excludes cancelled).
    db
      .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
      .from(bookings)
      .where(
        and(
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, new Date(now.getTime() - 90 * MS_PER_DAY)),
        ),
      ),
  ]);

  /* ---- utilization + department allocation summary --------------------- */
  const perDept = new Map<number, { allocated: number; overdue: number }>();
  for (const d of deptRows) perDept.set(d.id, { allocated: 0, overdue: 0 });

  const todayISO = now.toISOString().slice(0, 10);
  for (const a of activeAllocRows) {
    const deptId = a.holderDepartmentId ?? a.holderUserDeptId;
    if (deptId == null) continue;
    const bucket = perDept.get(deptId) ?? { allocated: 0, overdue: 0 };
    bucket.allocated += 1;
    if (a.expectedReturnDate && a.expectedReturnDate < todayISO) {
      bucket.overdue += 1;
    }
    perDept.set(deptId, bucket);
  }

  const utilizationByDept: DeptUtilization[] = deptRows.map((d) => ({
    department: d.name,
    allocated: perDept.get(d.id)?.allocated ?? 0,
  }));

  const deptAllocationSummary: DeptAllocationRow[] = deptRows
    .map((d) => ({
      department: d.name,
      activeAllocations: perDept.get(d.id)?.allocated ?? 0,
      overdue: perDept.get(d.id)?.overdue ?? 0,
    }))
    .sort((a, b) => b.activeAllocations - a.activeAllocations);

  /* ---- maintenance frequency (last 6 months, gaps filled) -------------- */
  const maintCounts = new Map(maintByMonth.map((m) => [m.month, m.count]));
  const maintenanceFrequency: MaintenancePoint[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    maintenanceFrequency.push({
      month: MONTH_LABELS[d.getMonth()],
      count: maintCounts.get(key) ?? 0,
    });
  }

  /* ---- most used ------------------------------------------------------- */
  const mostUsed: UsedAsset[] = bookingsLast30.map((b) => ({
    tag: b.tag,
    name: b.name,
    bookings: b.count,
  }));

  /* ---- idle assets ----------------------------------------------------- */
  const lastAlloc = new Map(
    lastAllocByAsset.map((r) => [r.assetId, r.last ? new Date(r.last).getTime() : null]),
  );
  const lastBooking = new Map(
    lastBookingByAsset.map((r) => [r.assetId, r.last ? new Date(r.last).getTime() : null]),
  );

  const idleCandidates: IdleAsset[] = [];
  for (const a of inventory) {
    if (a.status === "retired") continue;
    const times = [lastAlloc.get(a.id), lastBooking.get(a.id)].filter(
      (t): t is number => typeof t === "number",
    );
    const lastUsed = times.length ? Math.max(...times) : null;
    const since = lastUsed ?? new Date(a.createdAt).getTime();
    const daysIdle = Math.floor((now.getTime() - since) / MS_PER_DAY);
    if (daysIdle >= IDLE_DAYS) {
      idleCandidates.push({
        tag: a.tag,
        name: a.name,
        daysIdle,
        neverUsed: lastUsed === null,
      });
    }
  }
  const idleAssets = idleCandidates
    .sort((a, b) => b.daysIdle - a.daysIdle)
    .slice(0, 6);

  /* ---- lifecycle: due for maintenance / nearing retirement ------------- */
  const openMaintAssets = new Set(openMaintAssetRows.map((r) => r.assetId));
  const lifecycle: LifecycleAsset[] = [];
  for (const a of inventory) {
    if (a.status === "under_maintenance" || openMaintAssets.has(a.id)) {
      lifecycle.push({
        tag: a.tag,
        name: a.name,
        reason: "In maintenance",
        detail:
          a.status === "under_maintenance" ? "Under maintenance" : "Request open",
      });
      continue;
    }
    if (a.acquisitionDate) {
      const ageMs = now.getTime() - new Date(a.acquisitionDate).getTime();
      const years = ageMs / (365.25 * MS_PER_DAY);
      if (years >= RETIREMENT_YEARS) {
        lifecycle.push({
          tag: a.tag,
          name: a.name,
          reason: "Nearing retirement",
          detail: `${Math.floor(years)} yrs old`,
        });
      }
    }
  }
  const lifecycleTop = lifecycle.slice(0, 8);

  /* ---- booking heatmap ------------------------------------------------- */
  const grid: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  let maxCount = 0;
  for (const b of heatmapBookings) {
    const start = new Date(b.startsAt);
    const end = new Date(b.endsAt);
    const dow = start.getDay();
    const startHour = start.getHours();
    // Count each hour the booking touches, clamped to its own day.
    const endHour =
      end.getDate() === start.getDate() &&
      end.getMonth() === start.getMonth() &&
      end.getFullYear() === start.getFullYear()
        ? Math.min(23, Math.max(startHour, end.getHours() - (end.getMinutes() === 0 ? 1 : 0)))
        : 23;
    for (let h = startHour; h <= endHour; h++) {
      grid[dow][h] += 1;
      if (grid[dow][h] > maxCount) maxCount = grid[dow][h];
    }
  }

  return {
    utilizationByDept,
    maintenanceFrequency,
    mostUsed,
    idleAssets,
    lifecycle: lifecycleTop,
    deptAllocationSummary,
    heatmap: { grid, maxCount },
    generatedAt: now.toISOString(),
  };
}
