/**
 * End-to-end verification of the allocation lifecycle SQL used by the Screen 5
 * server actions: allocate → (blocked double-allocation) → transfer request →
 * approve (swap holders) → mark returned. Everything runs inside ONE outer
 * transaction that is rolled back at the end, so the seed data is untouched.
 */
import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db, pool } from "../src/core/db";
import {
  allocations,
  assets,
  transferRequests,
  users,
} from "../src/core/db/schema";
import { canTransition } from "../src/core/state-machine";

const ROLLBACK = "verify-flow-rollback";

async function main() {
  let pass = 0;
  let fail = 0;
  const ok = (label: string, cond: boolean) => {
    console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}`);
    cond ? pass++ : fail++;
  };

  try {
    await db.transaction(async (tx) => {
      const [asset] = await tx.select().from(assets).where(eq(assets.tag, "AF-0001"));
      const [priya] = await tx.select().from(users).where(eq(users.email, "priya.shah@assetflow.com"));
      const [raj] = await tx.select().from(users).where(eq(users.email, "raj@assetflow.com"));
      ok("AF-0001 starts 'available'", asset.status === "available");

      // 1) ALLOCATE — legal move + insert active + status → allocated
      ok("canTransition available→allocated (asset_manager)", canTransition("available", "allocated", "asset_manager"));
      const [alloc1] = await tx
        .insert(allocations)
        .values({ assetId: asset.id, holderUserId: priya.id, status: "active" })
        .returning();
      await tx.update(assets).set({ status: "allocated" }).where(eq(assets.id, asset.id));
      const [afterAlloc] = await tx.select().from(assets).where(eq(assets.id, asset.id));
      ok("after allocate, asset is 'allocated'", afterAlloc.status === "allocated");

      // 2) DOUBLE-ALLOCATION BLOCK — second active insert must 23505 (savepoint)
      let blocked = false;
      try {
        await tx.transaction(async (sp) => {
          await sp.insert(allocations).values({ assetId: asset.id, holderUserId: raj.id, status: "active" });
        });
      } catch (err) {
        blocked = (err as { code?: string }).code === "23505"
          || (err as { cause?: { code?: string } }).cause?.code === "23505";
      }
      ok("second active allocation blocked (23505)", blocked);

      // 3) TRANSFER REQUEST — from current holder (Priya) to Raj
      const [req] = await tx
        .insert(transferRequests)
        .values({ assetId: asset.id, fromUserId: priya.id, toUserId: raj.id, reason: "verify", status: "requested" })
        .returning();
      ok("transfer request created 'requested'", req.status === "requested");

      // 4) APPROVE — close current, open new for Raj, mark approved
      await tx.update(allocations).set({ status: "returned", returnedAt: new Date() }).where(eq(allocations.id, alloc1.id));
      const [alloc2] = await tx
        .insert(allocations)
        .values({ assetId: asset.id, holderUserId: raj.id, status: "active" })
        .returning();
      await tx.update(transferRequests).set({ status: "approved", decidedBy: priya.id }).where(eq(transferRequests.id, req.id));
      const activeNow = await tx
        .select()
        .from(allocations)
        .where(and(eq(allocations.assetId, asset.id), eq(allocations.status, "active")));
      ok("after approve, exactly one active allocation", activeNow.length === 1);
      ok("after approve, holder is Raj", activeNow[0].holderUserId === raj.id);

      // 5) MARK RETURNED — close alloc, asset → available
      ok("canTransition allocated→available (asset_manager)", canTransition("allocated", "available", "asset_manager"));
      await tx
        .update(allocations)
        .set({ status: "returned", returnedAt: new Date(), checkinConditionNotes: "good" })
        .where(eq(allocations.id, alloc2.id));
      await tx.update(assets).set({ status: "available" }).where(eq(assets.id, asset.id));
      const [finalAsset] = await tx.select().from(assets).where(eq(assets.id, asset.id));
      const stillActive = await tx
        .select()
        .from(allocations)
        .where(and(eq(allocations.assetId, asset.id), eq(allocations.status, "active")));
      ok("after return, asset is 'available'", finalAsset.status === "available");
      ok("after return, no active allocations remain", stillActive.length === 0);

      // Roll the whole thing back so the seed stays pristine.
      throw new Error(ROLLBACK);
    });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== ROLLBACK) {
      console.error(err);
      await pool.end();
      process.exit(1);
    }
  }

  // Confirm rollback: AF-0001 is untouched.
  const [check] = await db.select().from(assets).where(eq(assets.tag, "AF-0001"));
  ok("rollback left AF-0001 'available' (seed intact)", check.status === "available");

  console.log(`\n  ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main();
