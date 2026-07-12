import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { departments } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/**
 * GET /api/org/departments  →  [{ id, name }]
 *
 * PUBLIC PICKLIST CONTRACT — allocation/asset/booking screens populate their
 * department dropdowns from here, live from the DB. Returns active departments
 * only. Keep this shape minimal and stable.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireSession(await getSession());

    const rows = await db
      .select({ id: departments.id, name: departments.name })
      .from(departments)
      .where(eq(departments.status, "active"))
      .orderBy(asc(departments.name));

    return NextResponse.json(rows);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
