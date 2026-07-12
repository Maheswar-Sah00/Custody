"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Check,
  Inbox,
  Loader2,
  Wrench,
  X,
} from "lucide-react";

import {
  Button,
  DataTable,
  PageHeader,
  StatusPill,
  Tabs,
  useToast,
  type DataTableColumn,
} from "@/components";
import type { UserRole } from "@/core/db/schema";
import { relativeTime } from "@/app/(app)/notifications/_components/relative-time";

// Reuse the EXACT existing mutations — no parallel approval logic lives here.
import { approveTransfer, rejectTransfer } from "@/app/(app)/allocation/actions";
import { transitionRequest } from "@/app/(app)/maintenance/actions";

import type { ApprovalInbox, ApprovalItem, ApprovalKind } from "../_data";

type Filter = "all" | ApprovalKind;

interface ApprovalsClientProps {
  inbox: ApprovalInbox;
  role: UserRole;
}

export function ApprovalsClient({ inbox, role }: ApprovalsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = React.useState<ApprovalItem[]>(inbox.items);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [busy, setBusy] = React.useState<string | null>(null);

  // Resync when the server component re-renders with fresh data.
  React.useEffect(() => {
    setItems(inbox.items);
  }, [inbox.items]);

  const showMaintenanceTab = role === "admin" || role === "asset_manager";

  const counts = React.useMemo(
    () => ({
      all: items.length,
      transfer: items.filter((i) => i.kind === "transfer").length,
      maintenance: items.filter((i) => i.kind === "maintenance").length,
    }),
    [items],
  );

  const visible = React.useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  /** Re-pull the aggregated inbox so counts stay honest after an action. */
  const refetch = React.useCallback(async () => {
    try {
      const res = await fetch("/api/approvals", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as ApprovalInbox;
      setItems(data.items);
    } catch {
      /* keep current state */
    }
  }, []);

  /** Optimistically drop the acted-on row, then reconcile with the server. */
  const remove = React.useCallback((item: ApprovalItem) => {
    setItems((prev) =>
      prev.filter((i) => !(i.kind === item.kind && i.id === item.id)),
    );
  }, []);

  const decide = React.useCallback(
    async (item: ApprovalItem, action: "approve" | "reject") => {
      const rowKey = keyOf(item);
      setBusy(rowKey);
      try {
        const result = await runDecision(item, action);
        if (!result.ok) {
          toast({
            title: "Action blocked",
            description: result.error,
            variant: "error",
          });
          // The server rejected it — refetch to reflect the true state.
          await refetch();
          return;
        }

        const verb = action === "approve" ? "approved" : "rejected";
        toast({
          title: `${item.assetTag} — ${verb}`,
          description:
            item.kind === "transfer"
              ? `Transfer ${item.fromName} → ${item.toName} ${verb}.`
              : `Maintenance request ${verb}.`,
          variant: action === "approve" ? "success" : "warning",
        });

        remove(item);
        // Keep the rest of the app (source screens, counts) in step.
        await refetch();
        router.refresh();
      } catch {
        toast({
          title: "Something went wrong",
          description: "Please try again.",
          variant: "error",
        });
      } finally {
        setBusy(null);
      }
    },
    [refetch, remove, router, toast],
  );

  const columns: DataTableColumn<ApprovalItem>[] = [
    {
      key: "kind",
      header: "Type",
      cell: (item) => <KindPill kind={item.kind} />,
    },
    {
      key: "asset",
      header: "Asset",
      cell: (item) => (
        <div className="min-w-0">
          <span className="font-mono text-sm font-medium text-foreground">
            {item.assetTag}
          </span>
          <p className="truncate text-xs text-muted-foreground">
            {item.assetName}
          </p>
        </div>
      ),
    },
    {
      key: "raisedBy",
      header: "Raised by",
      cell: (item) => item.raisedByName,
    },
    {
      key: "detail",
      header: "Detail",
      className: "max-w-xs",
      cell: (item) =>
        item.kind === "transfer" ? (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="truncate text-muted-foreground">{item.fromName}</span>
            <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{item.toName}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {item.priority ? <StatusPill status={item.priority} /> : null}
            <span className="truncate text-sm text-foreground">{item.issue}</span>
          </div>
        ),
    },
    {
      key: "age",
      header: "Pending",
      cell: (item) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {relativeTime(item.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (item) => {
        const isBusy = busy === keyOf(item);
        return (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              disabled={isBusy}
              onClick={() => decide(item, "approve")}
            >
              {isBusy ? <Loader2 className="animate-spin" /> : <Check />}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBusy}
              onClick={() => decide(item, "reject")}
            >
              <X />
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  const tabs = [
    { value: "all", label: "All", count: counts.all },
    { value: "transfer", label: "Transfers", count: counts.transfer },
    ...(showMaintenanceTab
      ? [{ value: "maintenance", label: "Maintenance", count: counts.maintenance }]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Everything awaiting your action in one place — transfer requests and maintenance approvals. Acting here runs the same flow as the original screen."
      />

      <div className="space-y-4">
        <Tabs
          items={tabs}
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
          aria-label="Filter approvals by type"
        />

        <DataTable<ApprovalItem>
          data={visible}
          columns={columns}
          getRowKey={(item) => keyOf(item)}
          emptyState={
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground">
              <Inbox className="size-6" />
              <p className="text-sm">
                {items.length === 0
                  ? "You're all caught up — nothing awaiting approval."
                  : "Nothing in this view."}
              </p>
            </div>
          }
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Stable per-row key that is unique across the two id spaces. */
function keyOf(item: ApprovalItem): string {
  return `${item.kind}:${item.id}`;
}

/** Route a decision to the matching existing server action. */
async function runDecision(
  item: ApprovalItem,
  action: "approve" | "reject",
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (item.kind === "transfer") {
    return action === "approve"
      ? approveTransfer({ transferId: item.id })
      : rejectTransfer({ transferId: item.id });
  }
  // Maintenance: 'pending' → 'approved' | 'rejected' via the existing action.
  return transitionRequest({
    requestId: item.id,
    to: action === "approve" ? "approved" : "rejected",
    technicianName: null,
  });
}

function KindPill({ kind }: { kind: ApprovalKind }) {
  if (kind === "transfer") {
    return (
      <StatusPill variant="info">
        <ArrowLeftRight className="size-3" />
        Transfer
      </StatusPill>
    );
  }
  return (
    <StatusPill variant="warning">
      <Wrench className="size-3" />
      Maintenance
    </StatusPill>
  );
}
