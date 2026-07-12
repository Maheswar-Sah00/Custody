import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse } from "@/core/errors";
import { checkOverdue } from "@/core/overdue";
import { requireSession } from "@/core/rbac";

/**
 * GET /api/overdue
 *
 * Runs the overdue sweep and returns the current overdue set. Consumed by the
 * dashboard's overdue banner + KPI counts and by the notification center. The
 * sweep also creates alert notifications for any item not alerted before, so
 * hitting this endpoint doubles as the "on-request" scheduler.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireSession(await getSession());
    const result = await checkOverdue();
    return NextResponse.json({
      allocations: result.allocations,
      bookings: result.bookings,
      counts: {
        allocations: result.allocations.length,
        bookings: result.bookings.length,
        total: result.allocations.length + result.bookings.length,
      },
      newlyNotified: result.newlyNotified,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
