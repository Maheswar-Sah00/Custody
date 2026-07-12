/**
 * Auth business logic, framework-free (no Next.js imports) so it is usable
 * from route handlers, server actions, and scripts alike.
 */
import { eq } from "drizzle-orm";

import { db } from "../db";
import { users, type UserRole } from "../db/schema";
import { ConflictError, UnauthorizedError, NotFoundError } from "../errors";
import { hashPassword, verifyPassword } from "./passwords";
import { signPasswordResetToken, verifyPasswordResetToken } from "./tokens";

/** User shape safe to return to clients — never includes password_hash. */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  departmentId: number | null;
}

function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
  };
}

/**
 * Self-service signup. ALWAYS creates an `employee` — the role is not a
 * parameter by design; only an admin flow may elevate roles later.
 */
export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (existing) {
    throw new ConflictError("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const [created] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email,
      passwordHash,
      role: "employee",
    })
    .returning();

  return toPublicUser(created);
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Verify against a constant dummy hash when the user is missing so the
  // response time does not reveal whether the email exists.
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash ??
      "$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpFtnPvJ8mvuOnjIC0T0lRRZQyRy6",
  );
  if (!user || !valid) {
    throw new UnauthorizedError("Invalid email or password");
  }
  if (user.status !== "active") {
    throw new UnauthorizedError("This account has been deactivated");
  }

  return toPublicUser(user);
}

/**
 * Forgot-password: issues a short-lived signed reset token, returned in-app
 * (no email — AssetFlow is fully self-hosted). Returns null when no account
 * matches; callers should present the same success message either way.
 */
export async function forgotPassword(
  email: string,
): Promise<{ resetToken: string } | null> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  if (!user) return null;

  const resetToken = await signPasswordResetToken(user.id);
  return { resetToken };
}

/** Complete the reset flow with a token from forgotPassword. */
export async function resetPassword(input: {
  token: string;
  password: string;
}): Promise<PublicUser> {
  const userId = await verifyPasswordResetToken(input.token);
  if (userId === null) {
    throw new UnauthorizedError("Invalid or expired reset token");
  }

  const passwordHash = await hashPassword(input.password);
  const [updated] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) {
    throw new NotFoundError("Account no longer exists");
  }

  return toPublicUser(updated);
}
