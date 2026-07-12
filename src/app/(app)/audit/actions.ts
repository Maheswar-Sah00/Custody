"use server";

/**
 * Asset Audit mutations. Three verbs:
 *
 *   1. createAuditCycle    — opens a cycle, records its auditors, and snapshots
 *                            the in-scope assets into a `pending` checklist.
 *   2. setItemVerification — an auditor marks one asset Verified/Missing/Damaged
 *                            (or back to pending). Drives the live discrepancy
 *                            banner on the client.
 *   3. closeAuditCycle     — locks the cycle, flips confirmed-missing assets to
 *                            `lost` (validated through canTransition), and files
 *                            an alert notification + activity-log entry for every
 *                            discrepancy.
 *
 * Every write goes through the shared activity-log wrapper; asset status changes
 * are validated with the core state machine, never hand-rolled.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/core/activity-log";
import { getSession } from "@/core/auth/session";
import { db, type DbExecutor } from "@/core/db";
import {
  assets,
  auditCycleAuditors,
  auditCycles,
  auditItems,
  users,
} from "@/core/db/schema";
import { ApiError, NotFoundError, ValidationError } from "@/core/errors";
import { notifyMany } from "@/core/notifications";
import { requireRole, requireSession } from "@/core/rbac";
import { canTransition } from "@/core/state-machine";

import { assetsInScope } from "./_data";

export type AuditActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/* -------------------------------------------------------------------------- */
/*  Create a cycle                                                            */
/* -------------------------------------------------------------------------- */

const createInput = z
  .object({
    name: z.string().trim().min(1, "Give the cycle a name."),
    scopeType: z.enum(["department", "location"]),
    departmentId: z.coerce.number().int().positive().optional(),
    location: z.string().trim().min(1).optional(),
    startDate: z.string().min(1, "Start date is required."),
    endDate: z.string().min(1, "End date is required."),
    auditorIds: z
      .array(z.coerce.number().int().positive())
      .min(1, "Assign at least one auditor."),
  })
  .refine(
    (v) => (v.scopeType === "department" ? !!v.departmentId : !!v.location),
    { message: "Choose the scope for the audit." },
  );

export type CreateAuditInput = z.input<typeof createInput>;

export async function createAuditCycle(
  raw: CreateAuditInput,
): Promise<AuditActionResult<{ cycleId: number; itemCount: number }>> {
  try {
    const session = requireRole(await getSession(), ["admin", "asset_manager"]);
    const input = createInput.parse(raw);

    if (input.endDate < input.startDate) {
      throw new ValidationError("The end date can't be before the start date.");
    }

    // De-dupe auditor ids and confirm they're all real, active users.
    const auditorIds = Array.from(new Set(input.auditorIds));
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, auditorIds), eq(users.status, "active")));
    if (existing.length !== auditorIds.length) {
      throw new ValidationError("One or more selected auditors are invalid.");
    }

    const scope =
      input.scopeType === "department"
        ? ({ type: "department", departmentId: input.departmentId! } as const)
        : ({ type: "location", location: input.location! } as const);

    const result = await db.transaction(async (tx) => {
      const [cycle] = await tx
        .insert(auditCycles)
        .values({
          name: input.name,
          scopeDepartmentId:
            scope.type === "department" ? scope.departmentId : null,
          scopeLocation: scope.type === "location" ? scope.location : null,
          startDate: input.startDate,
          endDate: input.endDate,
          status: "open",
        })
        .returning();

      await tx.insert(auditCycleAuditors).values(
        auditorIds.map((userId) => ({ cycleId: cycle.id, userId })),
      );

      // Snapshot the in-scope assets as pending checklist items. Expected
      // location is copied from each asset so a later move is detectable.
      const scoped = await assetsInScope(scope, tx);
      if (scoped.length > 0) {
        await tx.insert(auditItems).values(
          scoped.map((a) => ({
            cycleId: cycle.id,
            assetId: a.id,
            expectedLocation: a.location,
            verification: "pending" as const,
          })),
        );
      }

      await logActivity(
        {
          actorId: session.userId,
          action: "audit.created",
          entityType: "audit_cycle",
          entityId: cycle.id,
          after: {
            name: cycle.name,
            scopeType: scope.type,
            scopeDepartmentId: cycle.scopeDepartmentId,
            scopeLocation: cycle.scopeLocation,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            auditorIds,
            itemCount: scoped.length,
          },
        },
        tx,
      );

      return { cycleId: cycle.id, itemCount: scoped.length };
    });

    revalidatePath("/audit");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("createAuditCycle failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Set an item's verification                                               */
/* -------------------------------------------------------------------------- */

const verifyInput = z.object({
  itemId: z.coerce.number().int().positive(),
  verification: z.enum(["pending", "verified", "missing", "damaged"]),
});

export type SetVerificationInput = z.input<typeof verifyInput>;

export async function setItemVerification(
  raw: SetVerificationInput,
): Promise<
  AuditActionResult<{ itemId: number; verification: string; auditorName: string }>
> {
  try {
    const session = requireSession(await getSession());
    const input = verifyInput.parse(raw);

    const updated = await db.transaction(async (tx) => {
      const [item] = await tx
        .select({
          id: auditItems.id,
          cycleId: auditItems.cycleId,
          verification: auditItems.verification,
        })
        .from(auditItems)
        .where(eq(auditItems.id, input.itemId))
        .for("update");
      if (!item) throw new NotFoundError("Audit item not found.");

      const [cycle] = await tx
        .select({ id: auditCycles.id, status: auditCycles.status })
        .from(auditCycles)
        .where(eq(auditCycles.id, item.cycleId));
      if (!cycle) throw new NotFoundError("Audit cycle not found.");
      if (cycle.status === "closed") {
        throw new ValidationError("This audit cycle is closed.");
      }

      await assertCanAudit(tx, session, item.cycleId);

      await tx
        .update(auditItems)
        .set({
          verification: input.verification,
          auditorId: session.userId,
        })
        .where(eq(auditItems.id, input.itemId));

      await logActivity(
        {
          actorId: session.userId,
          action: "audit.item_verified",
          entityType: "audit_item",
          entityId: input.itemId,
          before: { verification: item.verification },
          after: { verification: input.verification, cycleId: item.cycleId },
        },
        tx,
      );

      return { verification: input.verification };
    });

    revalidatePath("/audit");
    return {
      ok: true,
      itemId: input.itemId,
      verification: updated.verification,
      auditorName: session.name,
    };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("setItemVerification failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Close a cycle                                                            */
/* -------------------------------------------------------------------------- */

const closeInput = z.object({
  cycleId: z.coerce.number().int().positive(),
});

export interface CloseSummary {
  /** Assets flipped to `lost` because they were confirmed missing. */
  lostCount: number;
  /** Total discrepancies (missing + damaged) reported. */
  discrepancyCount: number;
  /** Missing items the state machine wouldn't let us flip (already lost, etc.). */
  skippedLost: number;
}

export async function closeAuditCycle(
  raw: z.input<typeof closeInput>,
): Promise<AuditActionResult<CloseSummary>> {
  try {
    // Closing can flip assets to `lost`, which the state machine restricts to
    // asset managers / admins — so require that role to close.
    const session = requireRole(await getSession(), ["admin", "asset_manager"]);
    const { cycleId } = closeInput.parse(raw);

    const summary = await db.transaction(async (tx) => {
      const [cycle] = await tx
        .select()
        .from(auditCycles)
        .where(eq(auditCycles.id, cycleId))
        .for("update");
      if (!cycle) throw new NotFoundError("Audit cycle not found.");
      if (cycle.status === "closed") {
        throw new ValidationError("This audit cycle is already closed.");
      }

      // Every discrepancy on this cycle, joined to the asset it concerns.
      const discrepancies = await tx
        .select({
          itemId: auditItems.id,
          assetId: auditItems.assetId,
          tag: assets.tag,
          assetName: assets.name,
          assetStatus: assets.status,
          verification: auditItems.verification,
          expectedLocation: auditItems.expectedLocation,
        })
        .from(auditItems)
        .innerJoin(assets, eq(assets.id, auditItems.assetId))
        .where(
          and(
            eq(auditItems.cycleId, cycleId),
            inArray(auditItems.verification, ["missing", "damaged"]),
          ),
        );

      // Lock the cycle.
      await tx
        .update(auditCycles)
        .set({ status: "closed" })
        .where(eq(auditCycles.id, cycleId));

      let lostCount = 0;
      let skippedLost = 0;

      for (const d of discrepancies) {
        // Confirmed-missing assets flip to `lost` — but only if the state
        // machine permits the move from the asset's current status.
        if (d.verification === "missing") {
          if (canTransition(d.assetStatus, "lost", session.role)) {
            await tx
              .update(assets)
              .set({ status: "lost" })
              .where(eq(assets.id, d.assetId));

            await logActivity(
              {
                actorId: session.userId,
                action: "asset.lost",
                entityType: "asset",
                entityId: d.assetId,
                before: { status: d.assetStatus, tag: d.tag },
                after: {
                  status: "lost",
                  tag: d.tag,
                  reason: `audit:${cycleId}`,
                },
              },
              tx,
            );
            lostCount += 1;
          } else {
            // e.g. already `lost`, or `retired`/`disposed` — nothing to flip.
            skippedLost += 1;
          }
        }
      }

      // Alert the asset managers/admins about each discrepancy so someone owns
      // the follow-up (category 'alert', per spec).
      if (discrepancies.length > 0) {
        const managerRows = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.role, ["admin", "asset_manager"]),
              eq(users.status, "active"),
            ),
          );
        const managerIds = managerRows.map((m) => m.id);

        for (const d of discrepancies) {
          const verb = d.verification === "missing" ? "missing" : "damaged";
          await notifyMany(
            managerIds,
            {
              category: "alert",
              message: `Audit discrepancy: ${d.tag} (${d.assetName}) reported ${verb} in "${cycle.name}"${
                d.verification === "missing" ? " — asset flagged lost." : "."
              }`,
              entityRef: `asset:${d.tag}`,
            },
            tx,
          );
        }
      }

      await logActivity(
        {
          actorId: session.userId,
          action: "audit.closed",
          entityType: "audit_cycle",
          entityId: cycleId,
          before: { status: "open" },
          after: {
            status: "closed",
            name: cycle.name,
            discrepancyCount: discrepancies.length,
            lostCount,
          },
        },
        tx,
      );

      return {
        lostCount,
        discrepancyCount: discrepancies.length,
        skippedLost,
      } satisfies CloseSummary;
    });

    revalidatePath("/audit");
    return { ok: true, ...summary };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("closeAuditCycle failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Guard: the session may set verifications on this cycle when it is an admin,
 * an asset manager, or an assigned auditor of the cycle.
 */
async function assertCanAudit(
  tx: DbExecutor,
  session: { userId: number; role: string },
  cycleId: number,
): Promise<void> {
  if (session.role === "admin" || session.role === "asset_manager") return;

  const [assigned] = await tx
    .select({ userId: auditCycleAuditors.userId })
    .from(auditCycleAuditors)
    .where(
      and(
        eq(auditCycleAuditors.cycleId, cycleId),
        eq(auditCycleAuditors.userId, session.userId),
      ),
    );
  if (!assigned) {
    throw new ValidationError(
      "Only an assigned auditor (or an asset manager) can verify items in this cycle.",
    );
  }
}
