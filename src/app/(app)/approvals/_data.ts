/**
 * Server-side data access for the Approval Inbox — a read-only aggregation layer.
 *
 * This module OWNS NO mutations. It only reads existing tables and shapes the
 * pending items that are awaiting the current manager's action into one unified
 * list. Approving/rejecting is delegated to the existing server actions the
 * Allocation and Maintenance screens already use (see the client component).
 *
 * Scope rules (mirror the existing business logic — we never widen it):
 *  - Pending TRANSFER requests (transfer_requests.status = 'requested').
 *    admin / asset_manager see all; dept_head is scoped to the department(s)
 *    they head or belong to (the existing approveTransfer action already permits
 *    dept_head, so these items are genuinely actionable for them).
 *  - Pending MAINTENANCE requests (maintenance_requests.status = 'pending') are
 *    shown to admin / asset_manager only. The existing transitionRequest action
 *    is gated to those two roles, so surfacing maintenance to a dept_head would
 *    show them actions they cannot perform. We deliberately omit it for them.
 */
import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Session } from "@/core/auth/session";
import { db } from "@/core/db";
import {
  assets,
  departments,
  maintenanceRequests,
  transferRequests,
  users,
  type MaintenancePriority,
} from "@/core/db/schema";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export type ApprovalKind = "transfer" | "maintenance";

/** One row in the unified inbox. Kind-specific fields are optional. */
export interface ApprovalItem {
  kind: ApprovalKind;
  /** transfer_requests.id or maintenance_requests.id — the id the action needs. */
  id: number;
  assetId: number;
  assetTag: string;
  assetName: string;
  /** Person associated with raising the item (current holder / raiser). */
  raisedByName: string;
  /** ISO timestamp the request was created — used for the "2h ago" label. */
  createdAt: string;

  // Transfer-specific
  fromName?: string;
  toName?: string;
  reason?: string;

  // Maintenance-specific
  issue?: string;
  priority?: MaintenancePriority;
}

export interface ApprovalCounts {
  transfer: number;
  maintenance: number;
  total: number;
}

export interface ApprovalInbox {
  items: ApprovalItem[];
  counts: ApprovalCounts;
}

/* -------------------------------------------------------------------------- */
/*  Loader                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Aggregate everything awaiting `session`'s action. Read-only.
 * Callers must already have guaranteed the role (page redirect / route guard).
 */
export async function loadApprovalInbox(session: Session): Promise<ApprovalInbox> {
  const isManager = session.role === "admin" || session.role === "asset_manager";

  const [transfers, maintenance] = await Promise.all([
    loadPendingTransfers(session),
    // Maintenance is only actionable by admin/asset_manager (existing rule).
    isManager ? loadPendingMaintenance() : Promise.resolve<ApprovalItem[]>([]),
  ]);

  const items = [...transfers, ...maintenance].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return {
    items,
    counts: {
      transfer: transfers.length,
      maintenance: maintenance.length,
      total: items.length,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Pending transfers                                                         */
/* -------------------------------------------------------------------------- */

async function loadPendingTransfers(session: Session): Promise<ApprovalItem[]> {
  const fromUser = alias(users, "from_user");
  const toUser = alias(users, "to_user");

  const rows = await db
    .select({
      id: transferRequests.id,
      assetId: transferRequests.assetId,
      assetTag: assets.tag,
      assetName: assets.name,
      fromName: fromUser.name,
      fromDeptId: fromUser.departmentId,
      toName: toUser.name,
      toDeptId: toUser.departmentId,
      reason: transferRequests.reason,
      createdAt: transferRequests.createdAt,
    })
    .from(transferRequests)
    .innerJoin(assets, eq(assets.id, transferRequests.assetId))
    .innerJoin(fromUser, eq(fromUser.id, transferRequests.fromUserId))
    .innerJoin(toUser, eq(toUser.id, transferRequests.toUserId))
    .where(eq(transferRequests.status, "requested"))
    .orderBy(desc(transferRequests.createdAt));

  // dept_head only sees transfers touching their own department(s).
  let visible = rows;
  if (session.role === "dept_head") {
    const deptIds = await departmentScope(session);
    visible = rows.filter(
      (r) =>
        (r.fromDeptId != null && deptIds.has(r.fromDeptId)) ||
        (r.toDeptId != null && deptIds.has(r.toDeptId)),
    );
  }

  return visible.map((r) => ({
    kind: "transfer" as const,
    id: r.id,
    assetId: r.assetId,
    assetTag: r.assetTag,
    assetName: r.assetName,
    // The requester isn't stored on the request; the current holder is the
    // most meaningful "from" party, so we surface them as the origin.
    raisedByName: r.fromName,
    fromName: r.fromName,
    toName: r.toName,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Pending maintenance                                                       */
/* -------------------------------------------------------------------------- */

async function loadPendingMaintenance(): Promise<ApprovalItem[]> {
  const raiser = alias(users, "raiser");

  const rows = await db
    .select({
      id: maintenanceRequests.id,
      assetId: maintenanceRequests.assetId,
      assetTag: assets.tag,
      assetName: assets.name,
      raisedByName: raiser.name,
      issue: maintenanceRequests.issue,
      priority: maintenanceRequests.priority,
      createdAt: maintenanceRequests.createdAt,
    })
    .from(maintenanceRequests)
    .innerJoin(assets, eq(assets.id, maintenanceRequests.assetId))
    .innerJoin(raiser, eq(raiser.id, maintenanceRequests.raisedBy))
    .where(eq(maintenanceRequests.status, "pending"))
    .orderBy(desc(maintenanceRequests.createdAt));

  return rows.map((r) => ({
    kind: "maintenance" as const,
    id: r.id,
    assetId: r.assetId,
    assetTag: r.assetTag,
    assetName: r.assetName,
    raisedByName: r.raisedByName,
    issue: r.issue,
    priority: r.priority,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The set of department ids a dept_head is responsible for: the department(s)
 * they head, plus the department they belong to. Empty set → they see nothing,
 * which is the correct "scoped to their department where possible" fallback.
 */
async function departmentScope(session: Session): Promise<Set<number>> {
  const [me] = await db
    .select({ departmentId: users.departmentId })
    .from(users)
    .where(eq(users.id, session.userId));

  const headed = await db
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.headId, session.userId), eq(departments.status, "active")));

  const deptIds = new Set<number>();
  if (me?.departmentId != null) deptIds.add(me.departmentId);
  for (const d of headed) deptIds.add(d.id);
  return deptIds;
}

/** Roles allowed to use the Approval Inbox (page, route, and nav visibility). */
export const APPROVAL_ROLES = ["admin", "asset_manager", "dept_head"] as const;
