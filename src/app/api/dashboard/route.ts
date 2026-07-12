import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

import { loadDashboard } from "@/app/(app)/dashboard/_data";

/**
 * GET /api/dashboard
 *
 * One call for everything the "Today's Overview" screen needs: the six KPI
 * counts, the current overdue set (read-only — no alert notifications are
 * written here), and the recent-activity feed. All computed live from the DB.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireSession(await getSession());
    const { kpis, overdue, activity } = await loadDashboard();
    return NextResponse.json({ kpis, overdue, activity });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
