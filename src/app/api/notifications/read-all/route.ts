import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { notifications } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/** POST /api/notifications/read-all — mark all of the user's unread as read. */
export async function POST() {
  try {
    const session = requireSession(await getSession());

    const updated = await db
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(notifications.userId, session.userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });

    return NextResponse.json({ ok: true, marked: updated.length });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
