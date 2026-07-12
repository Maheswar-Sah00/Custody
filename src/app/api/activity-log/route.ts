import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, type SQL } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { activityLogs, users } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireRole } from "@/core/rbac";

/**
 * GET /api/activity-log
 *
 * The "who did what when" audit trail — a compliance tool, so it is limited to
 * admins and asset managers. Newest first, joined to the actor's name.
 * Optional filters: ?entityType=asset  ?action=asset.allocated
 * ?actorId=4  ?limit=100 (default 50, max 200). A null actor means a
 * system-initiated action (e.g. the overdue engine).
 */
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: NextRequest) {
  try {
    requireRole(await getSession(), ["admin", "asset_manager"]);

    const sp = request.nextUrl.searchParams;
    const entityType = sp.get("entityType");
    const action = sp.get("action");
    const actorIdRaw = sp.get("actorId");

    const filters: SQL[] = [];
    if (entityType) filters.push(eq(activityLogs.entityType, entityType));
    if (action) filters.push(eq(activityLogs.action, action));
    if (actorIdRaw && Number.isInteger(Number(actorIdRaw))) {
      filters.push(eq(activityLogs.actorId, Number(actorIdRaw)));
    }

    const limitRaw = Number(sp.get("limit"));
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, MAX_LIMIT)
        : DEFAULT_LIMIT;

    const rows = await db
      .select({
        id: activityLogs.id,
        actorId: activityLogs.actorId,
        actorName: users.name,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        before: activityLogs.before,
        after: activityLogs.after,
        createdAt: activityLogs.createdAt,
      })
      .from(activityLogs)
      .leftJoin(users, eq(users.id, activityLogs.actorId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);

    return NextResponse.json({ entries: rows });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
