import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { forgotPassword } from "@/core/auth";
import { toErrorResponse } from "@/core/errors";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
});

/**
 * Self-hosted reset flow: the short-lived reset token is returned in the
 * response for the app to display (no email delivery). The message is the
 * same whether or not the account exists.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = forgotPasswordSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 422 },
      );
    }

    const result = await forgotPassword(parsed.data.email);

    return NextResponse.json({
      message:
        "If an account exists for this email, a reset token has been issued. It expires in 15 minutes.",
      resetToken: result?.resetToken ?? null,
    });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
