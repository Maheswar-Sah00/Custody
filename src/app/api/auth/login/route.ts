import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSession, login } from "@/core/auth";
import { toErrorResponse } from "@/core/errors";

const loginSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 422 },
      );
    }

    const user = await login(parsed.data);
    await createSession(user);

    return NextResponse.json({ user });
  } catch (error) {
    const { body, status } = toErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
