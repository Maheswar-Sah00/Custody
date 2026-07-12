"use server";

/**
 * Resource Booking mutations.
 *
 * The centrepiece invariant — "no two live bookings for one resource may
 * overlap" — is enforced *by the database*, not by JavaScript. The
 * `no_overlapping_bookings` GiST exclusion constraint (drizzle/0001_constraints.sql)
 * rejects an overlapping INSERT with SQLSTATE 23P01. We deliberately do NOT
 * pre-check for overlaps in code: we attempt the insert, and translate a 23P01
 * into a typed `conflict` result the UI paints as a dashed-red rejected slot.
 *
 * Every write is recorded via the activity-log wrapper and the booker is
 * notified; creating a booking also files a `booking`-category reminder.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { logActivity } from "@/core/activity-log";
import { getSession } from "@/core/auth/session";
import { db, type DbExecutor } from "@/core/db";
import { assets, bookings, users } from "@/core/db/schema";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/core/errors";
import { notify } from "@/core/notifications";
import { requireSession } from "@/core/rbac";

/* -------------------------------------------------------------------------- */
/*  Result envelope                                                           */
/* -------------------------------------------------------------------------- */

export interface AttemptedSlot {
  assetId: number;
  startsAt: string;
  endsAt: string;
}

export type BookingActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string; conflict?: false }
  /**
   * The DB rejected the insert as an overlap. `attempted` carries the slot the
   * user tried to book so the calendar can draw it as a dashed-red block over
   * the existing booking(s).
   */
  | { ok: false; error: string; conflict: true; attempted: AttemptedSlot };

/** True for a Postgres exclusion-constraint violation (SQLSTATE 23P01). */
function isExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  const causeCode = (error as { cause?: { code?: string } }).cause?.code;
  return code === "23P01" || causeCode === "23P01";
}

/* -------------------------------------------------------------------------- */
/*  Create a booking                                                          */
/* -------------------------------------------------------------------------- */

const createInput = z.object({
  assetId: z.coerce.number().int().positive(),
  /** ISO timestamps (with zone) for the slot window. */
  startsAt: z.string().min(1, "Start time is required."),
  endsAt: z.string().min(1, "End time is required."),
  /** Who the slot is booked for — defaults to the current user when omitted. */
  bookedBy: z.coerce.number().int().positive().optional(),
});

export type CreateBookingInput = z.input<typeof createInput>;

export async function createBooking(
  raw: CreateBookingInput,
): Promise<BookingActionResult<{ bookingId: number }>> {
  let attempted: AttemptedSlot | null = null;
  try {
    const session = requireSession(await getSession());
    const input = createInput.parse(raw);

    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ValidationError("The slot times are not valid dates.");
    }
    if (end <= start) {
      throw new ValidationError("The end time must be after the start time.");
    }
    attempted = {
      assetId: input.assetId,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    };

    const bookingId = await db.transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(assets)
        .where(eq(assets.id, input.assetId));
      if (!asset) throw new NotFoundError("Resource not found.");
      if (!asset.isBookable) {
        throw new ValidationError("This resource is not bookable.");
      }

      const bookedBy = input.bookedBy ?? session.userId;
      await assertUserExists(tx, bookedBy);

      // No JS overlap check — we rely on the DB exclusion constraint. An
      // overlapping row raises 23P01, caught below and surfaced as a conflict.
      const [created] = await tx
        .insert(bookings)
        .values({
          assetId: input.assetId,
          bookedBy,
          startsAt: start,
          endsAt: end,
          status: "upcoming",
        })
        .returning();

      await logActivity(
        {
          actorId: session.userId,
          action: "booking.created",
          entityType: "booking",
          entityId: created.id,
          after: {
            assetId: input.assetId,
            tag: asset.tag,
            bookedBy,
            startsAt: created.startsAt,
            endsAt: created.endsAt,
          },
        },
        tx,
      );

      // Confirmation + reminder for the booker (category 'booking'). With no
      // cron running, this on-creation notice doubles as the pre-start reminder.
      await notify(
        {
          userId: bookedBy,
          category: "booking",
          message: `Booking confirmed: ${asset.tag} (${asset.name}) from ${formatWindow(
            start,
            end,
          )}. You'll want to be there before it starts.`,
          entityRef: `booking:${created.id}`,
        },
        tx,
      );

      return created.id;
    });

    revalidatePath("/booking");
    return { ok: true, bookingId };
  } catch (error) {
    if (isExclusionViolation(error) && attempted) {
      return {
        ok: false,
        conflict: true,
        error:
          "conflict — slot is unavailable. It overlaps an existing booking for this resource.",
        attempted,
      };
    }
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("createBooking failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Cancel a booking (frees the slot)                                         */
/* -------------------------------------------------------------------------- */

const cancelInput = z.object({
  bookingId: z.coerce.number().int().positive(),
});

export async function cancelBooking(
  raw: z.input<typeof cancelInput>,
): Promise<BookingActionResult> {
  try {
    const session = requireSession(await getSession());
    const { bookingId } = cancelInput.parse(raw);

    await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .for("update");
      if (!booking) throw new NotFoundError("Booking not found.");
      if (booking.status === "cancelled") {
        throw new ConflictError("This booking is already cancelled.");
      }
      if (booking.status === "completed") {
        throw new ConflictError("A completed booking can't be cancelled.");
      }

      // Only the booker, an asset manager, or an admin may cancel.
      if (
        booking.bookedBy !== session.userId &&
        session.role !== "admin" &&
        session.role !== "asset_manager"
      ) {
        throw new ValidationError(
          "You can only cancel your own bookings (or ask an asset manager).",
        );
      }

      const [asset] = await tx
        .select({ tag: assets.tag, name: assets.name })
        .from(assets)
        .where(eq(assets.id, booking.assetId));

      // Cancelling drops the row out of the ('upcoming','ongoing') set the
      // exclusion constraint watches, so the slot is immediately re-bookable.
      await tx
        .update(bookings)
        .set({ status: "cancelled" })
        .where(eq(bookings.id, bookingId));

      await logActivity(
        {
          actorId: session.userId,
          action: "booking.cancelled",
          entityType: "booking",
          entityId: bookingId,
          before: { status: booking.status },
          after: { status: "cancelled" },
        },
        tx,
      );

      await notify(
        {
          userId: booking.bookedBy,
          category: "booking",
          message: `Booking cancelled: ${asset?.tag} (${asset?.name}) for ${formatWindow(
            booking.startsAt,
            booking.endsAt,
          )}. The slot is free again.`,
          entityRef: `booking:${bookingId}`,
        },
        tx,
      );
    });

    revalidatePath("/booking");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("cancelBooking failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Reschedule = cancel + rebook (still subject to overlap rejection)         */
/* -------------------------------------------------------------------------- */

const rescheduleInput = z.object({
  bookingId: z.coerce.number().int().positive(),
  startsAt: z.string().min(1, "Start time is required."),
  endsAt: z.string().min(1, "End time is required."),
});

export type RescheduleInput = z.input<typeof rescheduleInput>;

export async function rescheduleBooking(
  raw: RescheduleInput,
): Promise<BookingActionResult<{ bookingId: number }>> {
  let attempted: AttemptedSlot | null = null;
  try {
    const session = requireSession(await getSession());
    const input = rescheduleInput.parse(raw);

    const start = new Date(input.startsAt);
    const end = new Date(input.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new ValidationError("The new slot times are not valid dates.");
    }
    if (end <= start) {
      throw new ValidationError("The end time must be after the start time.");
    }

    const newId = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, input.bookingId))
        .for("update");
      if (!existing) throw new NotFoundError("Booking not found.");
      if (existing.status === "cancelled" || existing.status === "completed") {
        throw new ConflictError(
          "Only an upcoming or ongoing booking can be rescheduled.",
        );
      }
      if (
        existing.bookedBy !== session.userId &&
        session.role !== "admin" &&
        session.role !== "asset_manager"
      ) {
        throw new ValidationError(
          "You can only reschedule your own bookings (or ask an asset manager).",
        );
      }

      const [asset] = await tx
        .select({ tag: assets.tag, name: assets.name, isBookable: assets.isBookable })
        .from(assets)
        .where(eq(assets.id, existing.assetId));
      if (!asset) throw new NotFoundError("Resource not found.");

      attempted = {
        assetId: existing.assetId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      };

      // Cancel first so the old window leaves the exclusion set; the new insert
      // therefore never conflicts with the booking's own former slot — only with
      // *other* live bookings, which correctly still reject.
      await tx
        .update(bookings)
        .set({ status: "cancelled" })
        .where(eq(bookings.id, input.bookingId));

      const [created] = await tx
        .insert(bookings)
        .values({
          assetId: existing.assetId,
          bookedBy: existing.bookedBy,
          startsAt: start,
          endsAt: end,
          status: "upcoming",
        })
        .returning();

      await logActivity(
        {
          actorId: session.userId,
          action: "booking.rescheduled",
          entityType: "booking",
          entityId: created.id,
          before: {
            fromBookingId: input.bookingId,
            startsAt: existing.startsAt,
            endsAt: existing.endsAt,
          },
          after: { startsAt: created.startsAt, endsAt: created.endsAt },
        },
        tx,
      );

      await notify(
        {
          userId: existing.bookedBy,
          category: "booking",
          message: `Booking rescheduled: ${asset.tag} (${asset.name}) now ${formatWindow(
            start,
            end,
          )}.`,
          entityRef: `booking:${created.id}`,
        },
        tx,
      );

      return created.id;
    });

    revalidatePath("/booking");
    return { ok: true, bookingId: newId };
  } catch (error) {
    if (isExclusionViolation(error) && attempted) {
      return {
        ok: false,
        conflict: true,
        error:
          "conflict — slot is unavailable. The new time overlaps another booking; your original slot was kept.",
        attempted,
      };
    }
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("rescheduleBooking failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function assertUserExists(tx: DbExecutor, userId: number): Promise<void> {
  const [u] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), inArray(users.status, ["active"])));
  if (!u) throw new ValidationError("The selected person no longer exists.");
}

/** "9:00 AM–10:00 AM" style window for a booking message. */
function formatWindow(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day}, ${start.toLocaleTimeString(undefined, opts)}–${end.toLocaleTimeString(
    undefined,
    opts,
  )}`;
}
