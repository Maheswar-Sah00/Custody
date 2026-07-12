import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { notifications } from "@/core/db/schema";
import { NotFoundError, toErrorResponse, ValidationError } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/**
 * POST /api/notifications/:id/read  — mark one notification read.
 *
 * Scoped to the current user: you can only mark your own notifications, so a
 * mismatched id 404s rather than touching another user's row. Idempotent —
 * re-marking an already-read notification is a no-op that still succeeds.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = requireSession(await getSession());

    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      throw new ValidationError("Invalid notification id");
    }

    const updated = await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, session.userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });

    if (updated.length === 0) {
      // Either it doesn't exist / isn't ours, or it was already read. Confirm
      // ownership so an already-read notification still returns success.
      const [owned] = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.id, id),
            eq(notifications.userId, session.userId),
          ),
        );
      if (!owned) throw new NotFoundError("Notification not found");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
