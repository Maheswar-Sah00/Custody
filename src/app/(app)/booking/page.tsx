import { redirect } from "next/navigation";

import { getSession } from "@/core/auth/session";
import { loadBookableResources, loadBookingsForDay } from "./_data";
import { BookingClient } from "./_components/booking-client";

/**
 * Screen 6 — Resource Booking. Any signed-in user can view the calendar and
 * book a free slot; the DB exclusion constraint refuses overlaps and the client
 * paints the rejection as a dashed-red block. Cancel/reschedule permissions are
 * enforced in the server actions.
 */
export const dynamic = "force-dynamic";

/** Local-time `YYYY-MM-DD` for "today" on the server. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default async function BookingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const resources = await loadBookableResources();
  const initialDate = todayISO();
  const initialResourceId = resources[0]?.id ?? null;
  const initialBookings =
    initialResourceId != null
      ? await loadBookingsForDay(initialResourceId, initialDate)
      : [];

  return (
    <BookingClient
      resources={resources}
      initialResourceId={initialResourceId}
      initialDate={initialDate}
      initialBookings={initialBookings}
      currentUser={{ id: session.userId, name: session.name, role: session.role }}
    />
  );
}
