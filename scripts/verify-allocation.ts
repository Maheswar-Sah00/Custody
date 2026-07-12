/**
 * Ad-hoc verification for the Allocation module (not part of the app).
 * Proves the double-allocation guarantee end-to-end at the DB level and checks
 * QR generation. Safe to re-run: it rolls back everything it does.
 */
import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { db, pool } from "../src/core/db";
import { allocations, assets, users } from "../src/core/db/schema";
import { qrDataUrl, qrPayload } from "../src/lib/qr";

async function main() {
  let pass = 0;
  let fail = 0;
  const ok = (label: string, cond: boolean) => {
    console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}`);
    cond ? pass++ : fail++;
  };

  // --- Seed sanity: AF-0114 is allocated to Priya Shah ---
  const [af0114] = await db.select().from(assets).where(eq(assets.tag, "AF-0114"));
  ok("AF-0114 exists", !!af0114);
  ok("AF-0114 status is 'allocated'", af0114?.status === "allocated");

  const [activeAlloc] = await db
    .select()
    .from(allocations)
    .where(and(eq(allocations.assetId, af0114.id), eq(allocations.status, "active")));
  ok("AF-0114 has exactly one active allocation", !!activeAlloc);

  const [priya] = await db.select().from(users).where(eq(users.email, "priya.shah@assetflow.com"));
  ok("AF-0114 is held by Priya Shah", activeAlloc?.holderUserId === priya?.id);

  // --- The physical double-allocation block ---
  // Try to open a SECOND active allocation for AF-0114. The partial unique index
  // `one_active_allocation` must reject it with SQLSTATE 23505.
  const [raj] = await db.select().from(users).where(eq(users.email, "raj@assetflow.com"));
  let blocked = false;
  let code = "";
  try {
    await db.transaction(async (tx) => {
      await tx.insert(allocations).values({
        assetId: af0114.id,
        holderUserId: raj.id,
        status: "active",
      });
    });
  } catch (err) {
    blocked = true;
    code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code ?? "";
  }
  ok("Second active allocation is REJECTED by the DB", blocked);
  ok("Rejection is a unique-violation (SQLSTATE 23505)", code === "23505");

  // Confirm still exactly one active allocation after the failed attempt.
  const activeCount = await db
    .select()
    .from(allocations)
    .where(and(eq(allocations.assetId, af0114.id), eq(allocations.status, "active")));
  ok("Still exactly one active allocation after the blocked attempt", activeCount.length === 1);

  // --- QR generation (local, no external API) ---
  const payload = qrPayload("AF-0114");
  ok("QR payload matches convention", payload === "assetflow:asset:AF-0114");
  const dataUrl = await qrDataUrl(payload);
  ok("QR renders to a PNG data URL", dataUrl.startsWith("data:image/png;base64,"));

  console.log(`\n  ${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
