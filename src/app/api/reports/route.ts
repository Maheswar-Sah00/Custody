import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

import { loadReports } from "@/app/(app)/reports/_data";

/**
 * GET /api/reports
 *
 * The aggregated analytics behind the Reports screen: utilization by department,
 * maintenance frequency, most-used vs idle assets, lifecycle watch-list, the
 * department allocation summary, and the booking heatmap. All computed live.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireSession(await getSession());
    const data = await loadReports();
    return NextResponse.json(data);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
