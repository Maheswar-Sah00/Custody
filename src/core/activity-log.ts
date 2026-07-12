/**
 * Append-only activity log. Call this from every mutation that matters —
 * it is the audit trail the compliance screens read from.
 *
 * Pass the surrounding transaction as `executor` when logging inside one, so
 * the log entry commits (or rolls back) atomically with the change it records.
 */
import { db, type DbExecutor } from "./db";
import { activityLogs, type ActivityLog } from "./db/schema";

export interface LogActivityInput {
  /** users.id of who did it; null for system-initiated actions. */
  actorId: number | null;
  /** Verb-first, dot-scoped action name, e.g. "asset.allocated", "user.signup". */
  action: string;
  /** Entity kind, e.g. "asset", "allocation", "booking". */
  entityType: string;
  entityId: number;
  /** Snapshot of the entity before the change (null for creates). */
  before?: unknown;
  /** Snapshot after the change (null for deletes). */
  after?: unknown;
}

export async function logActivity(
  input: LogActivityInput,
  executor: DbExecutor = db,
): Promise<ActivityLog> {
  const [entry] = await executor
    .insert(activityLogs)
    .values({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
    })
    .returning();
  return entry;
}
