import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logActivity } from "@/core/activity-log";
import { createSession, signup } from "@/core/auth";
import { toErrorResponse } from "@/core/errors";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("A valid email is required"),
  // NOTE: no `role` field — self-service signup always creates an employee.
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = signupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 422 },
      );
    }

    const user = await signup(parsed.data);
    await createSession(user);
    await logActivity({
      actorId: user.id,
      action: "user.signup",
      entityType: "user",
      entityId: user.id,
      after: { name: user.name, email: user.email, role: user.role },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
