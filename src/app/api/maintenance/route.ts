import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse, ValidationError } from "@/core/errors";
import { requireSession } from "@/core/rbac";
import type { MaintenanceStatus } from "@/core/db/schema";
import {
  loadMaintenanceRequests,
  type MaintenanceCard,
} from "@/app/(app)/maintenance/_data";
import { raiseRequest } from "@/app/(app)/maintenance/actions";

/**
 * GET  /api/maintenance   → { columns: { pending, approved, assigned, in_progress, resolved }, rejected }
 *   Requests bucketed by status, ready for the five-column Kanban board.
 *
 * POST /api/maintenance   { assetId, issue, priority, photoPath? }  → 201 { requestId }
 *   Raise a new request (lands in 'pending').
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

export async function POST(request: Request) {
  try {
    requireSession(await getSession());

    const payload = (await request.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    if (!payload) throw new ValidationError("Expected a JSON body.");

    const result = await raiseRequest({
      assetId: payload.assetId as number,
      issue: String(payload.issue ?? ""),
      priority: (payload.priority as "low" | "medium" | "high") ?? "medium",
      photoPath: (payload.photoPath as string | null | undefined) ?? null,
    });

    if (result.ok) {
      return NextResponse.json({ requestId: result.requestId }, { status: 201 });
    }
    return NextResponse.json({ error: result.error }, { status: 422 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
