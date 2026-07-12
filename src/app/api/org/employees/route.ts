import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { users } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/**
 * GET /api/org/employees  →  [{ id, name, department_id, role }]
 *
 * PUBLIC PICKLIST CONTRACT — allocation/transfer/booking screens pick a holder
 * or requester from here. Returns active users only. Keep this shape minimal
 * and stable.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireSession(await getSession());

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        department_id: users.departmentId,
        role: users.role,
      })
      .from(users)
      .where(eq(users.status, "active"))
      .orderBy(asc(users.name));

    return NextResponse.json(rows);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
