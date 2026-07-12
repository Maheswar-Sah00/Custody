/**
 * Asset lifecycle state machine.
 *
 * ASSET_STATE_TRANSITIONS is the canonical map of legal moves; the
 * state_transitions table is seeded from it (scripts/seed.ts) so the rules
 * are also queryable in SQL. Change the rules HERE, then re-seed.
 *
 * Role semantics per transition:
 *  - requiredRole = null  → any authenticated user may perform the move
 *  - requiredRole = X     → role X may perform it; `admin` may always.
 */
import type { AssetStatus, UserRole } from "./db/schema";

export type AssetState = AssetStatus;

export interface StateTransition {
  from: AssetState;
  to: AssetState;
  requiredRole: UserRole | null;
}

export const ASSET_STATE_TRANSITIONS: readonly StateTransition[] = [
  // From available
  { from: "available", to: "allocated", requiredRole: "asset_manager" },
  { from: "available", to: "reserved", requiredRole: null }, // booking system
  { from: "available", to: "under_maintenance", requiredRole: "asset_manager" },
  { from: "available", to: "lost", requiredRole: "asset_manager" },
  { from: "available", to: "retired", requiredRole: "admin" },

  // From allocated
  { from: "allocated", to: "available", requiredRole: "asset_manager" }, // check-in
  { from: "allocated", to: "under_maintenance", requiredRole: "asset_manager" },
  { from: "allocated", to: "lost", requiredRole: "asset_manager" },

  // From reserved
  { from: "reserved", to: "allocated", requiredRole: "asset_manager" },
  { from: "reserved", to: "available", requiredRole: null }, // booking ended/cancelled

  // From under_maintenance
  { from: "under_maintenance", to: "available", requiredRole: "asset_manager" },
  { from: "under_maintenance", to: "retired", requiredRole: "admin" },

  // From lost
  { from: "lost", to: "available", requiredRole: "asset_manager" }, // recovered
  { from: "lost", to: "retired", requiredRole: "admin" },

  // From retired — disposal is terminal
  { from: "retired", to: "disposed", requiredRole: "admin" },
] as const;

/**
 * Is `from → to` a legal move for `role`?
 * Admins may perform any legal transition regardless of its requiredRole.
 */
export function canTransition(
  from: AssetState,
  to: AssetState,
  role: UserRole,
): boolean {
  const rule = ASSET_STATE_TRANSITIONS.find(
    (t) => t.from === from && t.to === to,
  );
  if (!rule) return false;
  if (rule.requiredRole === null) return true;
  return role === "admin" || role === rule.requiredRole;
}

/** All states `role` may legally move an asset into from `from`. */
export function legalTransitionsFrom(
  from: AssetState,
  role: UserRole,
): AssetState[] {
  return ASSET_STATE_TRANSITIONS.filter(
    (t) => t.from === from && canTransition(from, t.to, role),
  ).map((t) => t.to);
}
