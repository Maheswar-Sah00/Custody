"use server";

/**
 * Maintenance mutations.
 *
 * Two invariants make the board trustworthy:
 *  - Advancing a request through its lifecycle is only legal along a fixed path
 *    (see MAINT_NEXT). Anyone can *raise* a request; only asset managers/admins
 *    move it.
 *  - The asset's own lifecycle is kept in lock-step and every flip is validated
 *    with canTransition() from the core state machine BEFORE the status column is
 *    written:
 *       • approving / assigning a technician → asset becomes `under_maintenance`
 *       • resolving                          → asset returns to `available`
 *    Each auto-flip is logged, notified (category 'approval'), and returned to the
 *    client so it can raise the "AF-0062 → Under Maintenance" toast.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/core/activity-log";
import { getSession, type Session } from "@/core/auth/session";
import { db, type DbExecutor } from "@/core/db";
import {
  assets,
  maintenanceRequests,
  users,
  type AssetStatus,
  type MaintenanceStatus,
} from "@/core/db/schema";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors";
import { notify, notifyMany } from "@/core/notifications";
import { requireRole, requireSession } from "@/core/rbac";
import { canTransition } from "@/core/state-machine";

export type MaintenanceActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Legal forward moves for a maintenance request. */
const MAINT_NEXT: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  pending: ["approved", "rejected"],
  approved: ["assigned"],
  assigned: ["in_progress"],
  in_progress: ["resolved"],
  resolved: [],
  rejected: [],
};

/** Details of an auto asset-status flip, for the client toast + notification. */
export interface AssetFlip {
  tag: string;
  from: AssetStatus;
  to: AssetStatus;
}

/* -------------------------------------------------------------------------- */
/*  Raise a request (any signed-in user)                                      */
/* -------------------------------------------------------------------------- */

const raiseInput = z.object({
  assetId: z.coerce.number().int().positive(),
  issue: z.string().trim().min(1, "Describe the issue."),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  photoPath: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? null : v)),
});

export type RaiseInput = z.input<typeof raiseInput>;

export async function raiseRequest(
  raw: RaiseInput,
): Promise<MaintenanceActionResult<{ requestId: number }>> {
  try {
    const session = requireSession(await getSession());
    const input = raiseInput.parse(raw);

    const requestId = await db.transaction(async (tx) => {
      const [asset] = await tx
        .select({ id: assets.id, tag: assets.tag, name: assets.name })
        .from(assets)
        .where(eq(assets.id, input.assetId));
      if (!asset) throw new NotFoundError("Asset not found.");

      const [created] = await tx
        .insert(maintenanceRequests)
        .values({
          assetId: input.assetId,
          raisedBy: session.userId,
          issue: input.issue,
          priority: input.priority,
          photoPath: input.photoPath,
          status: "pending",
        })
        .returning();

      await logActivity(
        {
          actorId: session.userId,
          action: "maintenance.requested",
          entityType: "maintenance_request",
          entityId: created.id,
          after: {
            assetId: input.assetId,
            tag: asset.tag,
            issue: input.issue,
            priority: input.priority,
          },
        },
        tx,
      );

      // Ask the people who can approve it.
      const approvers = await managerIds(tx);
      await notifyMany(
        approvers,
        {
          category: "approval",
          message: `New maintenance request: ${asset.tag} (${asset.name}) — “${input.issue}”. Review to approve or reject.`,
          entityRef: `maintenance_request:${created.id}`,
        },
        tx,
      );

      return created.id;
    });

    revalidatePath("/maintenance");
    return { ok: true, requestId };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("raiseRequest failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Advance a request (asset managers / admins)                               */
/* -------------------------------------------------------------------------- */

const transitionInput = z.object({
  requestId: z.coerce.number().int().positive(),
  to: z.enum([
    "approved",
    "rejected",
    "assigned",
    "in_progress",
    "resolved",
  ]),
  /** Required when moving to `assigned`. */
  technicianName: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null ? null : v.trim() || null)),
});

export type TransitionInput = z.input<typeof transitionInput>;

export async function transitionRequest(
  raw: TransitionInput,
): Promise<MaintenanceActionResult<{ assetFlip: AssetFlip | null }>> {
  try {
    const session = requireRole(await getSession(), ["admin", "asset_manager"]);
    const input = transitionInput.parse(raw);

    const assetFlip = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(maintenanceRequests)
        .where(eq(maintenanceRequests.id, input.requestId))
        .for("update");
      if (!request) throw new NotFoundError("Maintenance request not found.");

      // Guard the maintenance lifecycle itself.
      const allowed = MAINT_NEXT[request.status];
      if (!allowed.includes(input.to)) {
        throw new ConflictError(
          `Can't move a ${label(request.status)} request to ${label(input.to)}.`,
        );
      }
      if (input.to === "assigned" && !input.technicianName) {
        throw new ValidationError("A technician name is required to assign.");
      }

      const [asset] = await tx
        .select()
        .from(assets)
        .where(eq(assets.id, request.assetId))
        .for("update");
      if (!asset) throw new NotFoundError("Asset not found.");

      // Apply the request move.
      await tx
        .update(maintenanceRequests)
        .set({
          status: input.to,
          technicianName:
            input.to === "assigned" ? input.technicianName : request.technicianName,
          decidedBy: session.userId,
        })
        .where(eq(maintenanceRequests.id, input.requestId));

      await logActivity(
        {
          actorId: session.userId,
          action: `maintenance.${input.to}`,
          entityType: "maintenance_request",
          entityId: input.requestId,
          before: { status: request.status },
          after: {
            status: input.to,
            technicianName:
              input.to === "assigned" ? input.technicianName : request.technicianName,
          },
        },
        tx,
      );

      // Notify the raiser of the decision/progress.
      await notify(
        {
          userId: request.raisedBy,
          category: "approval",
          message: `Your maintenance request for ${asset.tag} (${asset.name}) is now ${label(
            input.to,
          )}${input.to === "assigned" ? ` — ${input.technicianName}` : ""}.`,
          entityRef: `maintenance_request:${input.requestId}`,
        },
        tx,
      );

      // ---- Auto asset-status flip (the second showcase) -------------------
      let flip: AssetFlip | null = null;

      const wantsUnderMaintenance =
        input.to === "approved" || input.to === "assigned";
      const wantsAvailable = input.to === "resolved";

      if (wantsUnderMaintenance && asset.status !== "under_maintenance") {
        if (!canTransition(asset.status, "under_maintenance", session.role)) {
          throw new ValidationError(
            `${asset.tag} is ${label(asset.status)} and can't be moved to Under Maintenance.`,
          );
        }
        flip = await flipAsset(
          tx,
          session,
          asset.id,
          asset.tag,
          asset.name,
          asset.status,
          "under_maintenance",
        );
      } else if (wantsAvailable && asset.status === "under_maintenance") {
        if (!canTransition("under_maintenance", "available", session.role)) {
          throw new ValidationError(
            `${asset.tag} can't be returned to Available by your role.`,
          );
        }
        flip = await flipAsset(
          tx,
          session,
          asset.id,
          asset.tag,
          asset.name,
          "under_maintenance",
          "available",
        );
      }

      return flip;
    });

    revalidatePath("/maintenance");
    revalidatePath("/assets");
    return { ok: true, assetFlip };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("transitionRequest failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Flip an asset's status (already validated), log it, and notify managers. */
async function flipAsset(
  tx: DbExecutor,
  session: Session,
  assetId: number,
  tag: string,
  name: string,
  from: AssetStatus,
  to: AssetStatus,
): Promise<AssetFlip> {
  await tx.update(assets).set({ status: to }).where(eq(assets.id, assetId));

  await logActivity(
    {
      actorId: session.userId,
      action: "asset.status_changed",
      entityType: "asset",
      entityId: assetId,
      before: { status: from },
      after: { status: to, reason: "maintenance" },
    },
    tx,
  );

  const managers = await managerIds(tx);
  await notifyMany(
    managers,
    {
      category: "approval",
      message: `${tag} (${name}) → ${label(to)}.`,
      entityRef: `asset:${tag}`,
    },
    tx,
  );

  return { tag, from, to };
}

/** Active admins + asset managers. */
async function managerIds(tx: DbExecutor): Promise<number[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.role, ["admin", "asset_manager"]),
        eq(users.status, "active"),
      ),
    );
  return rows.map((r) => r.id);
}

/** "under_maintenance" → "Under Maintenance", "in_progress" → "In Progress". */
function label(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
