"use client";

import * as React from "react";
import { Bell, CheckCheck, Inbox } from "lucide-react";

import {
  Button,
  FilterChips,
  PageHeader,
  StatusPill,
  Tabs,
  formatStatusLabel,
  useToast,
} from "@/components";
import { cn } from "@/lib/utils";
import { relativeTime } from "./relative-time";

type NotificationCategory = "alert" | "approval" | "booking";

interface NotificationItem {
  id: number;
  category: NotificationCategory;
  message: string;
  entityRef: string | null;
  readAt: string | null;
  createdAt: string;
}

interface ActivityEntry {
  id: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number;
  createdAt: string;
}

/** Per-category dot color for the notification list. */
const CATEGORY_DOT: Record<NotificationCategory, string> = {
  alert: "bg-red-500",
  approval: "bg-blue-500",
  booking: "bg-emerald-500",
};

const CATEGORY_CHIPS = [
  { value: "all", label: "All" },
  { value: "alert", label: "Alerts" },
  { value: "approval", label: "Approvals" },
  { value: "booking", label: "Bookings" },
];

export function NotificationsClient() {
  const [view, setView] = React.useState<"notifications" | "activity">(
    "notifications",
  );
  const [unreadCount, setUnreadCount] = React.useState(0);

  return (
    <>
      <PageHeader
        title="Notifications & activity"
        description="Your alerts and the organization's audit trail."
      />

      <Tabs
        items={[
          {
            value: "notifications",
            label: "Notifications",
            count: unreadCount || undefined,
          },
          { value: "activity", label: "Activity log" },
        ]}
        value={view}
        onValueChange={(v) => setView(v as typeof view)}
        aria-label="Notifications views"
      />

      <div className="mt-6">
        {view === "notifications" ? (
          <NotificationsView onUnreadChange={setUnreadCount} />
        ) : (
          <ActivityView />
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                            */
/* -------------------------------------------------------------------------- */

function NotificationsView({
  onUnreadChange,
}: {
  onUnreadChange: (count: number) => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string[]>(["all"]);
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const category = selected[0] && selected[0] !== "all" ? selected[0] : null;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = category
        ? `/api/notifications?category=${category}`
        : "/api/notifications";
      const res = await fetch(url);
      if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
      const data = await res.json();
      setItems(data.notifications as NotificationItem[]);
      onUnreadChange(data.unreadCount as number);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [category, onUnreadChange]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (item: NotificationItem) => {
    if (item.readAt) return;
    // Optimistic: flip locally, reconcile unread count, roll back on failure.
    setItems((cur) =>
      cur.map((n) =>
        n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    onUnreadChange(Math.max(0, items.filter((n) => !n.readAt).length - 1));
    try {
      const res = await fetch(`/api/notifications/${item.id}/read`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
    } catch {
      toast({ title: "Couldn't mark as read", variant: "error" });
      void load();
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      toast({ title: "Couldn't mark all as read", variant: "error" });
    }
  };

  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          chips={CATEGORY_CHIPS}
          value={selected}
          onChange={(next) => setSelected(next.length ? next : ["all"])}
          single
          aria-label="Filter notifications by category"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={markAllRead}
          disabled={!hasUnread}
        >
          <CheckCheck />
          Mark all read
        </Button>
      </div>

      {error ? (
        <EmptyState icon={<Bell />} title="Couldn't load notifications">
          {error}
        </EmptyState>
      ) : loading ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState icon={<Inbox />} title="You're all caught up">
          No notifications in this view.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {items.map((item) => {
            const unread = !item.readAt;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => markRead(item)}
                  disabled={!unread}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                    unread ? "bg-primary/[0.04] hover:bg-secondary" : "hover:bg-secondary/60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      CATEGORY_DOT[item.category],
                      !unread && "opacity-40",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-sm",
                        unread
                          ? "font-medium text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {item.message}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatStatusLabel(item.category)} ·{" "}
                      {relativeTime(item.createdAt)}
                    </span>
                  </span>
                  {unread ? (
                    <span className="mt-1 text-xs font-medium text-primary">
                      New
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Activity log                                                             */
/* -------------------------------------------------------------------------- */

function ActivityView() {
  const [entries, setEntries] = React.useState<ActivityEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [entityFilter, setEntityFilter] = React.useState<string[]>([]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch("/api/activity-log?limit=200")
      .then(async (res) => {
        if (!res.ok)
          throw new Error((await res.json()).error ?? "Request failed");
        return res.json();
      })
      .then((data) => {
        if (active) setEntries(data.entries as ActivityEntry[]);
      })
      .catch((e: unknown) => {
        if (active)
          setError(e instanceof Error ? e.message : "Failed to load activity");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Filter chips built from the entity types actually present.
  const entityTypes = React.useMemo(
    () => Array.from(new Set(entries.map((e) => e.entityType))).sort(),
    [entries],
  );

  const visible =
    entityFilter.length === 0
      ? entries
      : entries.filter((e) => entityFilter.includes(e.entityType));

  return (
    <div className="space-y-4">
      {entityTypes.length > 0 ? (
        <FilterChips
          chips={entityTypes.map((t) => ({
            value: t,
            label: formatStatusLabel(t),
          }))}
          value={entityFilter}
          onChange={setEntityFilter}
          aria-label="Filter activity by entity type"
        />
      ) : null}

      {error ? (
        <EmptyState icon={<Bell />} title="Couldn't load activity">
          {error}
        </EmptyState>
      ) : loading ? (
        <ListSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState icon={<Inbox />} title="No activity yet">
          Actions across the app will appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {visible.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">
                    {entry.actorName ?? "System"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    performed
                  </span>{" "}
                  <span className="font-mono text-xs text-foreground">
                    {entry.action}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <StatusPill variant="neutral">
                    {formatStatusLabel(entry.entityType)}
                  </StatusPill>
                  <span className="text-xs text-muted-foreground">
                    #{entry.entityId}
                  </span>
                </div>
              </div>
              <time
                className="shrink-0 text-xs text-muted-foreground"
                dateTime={entry.createdAt}
                title={new Date(entry.createdAt).toLocaleString()}
              >
                {relativeTime(entry.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small shared bits                                                        */
/* -------------------------------------------------------------------------- */

function EmptyState({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card/40 text-center">
      <span className="text-muted-foreground [&_svg]:size-7">{icon}</span>
      <p className="text-base font-medium text-foreground">{title}</p>
      {children ? (
        <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 border-b border-border px-4 py-4 last:border-b-0"
        >
          <span className="size-2 shrink-0 rounded-full bg-secondary" />
          <span className="h-3 flex-1 animate-pulse rounded bg-secondary" />
          <span className="h-3 w-12 animate-pulse rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}
