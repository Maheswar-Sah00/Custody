import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse } from "@/core/errors";
import { requireRole } from "@/core/rbac";
import {
  APPROVAL_ROLES,
  loadApprovalInbox,
  type ApprovalInbox,
} from "@/app/(app)/approvals/_data";

/**
 * GET /api/approvals → { items, counts }
 *
 * The current manager's pending approvals, aggregated across transfer and
 * maintenance requests (see loadApprovalInbox for scope rules). Read-only:
 * approving/rejecting goes through the existing Allocation/Maintenance server
 * actions, not this route. Employees are rejected by requireRole (403).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = requireRole(await getSession(), APPROVAL_ROLES);
    const inbox: ApprovalInbox = await loadApprovalInbox(session);
    return NextResponse.json(inbox);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
