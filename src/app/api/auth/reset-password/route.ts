import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logActivity } from "@/core/activity-log";
import { resetPassword } from "@/core/auth";
import { toErrorResponse } from "@/core/errors";

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = resetPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 422 },
      );
    }

    const user = await resetPassword(parsed.data);
    await logActivity({
      actorId: user.id,
      action: "user.password_reset",
      entityType: "user",
      entityId: user.id,
    });

    return NextResponse.json({ user });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
