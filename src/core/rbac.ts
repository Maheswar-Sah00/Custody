/**
 * Role-based access control helpers.
 *
 * Usage in a route handler or server action:
 *
 *   const session = requireRole(await getSession(), ["admin", "asset_manager"]);
 *   // session is non-null and guaranteed to hold one of those roles
 */
import type { Session } from "./auth/session";
import { userRoleEnum, type UserRole } from "./db/schema";
import { ForbiddenError, UnauthorizedError } from "./errors";

export const ROLES = userRoleEnum.enumValues;
export type Role = UserRole;

/** True when the session exists and its role is in `roles`. */
export function hasRole(
  session: Session | null | undefined,
  roles: readonly Role[],
): boolean {
  return !!session && roles.includes(session.role);
}

/**
 * Guard: returns the session when it holds one of `roles`, otherwise throws
 * UnauthorizedError (no session) or ForbiddenError (wrong role). Pair with
 * `toErrorResponse` from core/errors in API routes.
 */
export function requireRole(
  session: Session | null | undefined,
  roles: readonly Role[],
): Session {
  if (!session) {
    throw new UnauthorizedError();
  }
  if (!roles.includes(session.role)) {
    throw new ForbiddenError(
      `This action requires one of the following roles: ${roles.join(", ")}`,
    );
  }
  return session;
}

/** Guard for "any signed-in user" endpoints. */
export function requireSession(
  session: Session | null | undefined,
): Session {
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}
