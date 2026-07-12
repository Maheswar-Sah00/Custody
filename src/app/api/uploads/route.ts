import { NextResponse } from "next/server";

import { getSession } from "@/core/auth/session";
import { toErrorResponse } from "@/core/errors";
import { requireSession } from "@/core/rbac";
import { saveAssetPhoto } from "@/lib/uploads";

/**
 * POST /api/uploads  (multipart/form-data, field "file")  →  { path }
 *
 * Saves an asset photo to local disk under /public/uploads and returns its
 * public web path. Any signed-in user may upload; the register form calls this
 * before creating the asset so the resulting path can be stored on the row.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireSession(await getSession());

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Expected a file in the 'file' field." },
        { status: 422 },
      );
    }

    const path = await saveAssetPhoto(file);
    return NextResponse.json({ path });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
