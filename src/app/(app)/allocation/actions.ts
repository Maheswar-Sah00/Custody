"use server";

/**
 * Allocation & Transfer mutations — the heart of AssetFlow.
 *
 * Invariants enforced here:
 *  - An asset can never have two active allocations. This is guaranteed at the
 *    DB level by the partial unique index `one_active_allocation`; we also check
 *    the asset's status under a row lock and translate a unique-violation into a
 *    friendly conflict, so a direct re-allocation is *physically* impossible.
 *  - Every lifecycle move is validated with canTransition() from the core state
 *    machine before the status column is written.
 *  - Every write is recorded via the activity-log wrapper and the affected
 *    parties are notified.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/core/activity-log";
import { getSession, type Session } from "@/core/auth/session";
import { db, type DbExecutor } from "@/core/db";
import {
  allocations,
  assets,
  departments,
  transferRequests,
  users,
} from "@/core/db/schema";
import { ApiError, ConflictError, NotFoundError, ValidationError } from "@/core/errors";
import { notify, notifyMany } from "@/core/notifications";
import { requireRole, requireSession } from "@/core/rbac";
import { canTransition } from "@/core/state-machine";

export type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function run<T>(
  guard: () => Promise<Session>,
  fn: (session: Session) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const session = await guard();
    const result = await fn(session);
    revalidatePath("/allocation");
    revalidatePath("/assets");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error:
          "This asset already has an active allocation — direct re-allocation is blocked.",
      };
    }
    console.error("Allocation action failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Allocate an available asset                                               */
/* -------------------------------------------------------------------------- */

const allocateInput = z
  .object({
    assetId: z.coerce.number().int().positive(),
    holderType: z.enum(["user", "department"]),
    holderId: z.coerce.number().int().positive(),
    expectedReturnDate: z
      .union([z.string(), z.null(), z.undefined()])
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === "") return null;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
          ctx.addIssue({ code: "custom", message: "Date must be YYYY-MM-DD." });
          return z.NEVER;
        }
        return v;
      }),
  });

export type AllocateInput = z.input<typeof allocateInput>;

export async function allocateAsset(
  raw: AllocateInput,
): Promise<ActionResult<{ allocationId: number }>> {
  return run(
    () => requireRole0(["admin", "asset_manager"]),
    async (session) => {
      const input = allocateInput.parse(raw);

      const allocationId = await db.transaction(async (tx) => {
        // Lock the asset row so a concurrent allocate can't slip past the check.
        const [asset] = await tx
          .select()
          .from(assets)
          .where(eq(assets.id, input.assetId))
          .for("update");
        if (!asset) throw new NotFoundError("Asset not found.");

        // Physical guard #1: an asset must be available to be allocated.
        if (asset.status !== "available") {
          throw new ConflictError(
            "This asset is already allocated — submit a transfer request instead.",
          );
        }

        // Physical guard #2: the lifecycle move must be legal for this role.
        if (!canTransition("available", "allocated", session.role)) {
          throw new ValidationError(
            "Your role cannot allocate assets (asset manager required).",
          );
        }

        // Validate the holder exists.
        const holderName = await resolveHolderName(
          tx,
          input.holderType,
          input.holderId,
        );

        // Physical guard #3: the DB partial unique index makes a second active
        // allocation impossible; a 23505 here is caught and surfaced by run().
        const [created] = await tx
          .insert(allocations)
          .values({
            assetId: input.assetId,
            holderUserId: input.holderType === "user" ? input.holderId : null,
            holderDepartmentId:
              input.holderType === "department" ? input.holderId : null,
            expectedReturnDate: input.expectedReturnDate,
            status: "active",
          })
          .returning();

        const [updatedAsset] = await tx
          .update(assets)
          .set({ status: "allocated" })
          .where(eq(assets.id, input.assetId))
          .returning();

        await logActivity(
          {
            actorId: session.userId,
            action: "asset.allocated",
            entityType: "allocation",
            entityId: created.id,
            before: { assetStatus: asset.status },
            after: {
              assetId: input.assetId,
              tag: asset.tag,
              holderType: input.holderType,
              holderId: input.holderId,
              holderName,
              assetStatus: updatedAsset.status,
            },
          },
          tx,
        );

        // Notify the assignee (the user, or the head of the holding department).
        await notifyAllocationTarget(
          tx,
          input.holderType,
          input.holderId,
          `${asset.tag} (${asset.name}) has been allocated to you.`,
          asset.tag,
        );

        return created.id;
      });

      return { allocationId };
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Request a transfer (blocked-reallocation path)                            */
/* -------------------------------------------------------------------------- */

const transferInput = z.object({
  assetId: z.coerce.number().int().positive(),
  toUserId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1, "Please give a reason for the transfer."),
});

export type TransferInput = z.input<typeof transferInput>;

export async function requestTransfer(
  raw: TransferInput,
): Promise<ActionResult<{ transferId: number }>> {
  return run(
    () => requireSession0(),
    async (session) => {
      const input = transferInput.parse(raw);

      const transferId = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            id: allocations.id,
            holderUserId: allocations.holderUserId,
            holderDepartmentId: allocations.holderDepartmentId,
          })
          .from(allocations)
          .where(
            and(
              eq(allocations.assetId, input.assetId),
              eq(allocations.status, "active"),
            ),
          );

        if (!current) {
          throw new ConflictError(
            "This asset is not currently allocated, so there is nothing to transfer.",
          );
        }
        if (current.holderDepartmentId != null || current.holderUserId == null) {
          throw new ValidationError(
            "This asset is held by a department. Mark it returned, then allocate it directly.",
          );
        }
        if (current.holderUserId === input.toUserId) {
          throw new ValidationError(
            "The asset is already held by that person.",
          );
        }

        const [asset] = await tx
          .select({ tag: assets.tag, name: assets.name })
          .from(assets)
          .where(eq(assets.id, input.assetId));

        const [created] = await tx
          .insert(transferRequests)
          .values({
            assetId: input.assetId,
            fromUserId: current.holderUserId,
            toUserId: input.toUserId,
            reason: input.reason,
            status: "requested",
          })
          .returning();

        await logActivity(
          {
            actorId: session.userId,
            action: "transfer.requested",
            entityType: "transfer_request",
            entityId: created.id,
            after: created,
          },
          tx,
        );

        // Ask the people who can approve it.
        const approvers = await approverIds(tx);
        await notifyMany(
          approvers,
          {
            category: "approval",
            message: `Transfer requested for ${asset?.tag} (${asset?.name}). Review and approve or reject.`,
            entityRef: asset ? `asset:${asset.tag}` : null,
          },
          tx,
        );

        return created.id;
      });

      return { transferId };
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Approve / reject a transfer                                               */
/* -------------------------------------------------------------------------- */

const decideInput = z.object({
  transferId: z.coerce.number().int().positive(),
});

export async function approveTransfer(
  raw: z.input<typeof decideInput>,
): Promise<ActionResult<{ allocationId: number }>> {
  return run(
    () => requireRole0(["admin", "asset_manager", "dept_head"]),
    async (session) => {
      const { transferId } = decideInput.parse(raw);

      const allocationId = await db.transaction(async (tx) => {
        const [transfer] = await tx
          .select()
          .from(transferRequests)
          .where(eq(transferRequests.id, transferId))
          .for("update");
        if (!transfer) throw new NotFoundError("Transfer request not found.");
        if (transfer.status !== "requested") {
          throw new ConflictError("This transfer has already been decided.");
        }

        // Lock the asset and its current active allocation.
        const [asset] = await tx
          .select()
          .from(assets)
          .where(eq(assets.id, transfer.assetId))
          .for("update");
        if (!asset) throw new NotFoundError("Asset not found.");

        const [current] = await tx
          .select()
          .from(allocations)
          .where(
            and(
              eq(allocations.assetId, transfer.assetId),
              eq(allocations.status, "active"),
            ),
          );
        if (!current) {
          throw new ConflictError(
            "The asset is no longer allocated; this transfer can't be applied.",
          );
        }
        if (current.holderUserId !== transfer.fromUserId) {
          throw new ConflictError(
            "The asset changed hands since this request was made. Please reject and re-file it.",
          );
        }

        // Close the current allocation...
        await tx
          .update(allocations)
          .set({ status: "returned", returnedAt: new Date() })
          .where(eq(allocations.id, current.id));

        // ...and open the new one for the target holder. The unique index is
        // satisfied because the old allocation is now 'returned'.
        const [next] = await tx
          .insert(allocations)
          .values({
            assetId: transfer.assetId,
            holderUserId: transfer.toUserId,
            status: "active",
          })
          .returning();

        await tx
          .update(transferRequests)
          .set({ status: "approved", decidedBy: session.userId })
          .where(eq(transferRequests.id, transferId));

        await logActivity(
          {
            actorId: session.userId,
            action: "transfer.approved",
            entityType: "transfer_request",
            entityId: transferId,
            before: transfer,
            after: { status: "approved", newAllocationId: next.id },
          },
          tx,
        );

        // Notify both parties.
        await notify(
          {
            userId: transfer.fromUserId,
            category: "alert",
            message: `${asset.tag} (${asset.name}) has been transferred away from you.`,
            entityRef: `asset:${asset.tag}`,
          },
          tx,
        );
        await notify(
          {
            userId: transfer.toUserId,
            category: "alert",
            message: `${asset.tag} (${asset.name}) has been transferred to you.`,
            entityRef: `asset:${asset.tag}`,
          },
          tx,
        );

        return next.id;
      });

      return { allocationId };
    },
  );
}

export async function rejectTransfer(
  raw: z.input<typeof decideInput>,
): Promise<ActionResult> {
  return run(
    () => requireRole0(["admin", "asset_manager", "dept_head"]),
    async (session) => {
      const { transferId } = decideInput.parse(raw);

      await db.transaction(async (tx) => {
        const [transfer] = await tx
          .select()
          .from(transferRequests)
          .where(eq(transferRequests.id, transferId))
          .for("update");
        if (!transfer) throw new NotFoundError("Transfer request not found.");
        if (transfer.status !== "requested") {
          throw new ConflictError("This transfer has already been decided.");
        }

        await tx
          .update(transferRequests)
          .set({ status: "rejected", decidedBy: session.userId })
          .where(eq(transferRequests.id, transferId));

        const [asset] = await tx
          .select({ tag: assets.tag, name: assets.name })
          .from(assets)
          .where(eq(assets.id, transfer.assetId));

        await logActivity(
          {
            actorId: session.userId,
            action: "transfer.rejected",
            entityType: "transfer_request",
            entityId: transferId,
            before: transfer,
            after: { status: "rejected" },
          },
          tx,
        );

        await notify(
          {
            userId: transfer.toUserId,
            category: "alert",
            message: `The transfer request for ${asset?.tag} (${asset?.name}) was rejected.`,
            entityRef: asset ? `asset:${asset.tag}` : null,
          },
          tx,
        );
      });

      return {};
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Mark returned (check-in)                                                  */
/* -------------------------------------------------------------------------- */

const returnInput = z.object({
  allocationId: z.coerce.number().int().positive(),
  conditionNotes: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim())),
});

export async function markReturned(
  raw: z.input<typeof returnInput>,
): Promise<ActionResult> {
  return run(
    () => requireRole0(["admin", "asset_manager"]),
    async (session) => {
      const input = returnInput.parse(raw);

      await db.transaction(async (tx) => {
        const [allocation] = await tx
          .select()
          .from(allocations)
          .where(eq(allocations.id, input.allocationId))
          .for("update");
        if (!allocation) throw new NotFoundError("Allocation not found.");
        if (allocation.status !== "active") {
          throw new ConflictError("This allocation has already been returned.");
        }

        const [asset] = await tx
          .select()
          .from(assets)
          .where(eq(assets.id, allocation.assetId))
          .for("update");
        if (!asset) throw new NotFoundError("Asset not found.");

        // Only validate the lifecycle move when the asset is actually allocated;
        // (an asset out on maintenance/lost is handled elsewhere).
        if (
          asset.status === "allocated" &&
          !canTransition("allocated", "available", session.role)
        ) {
          throw new ValidationError(
            "Your role cannot check assets back in (asset manager required).",
          );
        }

        await tx
          .update(allocations)
          .set({
            status: "returned",
            returnedAt: new Date(),
            checkinConditionNotes: input.conditionNotes,
          })
          .where(eq(allocations.id, input.allocationId));

        if (asset.status === "allocated") {
          await tx
            .update(assets)
            .set({ status: "available" })
            .where(eq(assets.id, asset.id));
        }

        await logActivity(
          {
            actorId: session.userId,
            action: "allocation.returned",
            entityType: "allocation",
            entityId: input.allocationId,
            before: { status: "active", assetStatus: asset.status },
            after: {
              status: "returned",
              assetStatus: "available",
              conditionNotes: input.conditionNotes,
            },
          },
          tx,
        );

        if (allocation.holderUserId) {
          await notify(
            {
              userId: allocation.holderUserId,
              category: "alert",
              message: `Your return of ${asset.tag} (${asset.name}) has been recorded.`,
              entityRef: `asset:${asset.tag}`,
            },
            tx,
          );
        }
      });

      return {};
    },
  );
}

/* -------------------------------------------------------------------------- */
/*  Guards & helpers                                                          */
/* -------------------------------------------------------------------------- */

async function requireRole0(
  roles: readonly ("admin" | "asset_manager" | "dept_head")[],
): Promise<Session> {
  return requireRole(await getSession(), roles);
}

async function requireSession0(): Promise<Session> {
  return requireSession(await getSession());
}

/** Ensure the holder (user or department) exists; return a display name. */
async function resolveHolderName(
  tx: DbExecutor,
  type: "user" | "department",
  id: number,
): Promise<string> {
  if (type === "user") {
    const [u] = await tx
      .select({ name: users.name, status: users.status })
      .from(users)
      .where(eq(users.id, id));
    if (!u) throw new ValidationError("The selected employee no longer exists.");
    return u.name;
  }
  const [d] = await tx
    .select({ name: departments.name })
    .from(departments)
    .where(eq(departments.id, id));
  if (!d) throw new ValidationError("The selected department no longer exists.");
  return d.name;
}

/** Notify the assignee: the user directly, or the head of the holding dept. */
async function notifyAllocationTarget(
  tx: DbExecutor,
  type: "user" | "department",
  id: number,
  message: string,
  tag: string,
): Promise<void> {
  if (type === "user") {
    await notify({ userId: id, category: "alert", message, entityRef: `asset:${tag}` }, tx);
    return;
  }
  const [dept] = await tx
    .select({ headId: departments.headId })
    .from(departments)
    .where(eq(departments.id, id));
  if (dept?.headId) {
    await notify(
      { userId: dept.headId, category: "alert", message, entityRef: `asset:${tag}` },
      tx,
    );
  }
}

/** Active admins + asset managers — the people who can approve a transfer. */
async function approverIds(tx: DbExecutor): Promise<number[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ["admin", "asset_manager"]), eq(users.status, "active")));
  return rows.map((r) => r.id);
}

/** True for a Postgres unique-violation (SQLSTATE 23505), however it's wrapped. */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const causeCode = (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505" || causeCode === "23505";
}
