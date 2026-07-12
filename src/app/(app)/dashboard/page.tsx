import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  PackageCheck,
  PackageOpen,
  Plus,
  Undo2,
  Wrench,
} from "lucide-react";

import { getSession } from "@/core/auth/session";
import { Button, Card, KpiCard, PageHeader } from "@/components";

import { loadDashboard } from "./_data";
import { formatActivity } from "./activity-format";

/**
 * Screen 2 — Dashboard ("Today's Overview"). Server component: it reads the six
 * KPI counts, the overdue set, and the recent-activity feed live from the DB on
 * every request (the same loaders back GET /api/dashboard). The overdue counts
 * come from the read-only overdue helpers, so rendering the dashboard never
 * writes alert notifications.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { kpis, overdue, activity } = await loadDashboard();

  return (
    <>
      <PageHeader
        title="Today's Overview"
        description="Live counts across your assets, bookings, and requests."
      />

      {/* KPIs — 3×2 grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Assets Available"
          value={kpis.assetsAvailable}
          tone="success"
          icon={<PackageCheck />}
          hint="Ready to allocate"
        />
        <KpiCard
          label="Assets Allocated"
          value={kpis.assetsAllocated}
          tone="info"
          icon={<PackageOpen />}
          hint="Currently checked out"
        />
        <KpiCard
          label="Maintenance Today"
          value={kpis.maintenanceToday}
          tone="warning"
          icon={<Wrench />}
          hint="Open requests"
        />
        <KpiCard
          label="Active Bookings"
          value={kpis.activeBookings}
          tone="info"
          icon={<CalendarDays />}
          hint="Live resource holds"
        />
        <KpiCard
          label="Pending Transfers"
          value={kpis.pendingTransfers}
          tone="warning"
          icon={<ArrowLeftRight />}
          hint="Awaiting approval"
        />
        <KpiCard
          label="Upcoming Returns"
          value={kpis.upcomingReturns}
          tone="default"
          icon={<Undo2 />}
          hint="Due today or later"
        />
      </div>

      {/* Overdue banner — only when something is actually overdue. Kept visually
          distinct (red / alert) from the neutral "Upcoming Returns" KPI above. */}
      {overdue.total > 0 ? (
        <Link
          href="/allocation"
          className="mt-4 flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 transition-colors hover:bg-red-500/15"
        >
          <AlertTriangle className="size-5 shrink-0 text-red-400" />
          <span className="font-medium text-red-200">
            {overdue.total} {overdue.total === 1 ? "asset" : "assets"} overdue for
            return
          </span>
          <span className="text-red-300/80">— flagged for follow-up</span>
          {overdue.bookings > 0 ? (
            <span className="ml-auto shrink-0 text-xs text-red-300/70">
              {overdue.allocations} allocation{overdue.allocations === 1 ? "" : "s"}
              {" · "}
              {overdue.bookings} booking{overdue.bookings === 1 ? "" : "s"}
            </span>
          ) : null}
        </Link>
      ) : null}

      {/* Quick actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/assets">
            <Plus />
            Register Asset
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/booking">
            <CalendarClock />
            Book Resource
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/maintenance">
            <Wrench />
            Raise Request
          </Link>
        </Button>
      </div>

      {/* Recent activity */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recent Activity
          </h2>
        </div>

        <Card className="divide-y divide-border p-0">
          {activity.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No activity yet.
            </p>
          ) : (
            activity.map((entry) => {
              const line = formatActivity(entry);
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                    <span className="font-medium">{line.subject}</span>
                    <span className="text-muted-foreground"> — {line.verb}</span>
                    {line.detail ? (
                      <span className="text-muted-foreground"> — {line.detail}</span>
                    ) : null}
                  </p>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(entry.createdAt)}
                  </time>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </>
  );
}

/** Compact "just now / 5m / 3h / 2d" relative time from an ISO string. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
