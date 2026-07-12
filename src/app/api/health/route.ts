import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/core/db";

/**
 * GET /api/health  →  { status, db, uptime, timestamp }
 *
 * Liveness + DB-connectivity probe. Public (no auth) so a load balancer,
 * `docker compose` healthcheck, or the demo operator can hit it directly.
 * Returns 200 when Postgres answers a trivial query, 503 otherwise.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: "ok",
      db: "up",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        db: "down",
        error: "Database is not reachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
