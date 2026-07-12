import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";

import { getSession } from "@/core/auth/session";
import { db } from "@/core/db";
import { assetCategories } from "@/core/db/schema";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";

/**
 * GET /api/org/categories  →  [{ id, name, custom_fields }]
 *
 * PUBLIC PICKLIST CONTRACT — the asset register reads categories and their
 * custom-field definitions from here to build its dynamic form. `custom_fields`
 * is the raw JSONB map (e.g. { "warranty_months": "number" }). Keep this shape
 * minimal and stable.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    requireSession(await getSession());

    const rows = await db
      .select({
        id: assetCategories.id,
        name: assetCategories.name,
        custom_fields: assetCategories.customFields,
      })
      .from(assetCategories)
      .orderBy(asc(assetCategories.name));

    return NextResponse.json(rows);
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
