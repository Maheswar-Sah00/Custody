import { NextResponse } from "next/server";

import { destroySession } from "@/core/auth";

export async function POST() {
  destroySession();
  return NextResponse.json({ ok: true });
}
