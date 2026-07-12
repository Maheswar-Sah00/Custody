/**
 * JWT signing/verification (jose, HS256). Two token kinds, distinguished by
 * the `purpose` claim so a reset token can never be replayed as a session.
 */
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

import type { UserRole } from "../db/schema";

const SESSION_TTL = "7d";
const RESET_TTL = "15m";

const PURPOSE_SESSION = "session";
const PURPOSE_PASSWORD_RESET = "password_reset";

function secretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set (see .env.example)");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionTokenPayload {
  /** users.id */
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

export async function signSessionToken(payload: SessionTokenPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
    purpose: PURPOSE_SESSION,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionTokenPayload | null> {
  const payload = await verify(token);
  if (!payload || payload.purpose !== PURPOSE_SESSION || !payload.sub) {
    return null;
  }
  return {
    sub: payload.sub,
    email: String(payload.email),
    name: String(payload.name),
    role: payload.role as UserRole,
  };
}

export async function signPasswordResetToken(userId: number): Promise<string> {
  return new SignJWT({ purpose: PURPOSE_PASSWORD_RESET })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(RESET_TTL)
    .sign(secretKey());
}

/** Returns the user id the reset token was issued for, or null if invalid/expired. */
export async function verifyPasswordResetToken(
  token: string,
): Promise<number | null> {
  const payload = await verify(token);
  if (!payload || payload.purpose !== PURPOSE_PASSWORD_RESET || !payload.sub) {
    return null;
  }
  const userId = Number(payload.sub);
  return Number.isInteger(userId) ? userId : null;
}

async function verify(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}
