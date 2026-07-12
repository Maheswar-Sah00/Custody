/**
 * Server-side data access for the Allocation & Transfer screen. Read-only — all
 * mutations live in actions.ts. Loads every asset with its current allocation
 * state (who holds it, whether it is overdue), a recent allocation-history feed,
 * and the queue of pending transfer requests.
 */
import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/core/db";
import {
  allocations,
  assetCategories,
  assets,
  departments,
  transferRequests,
  users,
  type AllocationStatus,
  type AssetStatus,
} from "@/core/db/schema";
import { findOverdueAllocations } from "@/core/overdue";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export interface CurrentHolder {
  allocationId: number;
  holderType: "user" | "department";
  /** users.id or departments.id depending on holderType. */
  holderId: number;
  holderName: string;
  /** Department context for display (holder's dept, or the holding dept itself). */
  departmentName: string | null;
  allocatedAt: string;
  expectedReturnDate: string | null;
  isOverdue: boolean;
  daysOverdue: number;
}

export interface AllocatableAsset {
  id: number;
  tag: string;
  name: string;
  status: AssetStatus;
  categoryName: string;
  /** Present when the asset currently has an active allocation. */
  current: CurrentHolder | null;
}

export interface AllocationEvent {
  id: number;
  assetId: number;
  tag: string;
  assetName: string;
  holderName: string;
  holderType: "user" | "department";
  departmentName: string | null;
  status: AllocationStatus;
  allocatedAt: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  checkinConditionNotes: string | null;
}

export interface PendingTransfer {
  id: number;
  assetId: number;
  tag: string;
  assetName: string;
  fromUserId: number;
  fromName: string;
  toUserId: number;
  toName: string;
  reason: string;
  createdAt: string;
}

export interface AllocationData {
  assets: AllocatableAsset[];
  history: AllocationEvent[];
  pendingTransfers: PendingTransfer[];
}

/* -------------------------------------------------------------------------- */
/*  Loader                                                                    */
/* -------------------------------------------------------------------------- */

export async function loadAllocationData(): Promise<AllocationData> {
  const holder = alias(users, "holder_user");
  const fromUser = alias(users, "from_user");
  const toUser = alias(users, "to_user");

  const [deptRows, overdue, activeRows, historyRows, transferRows] =
    await Promise.all([
      db.select({ id: departments.id, name: departments.name }).from(departments),

      // Authoritative overdue set from the core overdue engine.
      findOverdueAllocations(),

      // Active allocations, keyed by asset, with holder details.
      db
        .select({
          allocationId: allocations.id,
          assetId: allocations.assetId,
          holderUserId: allocations.holderUserId,
          holderUserName: holder.name,
          holderUserDeptId: holder.departmentId,
          holderDepartmentId: allocations.holderDepartmentId,
          allocatedAt: allocations.allocatedAt,
          expectedReturnDate: allocations.expectedReturnDate,
        })
        .from(allocations)
        .leftJoin(holder, eq(holder.id, allocations.holderUserId))
        .where(eq(allocations.status, "active")),

      // Recent allocation history across all assets.
      db
        .select({
          id: allocations.id,
          assetId: allocations.assetId,
          tag: assets.tag,
          assetName: assets.name,
          holderUserName: holder.name,
          holderUserDeptId: holder.departmentId,
          holderDepartmentId: allocations.holderDepartmentId,
          status: allocations.status,
          allocatedAt: allocations.allocatedAt,
          expectedReturnDate: allocations.expectedReturnDate,
          returnedAt: allocations.returnedAt,
          checkinConditionNotes: allocations.checkinConditionNotes,
        })
        .from(allocations)
        .innerJoin(assets, eq(assets.id, allocations.assetId))
        .leftJoin(holder, eq(holder.id, allocations.holderUserId))
        .orderBy(desc(allocations.allocatedAt))
        .limit(50),

      // Pending transfer requests (the approvals queue).
      db
        .select({
          id: transferRequests.id,
          assetId: transferRequests.assetId,
          tag: assets.tag,
          assetName: assets.name,
          fromUserId: transferRequests.fromUserId,
          fromName: fromUser.name,
          toUserId: transferRequests.toUserId,
          toName: toUser.name,
          reason: transferRequests.reason,
          createdAt: transferRequests.createdAt,
        })
        .from(transferRequests)
        .innerJoin(assets, eq(assets.id, transferRequests.assetId))
        .innerJoin(fromUser, eq(fromUser.id, transferRequests.fromUserId))
        .innerJoin(toUser, eq(toUser.id, transferRequests.toUserId))
        .where(eq(transferRequests.status, "requested"))
        .orderBy(desc(transferRequests.createdAt)),
    ]);

  const deptName = (id: number | null | undefined): string | null =>
    id == null ? null : deptRows.find((d) => d.id === id)?.name ?? null;

  const overdueById = new Map(overdue.map((o) => [o.allocationId, o]));

  // Current holder per asset.
  const currentByAsset = new Map<number, CurrentHolder>();
  for (const r of activeRows) {
    const isDept = r.holderDepartmentId != null;
    const od = overdueById.get(r.allocationId);
    currentByAsset.set(r.assetId, {
      allocationId: r.allocationId,
      holderType: isDept ? "department" : "user",
      holderId: isDept ? r.holderDepartmentId! : r.holderUserId!,
      holderName: isDept
        ? deptName(r.holderDepartmentId) ?? "Department"
        : r.holderUserName ?? "Unknown",
      departmentName: isDept
        ? deptName(r.holderDepartmentId)
        : deptName(r.holderUserDeptId),
      allocatedAt: r.allocatedAt.toISOString(),
      expectedReturnDate: r.expectedReturnDate,
      isOverdue: !!od,
      daysOverdue: od?.daysOverdue ?? 0,
    });
  }

  // All assets with category name.
  const assetRows = await db
    .select({
      id: assets.id,
      tag: assets.tag,
      name: assets.name,
      status: assets.status,
      categoryName: assetCategories.name,
    })
    .from(assets)
    .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
    .orderBy(asc(assets.tag));

  const assetsOut: AllocatableAsset[] = assetRows.map((a) => ({
    id: a.id,
    tag: a.tag,
    name: a.name,
    status: a.status,
    categoryName: a.categoryName,
    current: currentByAsset.get(a.id) ?? null,
  }));

  const history: AllocationEvent[] = historyRows.map((r) => {
    const isDept = r.holderDepartmentId != null;
    return {
      id: r.id,
      assetId: r.assetId,
      tag: r.tag,
      assetName: r.assetName,
      holderName: isDept
        ? deptName(r.holderDepartmentId) ?? "Department"
        : r.holderUserName ?? "Unknown",
      holderType: isDept ? "department" : "user",
      departmentName: isDept
        ? deptName(r.holderDepartmentId)
        : deptName(r.holderUserDeptId),
      status: r.status,
      allocatedAt: r.allocatedAt.toISOString(),
      expectedReturnDate: r.expectedReturnDate,
      returnedAt: r.returnedAt ? r.returnedAt.toISOString() : null,
      checkinConditionNotes: r.checkinConditionNotes,
    };
  });

  const pendingTransfers: PendingTransfer[] = transferRows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    tag: r.tag,
    assetName: r.assetName,
    fromUserId: r.fromUserId,
    fromName: r.fromName,
    toUserId: r.toUserId,
    toName: r.toName,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));

  return { assets: assetsOut, history, pendingTransfers };
}
