/**
 * Server-side data access for the Maintenance board. Read-only — every mutation
 * lives in actions.ts. Loads every maintenance request joined to its asset (tag,
 * name, current status, photo) and the raiser's name, ready to be bucketed into
 * the five Kanban columns by the client.
 */
import "server-only";

import { asc, desc, eq, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/core/db";
import {
  assetCategories,
  assets,
  maintenanceRequests,
  users,
  type AssetStatus,
  type MaintenancePriority,
  type MaintenanceStatus,
} from "@/core/db/schema";

/* -------------------------------------------------------------------------- */
/*  Shapes                                                                    */
/* -------------------------------------------------------------------------- */

export interface MaintenanceCard {
  id: number;
  assetId: number;
  assetTag: string;
  assetName: string;
  assetStatus: AssetStatus;
  issue: string;
  priority: MaintenancePriority;
  photoPath: string | null;
  status: MaintenanceStatus;
  technicianName: string | null;
  raisedById: number;
  raisedByName: string;
  decidedByName: string | null;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Loader                                                                    */
/* -------------------------------------------------------------------------- */

export async function loadMaintenanceRequests(): Promise<MaintenanceCard[]> {
  const raiser = alias(users, "raiser");
  const decider = alias(users, "decider");

  const rows = await db
    .select({
      id: maintenanceRequests.id,
      assetId: maintenanceRequests.assetId,
      assetTag: assets.tag,
      assetName: assets.name,
      assetStatus: assets.status,
      issue: maintenanceRequests.issue,
      priority: maintenanceRequests.priority,
      photoPath: maintenanceRequests.photoPath,
      status: maintenanceRequests.status,
      technicianName: maintenanceRequests.technicianName,
      raisedById: maintenanceRequests.raisedBy,
      raisedByName: raiser.name,
      decidedByName: decider.name,
      createdAt: maintenanceRequests.createdAt,
    })
    .from(maintenanceRequests)
    .innerJoin(assets, eq(assets.id, maintenanceRequests.assetId))
    .innerJoin(raiser, eq(raiser.id, maintenanceRequests.raisedBy))
    .leftJoin(decider, eq(decider.id, maintenanceRequests.decidedBy))
    .orderBy(desc(maintenanceRequests.createdAt));

  return rows.map((r) => ({
    id: r.id,
    assetId: r.assetId,
    assetTag: r.assetTag,
    assetName: r.assetName,
    assetStatus: r.assetStatus,
    issue: r.issue,
    priority: r.priority,
    photoPath: r.photoPath,
    status: r.status,
    technicianName: r.technicianName,
    raisedById: r.raisedById,
    raisedByName: r.raisedByName,
    decidedByName: r.decidedByName,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Asset picklist for the "Raise request" form                               */
/* -------------------------------------------------------------------------- */

export interface MaintenanceAssetOption {
  id: number;
  tag: string;
  name: string;
  categoryName: string;
  status: AssetStatus;
}

/** Assets a request can be raised against — excludes retired/disposed items. */
export async function loadMaintenanceAssets(): Promise<MaintenanceAssetOption[]> {
  const rows = await db
    .select({
      id: assets.id,
      tag: assets.tag,
      name: assets.name,
      categoryName: assetCategories.name,
      status: assets.status,
    })
    .from(assets)
    .innerJoin(assetCategories, eq(assetCategories.id, assets.categoryId))
    .where(notInArray(assets.status, ["retired", "disposed"]))
    .orderBy(asc(assets.tag));

  return rows;
}
