/**
 * Turns a raw activity-log row into the human sentence the dashboard feed shows,
 * e.g. "Laptop AF-0114 — allocated to Priya Shah — IT dept" or
 * "Room B2 — booking confirmed — 2:00 to 3:00 PM".
 *
 * Pure and dependency-free so it is safe to import from a client component. The
 * `after`/`before` payloads are the JSON snapshots each module records; we read
 * the fields we know about and always fall back to a sensible generic phrasing
 * so an unknown action never renders blank.
 */
import type { RecentActivityEntry } from "./_data";

export interface ActivityLine {
  /** Bold lead — usually the asset tag or the entity name. */
  subject: string;
  /** What happened, e.g. "allocated", "booking confirmed". */
  verb: string;
  /** Optional trailing context, e.g. "to Priya Shah — IT dept". */
  detail?: string;
}

type Payload = Record<string, unknown> | null | undefined;

function asRecord(value: unknown): Payload {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function str(payload: Payload, key: string): string | null {
  const v = payload?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** "under_maintenance" → "Under Maintenance". */
function humanize(value: string): string {
  return value
    .split(/[_\s.-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "2:00 to 3:00 PM" style window from two ISO timestamps. */
function timeWindow(startISO: string | null, endISO: string | null): string | null {
  if (!startISO || !endISO) return null;
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleTimeString(undefined, opts)} to ${end.toLocaleTimeString(undefined, opts)}`;
}

export function formatActivity(entry: RecentActivityEntry): ActivityLine {
  const after = asRecord(entry.after);
  const before = asRecord(entry.before);
  const tag = str(after, "tag") ?? str(before, "tag");
  const actor = entry.actorName;

  switch (entry.action) {
    case "asset.registered":
      return {
        subject: tag ?? str(after, "name") ?? `Asset #${entry.entityId}`,
        verb: "registered",
        detail: str(after, "name") && tag ? str(after, "name")! : undefined,
      };

    case "asset.allocated": {
      const holder = str(after, "holderName") ?? str(after, "toName");
      const dept = str(after, "departmentName");
      return {
        subject: tag ?? `Asset #${entry.entityId}`,
        verb: "allocated",
        detail: [holder ? `to ${holder}` : null, dept].filter(Boolean).join(" — ") || undefined,
      };
    }

    case "allocation.returned":
    case "asset.returned":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "checked in" };

    case "transfer.requested":
      return {
        subject: tag ?? `Asset #${entry.entityId}`,
        verb: "transfer requested",
        detail: str(after, "toName") ? `to ${str(after, "toName")}` : undefined,
      };

    case "transfer.approved":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "transfer approved" };
    case "transfer.rejected":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "transfer rejected" };

    case "booking.created":
      return {
        subject: tag ?? `Resource #${entry.entityId}`,
        verb: "booking confirmed",
        detail: timeWindow(str(after, "startsAt"), str(after, "endsAt")) ?? undefined,
      };
    case "booking.cancelled":
      return { subject: tag ?? `Resource #${entry.entityId}`, verb: "booking cancelled" };
    case "booking.rescheduled":
      return {
        subject: tag ?? `Resource #${entry.entityId}`,
        verb: "booking rescheduled",
        detail: timeWindow(str(after, "startsAt"), str(after, "endsAt")) ?? undefined,
      };

    case "maintenance.raised":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "maintenance requested" };
    case "maintenance.resolved":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "maintenance resolved" };
    case "maintenance.transitioned": {
      const to = str(after, "status");
      return {
        subject: tag ?? `Asset #${entry.entityId}`,
        verb: to ? `maintenance ${humanize(to).toLowerCase()}` : "maintenance updated",
      };
    }

    case "audit.created":
      return {
        subject: str(after, "name") ?? `Audit #${entry.entityId}`,
        verb: "audit cycle created",
      };
    case "audit.closed":
      return {
        subject: str(after, "name") ?? `Audit #${entry.entityId}`,
        verb: "audit cycle closed",
      };
    case "asset.lost":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "flagged lost" };

    case "allocation.overdue":
      return { subject: tag ?? `Asset #${entry.entityId}`, verb: "flagged overdue" };
    case "booking.overdue":
      return { subject: tag ?? `Resource #${entry.entityId}`, verb: "booking overdue" };

    default: {
      // Generic "entityType.verb" → "Entity — verb" fallback.
      const [scope, ...rest] = entry.action.split(".");
      const verb = rest.length ? humanize(rest.join(".")).toLowerCase() : humanize(scope).toLowerCase();
      return {
        subject: tag ?? `${humanize(entry.entityType)} #${entry.entityId}`,
        verb,
        detail: actor ? `by ${actor}` : undefined,
      };
    }
  }
}
