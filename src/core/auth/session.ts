/**
 * Cookie-backed sessions for server components and route handlers.
 * The session is a signed JWT in an httpOnly cookie — no server-side store.
 */
import { cookies } from "next/headers";

import type { UserRole } from "../db/schema";
import { signSessionToken, verifySessionToken } from "./tokens";

export const SESSION_COOKIE = "assetflow_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days, matches token TTL

export interface Session {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Read and verify the session from the request cookies.
 * Usable in server components, route handlers, and server actions.
 */
export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId)) return null;

  return {
    userId,
    email: payload.email,
    name: payload.name,
    role: payload.role,
  };
}

/**
 * Sign a session token for a user and set it as the session cookie.
 * Only callable where cookies are mutable (route handlers, server actions).
 */
export async function createSession(user: {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}): Promise<void> {
  const token = await signSessionToken({
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
  });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function destroySession(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
