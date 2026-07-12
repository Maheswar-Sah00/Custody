/**
 * Server-side data access for the Assets screen (directory + detail).
 * Read-only — every mutation lives in actions.ts. Imported by the server
 * components; results are handed to the client as initial props.
 */
import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/core/db";
import {
  allocations,
  assetCategories,
  assets,
  departments,
  maintenanceRequests,
  users,
  type AssetStatus,
  type AllocationStatus,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/core/db/schema";
import { assetAttributes } from "./_schema";

/* -------------------------------------------------------------------------- */
/*  Directory                                                                 */
/* -------------------------------------------------------------------------- */

export interface AssetDirectoryRow {
  id: number;
  tag: string;
  name: string;
  categoryId: number;
  categoryName: string;
  status: AssetStatus;
  location: string | null;
  serialNumber: string | null;
  qrData: string;
  isBookable: boolean;
  /** Department currently responsible for the asset (via its active allocation). */
  departmentId: number | null;
  departmentName: string | null;
}

/**
 * Every asset with its category name and — when it is currently allocated — the
 * department responsible for it (the holding department, or the holder's own
 * department). The derived department powers the directory's Department filter,
 * since assets have no department column of their own.
 */
export async function loadAssetsDirectory(): Promise<AssetDirectoryRow[]> {
  const holder = alias(users, "holder_user");

  const rows = await db
    .select({
      id: assets.id,
      tag: assets.tag,
      name: assets.name,
      categoryId: assets.categoryId,
      categoryName: assetCategories.name,
      status: assets.status,
      location: assets.location,
      serialNumber: assets.serialNumber,
      qrData: assets.qrData,
      isBookable: assets.isBookable,
      holderDepartmentId: allocations.holderDepartmentId,
      holderUserDepartmentId: holder.departmentId,
    })
    .from(assets)
    .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
    .leftJoin(
      allocations,
      and(eq(allocations.assetId, assets.id), eq(allocations.status, "active")),
    )
    .leftJoin(holder, eq(holder.id, allocations.holderUserId))
    .orderBy(asc(assets.tag));

  // Resolve the derived department name in a second small pass (kept simple and
  // readable rather than a third join alias on departments).
  const deptNames = new Map<number, string>();
  const deptRows = await db
    .select({ id: departments.id, name: departments.name })
    .from(departments);
  for (const d of deptRows) deptNames.set(d.id, d.name);

  return rows.map((r) => {
    const departmentId = r.holderDepartmentId ?? r.holderUserDepartmentId ?? null;
    return {
      id: r.id,
      tag: r.tag,
      name: r.name,
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      status: r.status,
      location: r.location,
      serialNumber: r.serialNumber,
      qrData: r.qrData,
      isBookable: r.isBookable,
      departmentId,
      departmentName: departmentId ? deptNames.get(departmentId) ?? null : null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Detail                                                                    */
/* -------------------------------------------------------------------------- */

export interface AllocationHistoryRow {
  id: number;
  holderName: string;
  holderType: "user" | "department";
  allocatedAt: string;
  expectedReturnDate: string | null;
  returnedAt: string | null;
  status: AllocationStatus;
  checkinConditionNotes: string | null;
}

export interface MaintenanceHistoryRow {
  id: number;
  issue: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  technicianName: string | null;
  createdAt: string;
}

export interface AssetDetail {
  id: number;
  tag: string;
  name: string;
  categoryId: number;
  categoryName: string;
  serialNumber: string | null;
  acquisitionDate: string | null;
  acquisitionCost: string | null;
  condition: string | null;
  location: string | null;
  status: AssetStatus;
  isBookable: boolean;
  photoPath: string | null;
  qrData: string;
  createdAt: string;
  /** Field key → human label, from the category definition. */
  customFieldDefs: Record<string, string>;
  /** Field key → stored value for this asset. */
  customValues: Record<string, string>;
  allocationHistory: AllocationHistoryRow[];
  maintenanceHistory: MaintenanceHistoryRow[];
}

export async function loadAssetDetail(id: number): Promise<AssetDetail | null> {
  const [row] = await db
    .select({
      id: assets.id,
      tag: assets.tag,
      name: assets.name,
      categoryId: assets.categoryId,
      categoryName: assetCategories.name,
      customFieldDefs: assetCategories.customFields,
      serialNumber: assets.serialNumber,
      acquisitionDate: assets.acquisitionDate,
      acquisitionCost: assets.acquisitionCost,
      condition: assets.condition,
      location: assets.location,
      status: assets.status,
      isBookable: assets.isBookable,
      photoPath: assets.photoPath,
      qrData: assets.qrData,
      createdAt: assets.createdAt,
    })
    .from(assets)
    .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
    .where(eq(assets.id, id));

  if (!row) return null;

  const holder = alias(users, "holder_user");
  const [attrRow, allocationRows, maintenanceRows] = await Promise.all([
    db
      .select({ values: assetAttributes.values })
      .from(assetAttributes)
      .where(eq(assetAttributes.assetId, id)),
    db
      .select({
        id: allocations.id,
        holderUserId: allocations.holderUserId,
        holderUserName: holder.name,
        holderDepartmentId: allocations.holderDepartmentId,
        holderDepartmentName: departments.name,
        allocatedAt: allocations.allocatedAt,
        expectedReturnDate: allocations.expectedReturnDate,
        returnedAt: allocations.returnedAt,
        status: allocations.status,
        checkinConditionNotes: allocations.checkinConditionNotes,
      })
      .from(allocations)
      .leftJoin(holder, eq(holder.id, allocations.holderUserId))
      .leftJoin(departments, eq(departments.id, allocations.holderDepartmentId))
      .where(eq(allocations.assetId, id))
      .orderBy(desc(allocations.allocatedAt)),
    db
      .select({
        id: maintenanceRequests.id,
        issue: maintenanceRequests.issue,
        priority: maintenanceRequests.priority,
        status: maintenanceRequests.status,
        technicianName: maintenanceRequests.technicianName,
        createdAt: maintenanceRequests.createdAt,
      })
      .from(maintenanceRequests)
      .where(eq(maintenanceRequests.assetId, id))
      .orderBy(desc(maintenanceRequests.createdAt)),
  ]);

  return {
    id: row.id,
    tag: row.tag,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    serialNumber: row.serialNumber,
    acquisitionDate: row.acquisitionDate,
    acquisitionCost: row.acquisitionCost,
    condition: row.condition,
    location: row.location,
    status: row.status,
    isBookable: row.isBookable,
    photoPath: row.photoPath,
    qrData: row.qrData,
    createdAt: row.createdAt.toISOString(),
    customFieldDefs: (row.customFieldDefs ?? {}) as Record<string, string>,
    customValues: (attrRow[0]?.values ?? {}) as Record<string, string>,
    allocationHistory: allocationRows.map((a) => ({
      id: a.id,
      holderName: a.holderUserName ?? a.holderDepartmentName ?? "Unknown",
      holderType: a.holderDepartmentId ? "department" : "user",
      allocatedAt: a.allocatedAt.toISOString(),
      expectedReturnDate: a.expectedReturnDate,
      returnedAt: a.returnedAt ? a.returnedAt.toISOString() : null,
      status: a.status,
      checkinConditionNotes: a.checkinConditionNotes,
    })),
    maintenanceHistory: maintenanceRows.map((m) => ({
      id: m.id,
      issue: m.issue,
      priority: m.priority,
      status: m.status,
      technicianName: m.technicianName,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
