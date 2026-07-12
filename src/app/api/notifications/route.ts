import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { notificationCategoryEnum, notifications } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/**
 * GET /api/notifications[?category=alert|approval|booking]
 *
 * The signed-in user's notifications, newest first. Omit `category` (or pass
 * "all") for the unfiltered feed. Powers the notification center list.
 */
export const dynamic = "force-dynamic";

const categorySchema = z.enum(notificationCategoryEnum.enumValues);

export async function GET(request: NextRequest) {
  try {
    const session = requireSession(await getSession());

    const raw = request.nextUrl.searchParams.get("category");
    const filter =
      raw && raw !== "all" ? categorySchema.parse(raw) : undefined;

    const where = filter
      ? and(
          eq(notifications.userId, session.userId),
          eq(notifications.category, filter),
        )
      : eq(notifications.userId, session.userId);

    const rows = await db
      .select({
        id: notifications.id,
        category: notifications.category,
        message: notifications.message,
        entityRef: notifications.entityRef,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt));

    const unreadCount = rows.reduce((n, r) => n + (r.readAt ? 0 : 1), 0);

    return NextResponse.json({ notifications: rows, unreadCount });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
