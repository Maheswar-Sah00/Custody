import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, ilike, or } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { assets, departments, users } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/**
 * GET /api/search?q=...
 *
 * Backs the global Cmd+K palette. One round-trip, three small grouped result
 * sets — assets (by tag/name/serial), people (by name), and bookable resources.
 * Each group is capped so the palette stays fast. Returns empty groups for a
 * blank query rather than scanning the whole table.
 */
export const dynamic = "force-dynamic";

const GROUP_LIMIT = 6;

/** Escape LIKE wildcards so a user's "%" is treated literally. */
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function GET(request: NextRequest) {
  try {
    requireSession(await getSession());

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length === 0) {
      return NextResponse.json({ assets: [], people: [], resources: [] });
    }
    const term = likeTerm(q);

    const [assetRows, peopleRows, resourceRows] = await Promise.all([
      db
        .select({
          id: assets.id,
          tag: assets.tag,
          name: assets.name,
          status: assets.status,
        })
        .from(assets)
        .where(
          or(
            ilike(assets.tag, term),
            ilike(assets.name, term),
            ilike(assets.serialNumber, term),
          ),
        )
        .orderBy(asc(assets.tag))
        .limit(GROUP_LIMIT),

      db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          department: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(and(eq(users.status, "active"), ilike(users.name, term)))
        .orderBy(asc(users.name))
        .limit(GROUP_LIMIT),

      db
        .select({
          id: assets.id,
          tag: assets.tag,
          name: assets.name,
          location: assets.location,
        })
        .from(assets)
        .where(
          and(
            eq(assets.isBookable, true),
            or(ilike(assets.tag, term), ilike(assets.name, term)),
          ),
        )
        .orderBy(asc(assets.tag))
        .limit(GROUP_LIMIT),
    ]);

    return NextResponse.json({
      assets: assetRows,
      people: peopleRows,
      resources: resourceRows,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
