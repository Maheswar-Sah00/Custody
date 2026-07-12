"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  X,
  XCircle,
} from "lucide-react";

import {
  Button,
  Card,
  DatePickerField,
  Modal,
  PageHeader,
  SelectField,
  StatusPill,
  useToast,
} from "@/components";
import type { BookingStatus, UserRole } from "@/core/db/schema";
import { cn } from "@/lib/utils";
import type { BookableResource, BookingBlock } from "../_data";
import {
  cancelBooking,
  createBooking,
  rescheduleBooking,
  type AttemptedSlot,
} from "../actions";

/* -------------------------------------------------------------------------- */
/*  Calendar geometry                                                         */
/* -------------------------------------------------------------------------- */

const DAY_START_HOUR = 8; // 8:00 AM
const DAY_END_HOUR = 20; // 8:00 PM
const HOUR_PX = 60;
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
);

interface EmployeeOption {
  id: number;
  name: string;
}

interface CurrentUser {
  id: number;
  name: string;
  role: UserRole;
}

interface BookingClientProps {
  resources: BookableResource[];
  initialResourceId: number | null;
  initialDate: string;
  initialBookings: BookingBlock[];
  currentUser: CurrentUser;
}

export function BookingClient({
  resources,
  initialResourceId,
  initialDate,
  initialBookings,
  currentUser,
}: BookingClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [resourceId, setResourceId] = React.useState<number | null>(
    initialResourceId,
  );
  const [date, setDate] = React.useState(initialDate);
  const [bookings, setBookings] = React.useState<BookingBlock[]>(initialBookings);
  const [employees, setEmployees] = React.useState<EmployeeOption[]>([]);
  const [loading, setLoading] = React.useState(false);

  // The rejected slot the DB refused — drawn as a dashed-red overlay block.
  const [rejected, setRejected] = React.useState<AttemptedSlot | null>(null);

  // Book / reschedule modal state.
  const [formOpen, setFormOpen] = React.useState(false);
  const [rescheduleTarget, setRescheduleTarget] =
    React.useState<BookingBlock | null>(null);

  const selected = resources.find((r) => r.id === resourceId) ?? null;

  React.useEffect(() => {
    fetch("/api/org/employees")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: EmployeeOption[]) => setEmployees(d))
      .catch(() => setEmployees([]));
  }, []);

  /** Refetch the day's bookings for the current resource + date. */
  const refetch = React.useCallback(async () => {
    if (resourceId == null) {
      setBookings([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/booking?resource=${resourceId}&date=${date}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { bookings: BookingBlock[] };
        setBookings(data.bookings);
      }
    } catch {
      /* leave the last-known bookings in place */
    } finally {
      setLoading(false);
    }
  }, [resourceId, date]);

  // Refetch whenever the resource or date changes (skip the very first render —
  // the server already provided initialBookings). Also clears any rejected slot.
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setRejected(null);
    void refetch();
  }, [resourceId, date, refetch]);

  /* ---- create ---------------------------------------------------------- */

  async function submitBooking(input: {
    startISO: string;
    endISO: string;
    bookedBy: number;
  }): Promise<boolean> {
    if (resourceId == null) return false;
    const result = await createBooking({
      assetId: resourceId,
      startsAt: input.startISO,
      endsAt: input.endISO,
      bookedBy: input.bookedBy,
    });

    if (result.ok) {
      setRejected(null);
      toast({ title: "Slot booked", variant: "success" });
      await refetch();
      router.refresh();
      return true;
    }

    if (result.conflict) {
      // The showcase: paint the refused slot on the calendar.
      setRejected(result.attempted);
      toast({
        title: "Slot unavailable",
        description: "That time overlaps an existing booking — see the calendar.",
        variant: "error",
      });
      return false;
    }

    toast({ title: "Booking blocked", description: result.error, variant: "error" });
    return false;
  }

  /* ---- reschedule ------------------------------------------------------ */

  async function submitReschedule(input: {
    bookingId: number;
    startISO: string;
    endISO: string;
  }): Promise<boolean> {
    const result = await rescheduleBooking({
      bookingId: input.bookingId,
      startsAt: input.startISO,
      endsAt: input.endISO,
    });

    if (result.ok) {
      setRejected(null);
      toast({ title: "Booking rescheduled", variant: "success" });
      await refetch();
      router.refresh();
      return true;
    }
    if (result.conflict) {
      setRejected(result.attempted);
      toast({
        title: "Reschedule blocked",
        description: "The new time overlaps another booking — your original slot was kept.",
        variant: "error",
      });
      await refetch();
      return false;
    }
    toast({ title: "Reschedule blocked", description: result.error, variant: "error" });
    return false;
  }

  /* ---- cancel ---------------------------------------------------------- */

  async function handleCancel(booking: BookingBlock) {
    const result = await cancelBooking({ bookingId: booking.id });
    if (!result.ok) {
      toast({ title: "Couldn't cancel", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Booking cancelled", description: "The slot is free again.", variant: "success" });
    setRejected(null);
    await refetch();
    router.refresh();
  }

  const activeBookings = bookings.filter((b) => b.displayStatus !== "cancelled");

  return (
    <>
      <PageHeader
        title="Resource Booking"
        description="Reserve a shared resource for a time window. Overlapping slots are refused by the database itself."
        actions={
          <Button
            onClick={() => {
              setRescheduleTarget(null);
              setFormOpen(true);
            }}
            disabled={resourceId == null}
          >
            <CalendarPlus />
            Book a slot
          </Button>
        }
      />

      {/* Resource + date selector */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <SelectField
            label="Resource"
            placeholder="Select a bookable resource"
            options={resources.map((r) => ({
              label: `${r.tag} · ${r.name}`,
              value: String(r.id),
            }))}
            value={resourceId != null ? String(resourceId) : undefined}
            onValueChange={(v) => setResourceId(Number(v))}
          />
          <DatePickerField
            label="Day"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            wrapperClassName="sm:w-52"
          />
        </div>

        {selected ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-4 text-sm">
            <span className="font-mono font-medium text-foreground">
              {selected.tag}
            </span>
            <span className="text-foreground">{selected.name}</span>
            {selected.location ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="size-3.5" />
                {selected.location}
              </span>
            ) : null}
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatLongDate(date)}</span>
          </div>
        ) : null}
      </Card>

      {resources.length === 0 ? (
        <Card className="mt-6 p-10 text-center text-sm text-muted-foreground">
          No bookable resources yet. Mark an asset “Shared / bookable” in the Assets
          screen to reserve it here.
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <DayCalendar
            date={date}
            bookings={bookings}
            rejected={rejected}
            loading={loading}
            currentUserId={currentUser.id}
            onDismissRejected={() => setRejected(null)}
          />

          <BookingSidebar
            bookings={activeBookings}
            currentUser={currentUser}
            onReschedule={(b) => {
              setRescheduleTarget(b);
              setFormOpen(true);
            }}
            onCancel={handleCancel}
          />
        </div>
      )}

      <SlotFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        date={date}
        resourceLabel={selected ? `${selected.tag} · ${selected.name}` : ""}
        employees={employees}
        currentUser={currentUser}
        rescheduleTarget={rescheduleTarget}
        onCreate={submitBooking}
        onReschedule={submitReschedule}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Day-view calendar                                                         */
/* -------------------------------------------------------------------------- */

function DayCalendar({
  date,
  bookings,
  rejected,
  loading,
  currentUserId,
  onDismissRejected,
}: {
  date: string;
  bookings: BookingBlock[];
  rejected: AttemptedSlot | null;
  loading: boolean;
  currentUserId: number;
  onDismissRejected: () => void;
}) {
  const dayMidnight = React.useMemo(
    () => new Date(`${date}T00:00:00`).getTime(),
    [date],
  );

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX;

  // Position for an ISO window within the day grid (clamped to visible hours).
  const place = React.useCallback(
    (startISO: string, endISO: string) => {
      const startH = (new Date(startISO).getTime() - dayMidnight) / 3_600_000;
      const endH = (new Date(endISO).getTime() - dayMidnight) / 3_600_000;
      const top = (clamp(startH, DAY_START_HOUR, DAY_END_HOUR) - DAY_START_HOUR) * HOUR_PX;
      const bottom = (clamp(endH, DAY_START_HOUR, DAY_END_HOUR) - DAY_START_HOUR) * HOUR_PX;
      return { top, height: Math.max(bottom - top, 22) };
    },
    [dayMidnight],
  );

  // "Now" indicator — only when the grid shows today.
  const nowTop = useNowIndicator(dayMidnight);

  return (
    <Card className="relative overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">Day schedule</h2>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {loading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> Loading…
            </span>
          ) : null}
          <Legend />
        </div>
      </div>

      <div className="relative overflow-x-hidden overflow-y-auto">
        <div className="relative" style={{ height: gridHeight }}>
          {/* Hour gridlines + gutter */}
          {HOURS.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 right-0 border-t border-border/60"
              style={{ top: i * HOUR_PX }}
            >
              <span className="absolute -top-2 left-3 bg-card px-1 text-xs tabular-nums text-muted-foreground">
                {formatHour(h)}
              </span>
            </div>
          ))}

          {/* Booking column (offset past the gutter) */}
          <div className="absolute inset-y-0 left-16 right-3">
            {bookings.map((b) => {
              const pos = place(b.startsAt, b.endsAt);
              return (
                <BookingBlockView
                  key={b.id}
                  booking={b}
                  top={pos.top}
                  height={pos.height}
                  mine={b.bookedById === currentUserId}
                />
              );
            })}

            {/* The refused slot — dashed red, overlapping, above everything. */}
            {rejected ? (
              <RejectedBlock
                slot={rejected}
                pos={place(rejected.startsAt, rejected.endsAt)}
                onDismiss={onDismissRejected}
              />
            ) : null}

            {/* Now line */}
            {nowTop != null ? (
              <div
                className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                style={{ top: nowTop }}
              >
                <span className="size-2 rounded-full bg-red-500" />
                <span className="h-px flex-1 bg-red-500/70" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function BookingBlockView({
  booking,
  top,
  height,
  mine,
}: {
  booking: BookingBlock;
  top: number;
  height: number;
  mine: boolean;
}) {
  const cancelled = booking.displayStatus === "cancelled";
  const tone = BLOCK_TONES[booking.displayStatus];

  return (
    <div
      className={cn(
        "absolute left-0 right-0 z-10 overflow-hidden rounded-md border px-3 py-1.5 text-xs shadow-sm",
        tone,
        cancelled && "opacity-50",
      )}
      style={{ top, height }}
      title={`${booking.bookedByName} · ${clock(booking.startsAt)}–${clock(
        booking.endsAt,
      )}`}
    >
      <p className={cn("truncate font-medium", cancelled && "line-through")}>
        {cancelled ? "Cancelled" : "Booked"} — {booking.bookedByName}
        {mine ? " (you)" : ""} — {clock(booking.startsAt)} to {clock(booking.endsAt)}
      </p>
      {height > 34 ? (
        <p className="mt-0.5 truncate opacity-80">
          {formatStatusWord(booking.displayStatus)}
        </p>
      ) : null}
    </div>
  );
}

function RejectedBlock({
  slot,
  pos,
  onDismiss,
}: {
  slot: AttemptedSlot;
  pos: { top: number; height: number };
  onDismiss: () => void;
}) {
  return (
    <div
      className="absolute left-8 right-0 z-40 flex flex-col justify-center rounded-md border-2 border-dashed border-red-500 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 shadow-lg"
      style={{ top: pos.top, height: pos.height }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss rejected slot"
        className="absolute right-1.5 top-1.5 rounded-sm text-red-300/80 transition-colors hover:text-red-200"
      >
        <X className="size-3.5" />
      </button>
      <p className="flex items-center gap-1.5 font-semibold">
        <XCircle className="size-3.5 shrink-0" />
        conflict — slot is unavailable
      </p>
      {pos.height > 34 ? (
        <p className="mt-0.5 opacity-90">
          {clock(slot.startsAt)} to {clock(slot.endsAt)} — refused by the database
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sidebar: the day's bookings with cancel / reschedule                      */
/* -------------------------------------------------------------------------- */

function BookingSidebar({
  bookings,
  currentUser,
  onReschedule,
  onCancel,
}: {
  bookings: BookingBlock[];
  currentUser: CurrentUser;
  onReschedule: (b: BookingBlock) => void;
  onCancel: (b: BookingBlock) => void;
}) {
  const canManage = (b: BookingBlock) =>
    b.bookedById === currentUser.id ||
    currentUser.role === "admin" ||
    currentUser.role === "asset_manager";

  return (
    <Card className="h-fit p-5">
      <h2 className="mb-3 text-sm font-medium text-foreground">
        Bookings this day
      </h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active bookings. Pick a free slot and book it.
        </p>
      ) : (
        <ul className="space-y-3">
          {bookings.map((b) => {
            const closed = b.displayStatus === "completed";
            return (
              <li
                key={b.id}
                className="rounded-lg border border-border bg-background/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {clock(b.startsAt)}–{clock(b.endsAt)}
                  </span>
                  <StatusPill status={b.displayStatus} />
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {b.bookedByName}
                  {b.bookedById === currentUser.id ? " (you)" : ""}
                </p>
                {canManage(b) && !closed ? (
                  <div className="mt-2.5 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => onReschedule(b)}>
                      <Pencil />
                      Reschedule
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onCancel(b)}>
                      <XCircle />
                      Cancel
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Book / reschedule form                                                    */
/* -------------------------------------------------------------------------- */

function SlotFormModal({
  open,
  onOpenChange,
  date,
  resourceLabel,
  employees,
  currentUser,
  rescheduleTarget,
  onCreate,
  onReschedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  resourceLabel: string;
  employees: EmployeeOption[];
  currentUser: CurrentUser;
  rescheduleTarget: BookingBlock | null;
  onCreate: (input: {
    startISO: string;
    endISO: string;
    bookedBy: number;
  }) => Promise<boolean>;
  onReschedule: (input: {
    bookingId: number;
    startISO: string;
    endISO: string;
  }) => Promise<boolean>;
}) {
  const isReschedule = rescheduleTarget != null;

  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("10:00");
  const [bookedBy, setBookedBy] = React.useState(String(currentUser.id));
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Seed the form each time it opens.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (rescheduleTarget) {
      setStartTime(toTimeInput(rescheduleTarget.startsAt));
      setEndTime(toTimeInput(rescheduleTarget.endsAt));
      setBookedBy(String(rescheduleTarget.bookedById));
    } else {
      setStartTime("09:00");
      setEndTime("10:00");
      setBookedBy(String(currentUser.id));
    }
  }, [open, rescheduleTarget, currentUser.id]);

  const bookedByName = React.useMemo(() => {
    if (String(currentUser.id) === bookedBy) return `${currentUser.name} (you)`;
    return employees.find((e) => String(e.id) === bookedBy)?.name ?? "—";
  }, [bookedBy, employees, currentUser]);

  async function submit() {
    setError(null);
    const startISO = toISO(date, startTime);
    const endISO = toISO(date, endTime);
    if (!startISO || !endISO) {
      setError("Please provide a valid start and end time.");
      return;
    }
    if (new Date(endISO) <= new Date(startISO)) {
      setError("The end time must be after the start time.");
      return;
    }

    setSubmitting(true);
    const ok = isReschedule
      ? await onReschedule({
          bookingId: rescheduleTarget!.id,
          startISO,
          endISO,
        })
      : await onCreate({ startISO, endISO, bookedBy: Number(bookedBy) });
    setSubmitting(false);
    if (ok) onOpenChange(false);
  }

  // Employee options with the current user pinned first.
  const teamOptions = React.useMemo(() => {
    const others = employees.filter((e) => e.id !== currentUser.id);
    return [
      { label: `${currentUser.name} (you)`, value: String(currentUser.id) },
      ...others.map((e) => ({ label: e.name, value: String(e.id) })),
    ];
  }, [employees, currentUser]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isReschedule ? "Reschedule booking" : "Book a slot"}
      description={
        isReschedule
          ? `Move this booking to a new time. Overlaps are still refused by the database.`
          : `Reserve ${resourceLabel || "this resource"} for ${formatLongDate(date)}.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
            {isReschedule ? "Save new time" : "Book slot"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <TimeField label="Start time" value={startTime} onChange={setStartTime} />
          <TimeField label="End time" value={endTime} onChange={setEndTime} />
        </div>

        {isReschedule ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">Booked for</span>
            <div className="flex h-9 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm text-muted-foreground">
              {bookedByName}
            </div>
          </div>
        ) : (
          <SelectField
            label="Booked for / team"
            hint="Whose booking this is — shown on the calendar block."
            options={teamOptions}
            value={bookedBy}
            onValueChange={setBookedBy}
          />
        )}

        {error ? (
          <p className="text-sm font-medium text-destructive">{error}</p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {clockFromInput(startTime)} to {clockFromInput(endTime)} on {formatLongDate(date)}
          </p>
        )}
      </div>
    </Modal>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        step={900}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors [color-scheme:dark] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function Legend() {
  return (
    <div className="hidden items-center gap-3 sm:flex">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border border-blue-500/40 bg-blue-500/20" />
        Booked
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm border-2 border-dashed border-red-500" />
        Conflict
      </span>
    </div>
  );
}

const BLOCK_TONES: Record<BookingStatus, string> = {
  upcoming: "border-blue-500/40 bg-blue-500/15 text-blue-200",
  ongoing: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  completed: "border-zinc-600/50 bg-zinc-600/15 text-zinc-300",
  cancelled: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
};

/* -------------------------------------------------------------------------- */
/*  Time helpers                                                              */
/* -------------------------------------------------------------------------- */

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Build a local ISO timestamp from a `YYYY-MM-DD` date + `HH:MM` time. */
function toISO(date: string, time: string): string | null {
  if (!time) return null;
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** ISO → `HH:MM` for a time input, in local time. */
function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** Compact local clock from an ISO string, e.g. "9am", "2:30pm". */
function clock(iso: string): string {
  return clockFromDate(new Date(iso));
}

function clockFromInput(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return clockFromDate(d);
}

function clockFromDate(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const mer = h < 12 ? "am" : "pm";
  const h12 = ((h + 11) % 12) + 1;
  return m === 0 ? `${h12}${mer}` : `${h12}:${String(m).padStart(2, "0")}${mer}`;
}

/** Gutter label for a whole hour, e.g. "9 AM", "12 PM", "1 PM". */
function formatHour(h: number): string {
  const mer = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12} ${mer}`;
}

function formatStatusWord(status: BookingStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatLongDate(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Pixel offset of "now" within the grid, or null if the grid isn't today. */
function useNowIndicator(dayMidnight: number): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return null;
  const hours = (now - dayMidnight) / 3_600_000;
  if (hours < DAY_START_HOUR || hours > DAY_END_HOUR) return null;
  return (hours - DAY_START_HOUR) * HOUR_PX;
}
