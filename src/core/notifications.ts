/**
 * In-app notifications — fully self-hosted, no email/push provider.
 * Feature modules write rows here; the notification center reads them.
 */
import { db, type DbExecutor } from "./db";
import {
  notifications,
  type Notification,
  type NotificationCategory,
} from "./db/schema";

export interface NotifyInput {
  userId: number;
  category: NotificationCategory;
  message: string;
  /** Pointer to the related entity, e.g. "asset:AF-0114" or "booking:12". */
  entityRef?: string | null;
}

export async function notify(
  input: NotifyInput,
  executor: DbExecutor = db,
): Promise<Notification> {
  const [row] = await executor
    .insert(notifications)
    .values({
      userId: input.userId,
      category: input.category,
      message: input.message,
      entityRef: input.entityRef ?? null,
    })
    .returning();
  return row;
}

/** Convenience fan-out: one notification per recipient. */
export async function notifyMany(
  userIds: readonly number[],
  input: Omit<NotifyInput, "userId">,
  executor: DbExecutor = db,
): Promise<Notification[]> {
  if (userIds.length === 0) return [];
  return executor
    .insert(notifications)
    .values(
      userIds.map((userId) => ({
        userId,
        category: input.category,
        message: input.message,
        entityRef: input.entityRef ?? null,
      })),
    )
    .returning();
}
