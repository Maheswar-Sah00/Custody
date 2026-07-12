import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";
import type { MaintenanceStatus } from "@/core/db/schema";
import {
  loadMaintenanceRequests,
  type MaintenanceCard,
} from "@/app/(app)/maintenance/_data";

/**
 * GET  /api/maintenance   → { columns: { pending, approved, assigned, in_progress, resolved }, rejected }
 *   Requests bucketed by status, ready for the five-column Kanban board.
 *   Writes go through the maintenance server actions, not this route.
 */
export const dynamic = "force-dynamic";

/** The five board columns, in order. */
const BOARD_STATUSES: MaintenanceStatus[] = [
  "pending",
  "approved",
  "assigned",
  "in_progress",
  "resolved",
];

export async function GET() {
  try {
    requireSession(await getSession());

    const all = await loadMaintenanceRequests();

    const columns = Object.fromEntries(
      BOARD_STATUSES.map((s) => [s, all.filter((r) => r.status === s)]),
    ) as Record<MaintenanceStatus, MaintenanceCard[]>;

    return NextResponse.json({
      columns,
      rejected: all.filter((r) => r.status === "rejected"),
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
