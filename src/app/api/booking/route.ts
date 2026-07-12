import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse, ValidationError } from "@/core/errors";
import { requireSession } from "@/core/rbac";
import {
  loadBookableResources,
  loadBookingsForDay,
} from "@/app/(app)/booking/_data";

/**
 * GET  /api/booking?resource=<assetId>&date=<YYYY-MM-DD>
 *   → { resources, bookings }
 *
 * Without `resource`, returns just the bookable-resource list (for the picker).
 * With `resource` (+ optional `date`, defaulting to today), also returns that
 * resource's bookings whose window touches the day — the calendar's blocks.
 *
 * Writes go through the booking server actions, not this route.
 */
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    requireSession(await getSession());

    const url = new URL(request.url);
    const resourceParam = url.searchParams.get("resource");
    const dateParam = url.searchParams.get("date");

    const resources = await loadBookableResources();

    if (!resourceParam) {
      return NextResponse.json({ resources, bookings: [] });
    }

    const assetId = Number(resourceParam);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      throw new ValidationError("`resource` must be a positive asset id.");
    }

    const date =
      dateParam && DATE_RE.test(dateParam) ? dateParam : todayISO();
    const bookings = await loadBookingsForDay(assetId, date);

    return NextResponse.json({ resources, bookings, date });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

/** Local-time `YYYY-MM-DD` for "today". */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
