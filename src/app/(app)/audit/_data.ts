/**
 * Server-side data access for the Asset Audit screen. Read-only — every
 * mutation (create cycle, set verification, close cycle) lives in actions.ts.
 *
 * The screen is organised around audit *cycles*: a named verification pass over
 * a scope (a department or a location) across a date range, worked by one or
 * more auditors. Each cycle owns a checklist of {@link AuditItemRow}s — one per
 * in-scope asset — whose three-state verification the auditors fill in.
 */
import "server-only";

import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type DbExecutor } from "@/core/db";
import {
  assets,
  auditCycleAuditors,
  auditCycles,
  auditItems,
  departments,
  users,
  type AuditCycleStatus,
  type AuditVerification,
} from "@/core/db/schema";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export interface Auditor {
  id: number;
  name: string;
}

export interface AuditCycleSummary {
  id: number;
  name: string;
  scopeDepartmentId: number | null;
  scopeDepartmentName: string | null;
  scopeLocation: string | null;
  startDate: string;
  endDate: string;
  status: AuditCycleStatus;
  createdAt: string;
  auditors: Auditor[];
  /** Total checklist items. */
  itemCount: number;
  verifiedCount: number;
  /** missing + damaged — the discrepancy count the amber banner shows. */
  flaggedCount: number;
  missingCount: number;
  damagedCount: number;
  pendingCount: number;
}

export interface AuditItemRow {
  id: number;
  assetId: number;
  tag: string;
  assetName: string;
  expectedLocation: string | null;
  verification: AuditVerification;
  auditorId: number | null;
  auditorName: string | null;
}

export interface AuditCycleDetail extends AuditCycleSummary {
  items: AuditItemRow[];
}

export interface CreateAuditOptions {
  departments: { id: number; name: string }[];
  /** Distinct, non-empty asset locations for the location-scope picker. */
  locations: string[];
  employees: { id: number; name: string }[];
}

/* -------------------------------------------------------------------------- */
/*  Cycle list (with auditors + verification tallies)                         */
/* -------------------------------------------------------------------------- */

/**
 * Every audit cycle, newest first, with its auditors and a breakdown of the
 * checklist verifications. Powers both the active-cycle view and the history.
 */
export async function loadAuditCycles(): Promise<AuditCycleSummary[]> {
  const [cycleRows, auditorRows, tallyRows] = await Promise.all([
    db
      .select({
        id: auditCycles.id,
        name: auditCycles.name,
        scopeDepartmentId: auditCycles.scopeDepartmentId,
        scopeDepartmentName: departments.name,
        scopeLocation: auditCycles.scopeLocation,
        startDate: auditCycles.startDate,
        endDate: auditCycles.endDate,
        status: auditCycles.status,
        createdAt: auditCycles.createdAt,
      })
      .from(auditCycles)
      .leftJoin(departments, eq(departments.id, auditCycles.scopeDepartmentId))
      .orderBy(desc(auditCycles.createdAt)),

    db
      .select({
        cycleId: auditCycleAuditors.cycleId,
        userId: auditCycleAuditors.userId,
        name: users.name,
      })
      .from(auditCycleAuditors)
      .innerJoin(users, eq(users.id, auditCycleAuditors.userId))
      .orderBy(asc(users.name)),

    db
      .select({
        cycleId: auditItems.cycleId,
        verification: auditItems.verification,
        value: sql<number>`count(*)::int`,
      })
      .from(auditItems)
      .groupBy(auditItems.cycleId, auditItems.verification),
  ]);

  const auditorsByCycle = new Map<number, Auditor[]>();
  for (const a of auditorRows) {
    const list = auditorsByCycle.get(a.cycleId) ?? [];
    list.push({ id: a.userId, name: a.name });
    auditorsByCycle.set(a.cycleId, list);
  }

  const tallyByCycle = new Map<number, Record<AuditVerification, number>>();
  for (const t of tallyRows) {
    const rec =
      tallyByCycle.get(t.cycleId) ??
      ({ pending: 0, verified: 0, missing: 0, damaged: 0 } as Record<
        AuditVerification,
        number
      >);
    rec[t.verification] = t.value;
    tallyByCycle.set(t.cycleId, rec);
  }

  return cycleRows.map((c) => {
    const tally = tallyByCycle.get(c.id) ?? {
      pending: 0,
      verified: 0,
      missing: 0,
      damaged: 0,
    };
    return {
      id: c.id,
      name: c.name,
      scopeDepartmentId: c.scopeDepartmentId,
      scopeDepartmentName: c.scopeDepartmentName,
      scopeLocation: c.scopeLocation,
      startDate: c.startDate,
      endDate: c.endDate,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      auditors: auditorsByCycle.get(c.id) ?? [],
      itemCount:
        tally.pending + tally.verified + tally.missing + tally.damaged,
      verifiedCount: tally.verified,
      missingCount: tally.missing,
      damagedCount: tally.damaged,
      flaggedCount: tally.missing + tally.damaged,
      pendingCount: tally.pending,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Single cycle with its checklist                                           */
/* -------------------------------------------------------------------------- */

export async function loadCycleDetail(
  cycleId: number,
): Promise<AuditCycleDetail | null> {
  const cycles = await loadAuditCycles();
  const summary = cycles.find((c) => c.id === cycleId);
  if (!summary) return null;

  const auditor = alias(users, "auditor");
  const itemRows = await db
    .select({
      id: auditItems.id,
      assetId: auditItems.assetId,
      tag: assets.tag,
      assetName: assets.name,
      expectedLocation: auditItems.expectedLocation,
      verification: auditItems.verification,
      auditorId: auditItems.auditorId,
      auditorName: auditor.name,
    })
    .from(auditItems)
    .innerJoin(assets, eq(assets.id, auditItems.assetId))
    .leftJoin(auditor, eq(auditor.id, auditItems.auditorId))
    .where(eq(auditItems.cycleId, cycleId))
    .orderBy(asc(assets.tag));

  return { ...summary, items: itemRows };
}

/**
 * Pick which cycle the screen opens on: the first still-open cycle, else the
 * most recently created one, else null (no cycles yet).
 */
export function pickDefaultCycleId(cycles: AuditCycleSummary[]): number | null {
  const open = cycles.find((c) => c.status === "open");
  if (open) return open.id;
  return cycles[0]?.id ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Options for the "create cycle" form                                       */
/* -------------------------------------------------------------------------- */

export async function loadCreateAuditOptions(): Promise<CreateAuditOptions> {
  const [deptRows, locationRows, employeeRows] = await Promise.all([
    db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.status, "active"))
      .orderBy(asc(departments.name)),

    db
      .selectDistinct({ location: assets.location })
      .from(assets)
      .where(isNotNull(assets.location))
      .orderBy(asc(assets.location)),

    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.status, "active"))
      .orderBy(asc(users.name)),
  ]);

  return {
    departments: deptRows,
    locations: locationRows
      .map((r) => r.location)
      .filter((l): l is string => !!l),
    employees: employeeRows,
  };
}

/* -------------------------------------------------------------------------- */
/*  Assets in scope (used by actions.ts when populating a new checklist)      */
/* -------------------------------------------------------------------------- */

export interface ScopedAsset {
  id: number;
  location: string | null;
}

/**
 * Resolve the assets a new cycle should audit.
 *
 *  - location scope → every asset whose `location` matches exactly.
 *  - department scope → every asset currently the department's responsibility,
 *    i.e. held (via an active allocation) by the department itself or by one of
 *    its members. Assets have no department column, so this mirrors how the
 *    assets/allocation screens derive an asset's responsible department.
 *
 * Excludes disposed assets — they are no longer physically present to verify.
 */
export async function assetsInScope(
  scope:
    | { type: "location"; location: string }
    | { type: "department"; departmentId: number },
  executor: DbExecutor = db,
): Promise<ScopedAsset[]> {
  if (scope.type === "location") {
    return executor
      .select({ id: assets.id, location: assets.location })
      .from(assets)
      .where(
        and(
          eq(assets.location, scope.location),
          sql`${assets.status} <> 'disposed'`,
        ),
      )
      .orderBy(asc(assets.tag));
  }

  // Department scope — asset is in scope when its single active allocation is
  // held by this department, or by a user who belongs to this department.
  return executor
    .select({ id: assets.id, location: assets.location })
    .from(assets)
    .where(
      and(
        sql`${assets.status} <> 'disposed'`,
        sql`EXISTS (
          SELECT 1 FROM allocations al
          LEFT JOIN users hu ON hu.id = al.holder_user_id
          WHERE al.asset_id = ${assets.id}
            AND al.status = 'active'
            AND (
              al.holder_department_id = ${scope.departmentId}
              OR hu.department_id = ${scope.departmentId}
            )
        )`,
      ),
    )
    .orderBy(asc(assets.tag));
}
