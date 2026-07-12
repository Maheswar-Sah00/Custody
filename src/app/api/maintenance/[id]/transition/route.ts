import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse, ValidationError } from "@/core/errors";
import { requireSession } from "@/core/rbac";
import { transitionRequest } from "@/app/(app)/maintenance/actions";

/**
 * POST /api/maintenance/:id/transition   { to, technicianName? }  → { assetFlip }
 *
 * Advance a maintenance request along its lifecycle (approve / reject / assign /
 * start / resolve). Role-gated to asset managers/admins inside the action. On an
 * auto asset-status flip the response carries `assetFlip` so the caller can show
 * the "AF-0062 → Under Maintenance" toast.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    requireSession(await getSession());

    const requestId = Number(params.id);
    if (!Number.isInteger(requestId) || requestId <= 0) {
      throw new ValidationError("Invalid request id.");
    }

    const payload = (await request.json().catch(() => null)) as
      | { to?: string; technicianName?: string | null }
      | null;
    if (!payload?.to) throw new ValidationError("`to` status is required.");

    const result = await transitionRequest({
      requestId,
      to: payload.to as
        | "approved"
        | "rejected"
        | "assigned"
        | "in_progress"
        | "resolved",
      technicianName: payload.technicianName ?? null,
    });

    if (result.ok) {
      return NextResponse.json({ assetFlip: result.assetFlip });
    }
    return NextResponse.json({ error: result.error }, { status: 409 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
