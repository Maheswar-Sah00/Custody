"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Download,
  Lock,
  Loader2,
  Plus,
  QrCode,
  ScanLine,
  TriangleAlert,
  Users,
} from "lucide-react";

import {
  Button,
  Card,
  DataTable,
  PageHeader,
  StatusPill,
  useToast,
  type DataTableColumn,
} from "@/components";
import type { AuditVerification, UserRole } from "@/core/db/schema";
import { cn } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/lib/csv";

import type {
  AuditCycleDetail,
  AuditCycleSummary,
  AuditItemRow,
  CreateAuditOptions,
} from "../_data";
import { scopeLabel } from "../scope";
import { closeAuditCycle, setItemVerification } from "../actions";
import { CreateCycleModal } from "./create-cycle-modal";
import { QrScanModal } from "./qr-scan-modal";
import { VerificationToggle } from "./verification-toggle";

interface AuditClientProps {
  cycles: AuditCycleSummary[];
  detail: AuditCycleDetail | null;
  options: CreateAuditOptions;
  currentUser: { id: number; name: string; role: UserRole };
}

export function AuditClient({
  cycles,
  detail,
  options,
  currentUser,
}: AuditClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [items, setItems] = React.useState<AuditItemRow[]>(detail?.items ?? []);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [highlightId, setHighlightId] = React.useState<number | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [closing, setClosing] = React.useState(false);

  // Re-sync when the server component sends a different cycle / fresh data.
  React.useEffect(() => {
    setItems(detail?.items ?? []);
  }, [detail]);

  const canManage =
    currentUser.role === "admin" || currentUser.role === "asset_manager";
  const isAuditor = !!detail?.auditors.some((a) => a.id === currentUser.id);
  const cycleOpen = detail?.status === "open";
  const canMarkItems = !!cycleOpen && (canManage || isAuditor);

  // Live tallies — recomputed from local state so the banner reacts instantly.
  const flagged = React.useMemo(
    () =>
      items.filter(
        (i) => i.verification === "missing" || i.verification === "damaged",
      ),
    [items],
  );
  const verifiedCount = items.filter((i) => i.verification === "verified").length;
  const pendingCount = items.filter((i) => i.verification === "pending").length;

  /* ---- navigation between cycles --------------------------------------- */
  const goToCycle = (id: number) => router.push(`/audit?cycle=${id}`);

  /* ---- verification (optimistic, shared by table + scanner) ------------ */
  const applyVerification = React.useCallback(
    async (itemId: number, next: AuditVerification): Promise<boolean> => {
      const before = items.find((i) => i.id === itemId);
      setBusyId(itemId);
      setItems((cur) =>
        cur.map((i) =>
          i.id === itemId
            ? {
                ...i,
                verification: next,
                auditorId: currentUser.id,
                auditorName: currentUser.name,
              }
            : i,
        ),
      );
      const res = await setItemVerification({ itemId, verification: next });
      setBusyId(null);
      if (!res.ok) {
        // Revert just this row.
        setItems((cur) =>
          cur.map((i) => (i.id === itemId && before ? before : i)),
        );
        toast({
          title: "Couldn't update",
          description: res.error,
          variant: "error",
        });
        return false;
      }
      return true;
    },
    [items, currentUser.id, currentUser.name, toast],
  );

  const markFromScan = React.useCallback(
    (item: AuditItemRow, verification: AuditVerification) =>
      applyVerification(item.id, verification),
    [applyVerification],
  );

  const handleScanMatch = React.useCallback((item: AuditItemRow) => {
    setHighlightId(item.id);
    // Scroll the row into view behind the modal so it's framed when it closes.
    if (typeof document !== "undefined") {
      document
        .getElementById(`audit-item-${item.id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  // Fade the highlight out shortly after it's set.
  React.useEffect(() => {
    if (highlightId == null) return;
    const t = setTimeout(() => setHighlightId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightId]);

  /* ---- close cycle ----------------------------------------------------- */
  async function handleClose() {
    if (!detail) return;
    setClosing(true);
    try {
      const res = await closeAuditCycle({ cycleId: detail.id });
      if (!res.ok) {
        toast({
          title: "Couldn't close cycle",
          description: res.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Audit cycle closed",
        description:
          res.discrepancyCount === 0
            ? "No discrepancies — everything verified."
            : `${res.discrepancyCount} discrepancy${res.discrepancyCount === 1 ? "" : "ies"} recorded${
                res.lostCount > 0
                  ? `, ${res.lostCount} asset${res.lostCount === 1 ? "" : "s"} flagged lost`
                  : ""
              }.`,
        variant: res.discrepancyCount > 0 ? "warning" : "success",
        duration: 6000,
      });
      router.refresh();
    } finally {
      setClosing(false);
    }
  }

  /* ---- CSV export of the discrepancy report ---------------------------- */
  function exportDiscrepancies() {
    if (!detail) return;
    const header = ["Tag", "Asset", "Expected Location", "Verdict", "Auditor"];
    const rows = flagged.map((i) => [
      i.tag,
      i.assetName,
      i.expectedLocation ?? "",
      i.verification,
      i.auditorName ?? "",
    ]);
    downloadCsv(
      `discrepancy-report-${detail.name.replace(/\s+/g, "-").toLowerCase()}`,
      toCsv(header, rows),
    );
  }

  /* ---- checklist columns ----------------------------------------------- */
  const columns: DataTableColumn<AuditItemRow>[] = [
    {
      key: "asset",
      header: "Asset",
      cell: (row) => (
        <div
          id={`audit-item-${row.id}`}
          className={cn(
            "-mx-1 rounded-md px-1 py-0.5 transition-colors",
            highlightId === row.id && "bg-primary/15 ring-1 ring-primary/50",
          )}
        >
          <span className="font-mono text-sm font-medium text-foreground">
            {row.tag}
          </span>
          <p className="truncate text-xs text-muted-foreground">
            {row.assetName}
          </p>
        </div>
      ),
    },
    {
      key: "expectedLocation",
      header: "Expected Location",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.expectedLocation ?? "—"}
        </span>
      ),
    },
    {
      key: "verification",
      header: "Verification",
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (row) =>
        canMarkItems ? (
          <div className="flex justify-end">
            <VerificationToggle
              value={row.verification}
              busy={busyId === row.id}
              onChange={(next) => applyVerification(row.id, next)}
            />
          </div>
        ) : (
          <StatusPill status={row.verification} />
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Asset Audit"
        description="Run verification cycles, mark each asset, and let discrepancies flag themselves."
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              New audit cycle
            </Button>
          ) : null
        }
      />

      {cycles.length === 0 ? (
        <EmptyState canManage={canManage} onCreate={() => setCreateOpen(true)} />
      ) : (
        <div className="space-y-6">
          <CycleSwitcher
            cycles={cycles}
            selectedId={detail?.id ?? null}
            onSelect={goToCycle}
          />

          {detail ? (
            <>
              <SummaryCard
                detail={detail}
                verifiedCount={verifiedCount}
                pendingCount={pendingCount}
                flaggedCount={flagged.length}
                actions={
                  cycleOpen ? (
                    <div className="flex flex-wrap gap-2">
                      {canMarkItems ? (
                        <Button
                          variant="secondary"
                          onClick={() => setScanOpen(true)}
                        >
                          <QrCode />
                          Scan
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button
                          variant="outline"
                          onClick={handleClose}
                          disabled={closing}
                        >
                          {closing ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Lock />
                          )}
                          Close Audit Cycle
                        </Button>
                      ) : null}
                    </div>
                  ) : null
                }
              />

              {/* Live discrepancy banner — updates the moment an item is flagged. */}
              {flagged.length > 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                  <TriangleAlert className="size-5 shrink-0 text-amber-400" />
                  <span className="font-medium text-amber-200">
                    {flagged.length} asset{flagged.length === 1 ? "" : "s"} flagged
                  </span>
                  <span className="text-amber-300/80">
                    — discrepancy report generated automatically
                  </span>
                </div>
              ) : null}

              {/* Checklist */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    <ClipboardCheck className="size-4" />
                    Checklist
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  </h2>
                  {canMarkItems ? (
                    <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <ScanLine className="size-3.5" />
                      Tip: use Scan to mark from a printed QR code
                    </p>
                  ) : null}
                </div>
                <DataTable<AuditItemRow>
                  data={items}
                  columns={columns}
                  getRowKey={(r) => r.id}
                  emptyState="No assets matched this cycle's scope."
                />
              </section>

              {/* Discrepancy report */}
              <DiscrepancyReport
                flagged={flagged}
                onExport={exportDiscrepancies}
              />
            </>
          ) : null}
        </div>
      )}

      <CreateCycleModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        options={options}
        onCreated={(id) => goToCycle(id)}
      />

      {detail ? (
        <QrScanModal
          open={scanOpen}
          onOpenChange={setScanOpen}
          items={items}
          canMark={canMarkItems}
          onMark={markFromScan}
          onScanMatch={handleScanMatch}
        />
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cycle switcher (active + history)                                         */
/* -------------------------------------------------------------------------- */

function CycleSwitcher({
  cycles,
  selectedId,
  onSelect,
}: {
  cycles: AuditCycleSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {cycles.map((c) => {
        const active = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex min-w-[13rem] shrink-0 flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:border-zinc-600",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {c.name}
              </span>
              <StatusPill
                variant={c.status === "open" ? "info" : "neutral"}
                status={c.status}
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{scopeLabel(c)}</span>
              {c.flaggedCount > 0 ? (
                <span className="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300">
                  {c.flaggedCount} flagged
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Summary card                                                              */
/* -------------------------------------------------------------------------- */

function SummaryCard({
  detail,
  verifiedCount,
  pendingCount,
  flaggedCount,
  actions,
}: {
  detail: AuditCycleDetail;
  verifiedCount: number;
  pendingCount: number;
  flaggedCount: number;
  actions: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-foreground">
              {detail.name}
            </h2>
            <StatusPill
              variant={detail.status === "open" ? "info" : "neutral"}
              status={detail.status}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {scopeLabel(detail)} · {formatDateRange(detail.startDate, detail.endDate)}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-3.5" />
            Auditors:{" "}
            <span className="text-foreground">
              {detail.auditors.length > 0
                ? detail.auditors.map((a) => a.name).join(", ")
                : "—"}
            </span>
          </p>
        </div>
        {actions}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Assets" value={detail.itemCount} />
        <Stat label="Verified" value={verifiedCount} tone="text-emerald-300" />
        <Stat label="Pending" value={pendingCount} tone="text-zinc-300" />
        <Stat label="Flagged" value={flaggedCount} tone="text-amber-300" />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-semibold tabular-nums text-foreground", tone)}>
        {value}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Discrepancy report                                                        */
/* -------------------------------------------------------------------------- */

function DiscrepancyReport({
  flagged,
  onExport,
}: {
  flagged: AuditItemRow[];
  onExport: () => void;
}) {
  const columns: DataTableColumn<AuditItemRow>[] = [
    {
      key: "tag",
      header: "Asset",
      cell: (r) => (
        <div>
          <span className="font-mono text-sm font-medium text-foreground">
            {r.tag}
          </span>
          <p className="truncate text-xs text-muted-foreground">{r.assetName}</p>
        </div>
      ),
    },
    {
      key: "expectedLocation",
      header: "Expected Location",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.expectedLocation ?? "—"}
        </span>
      ),
    },
    {
      key: "verification",
      header: "Verdict",
      cell: (r) => <StatusPill status={r.verification} />,
    },
    {
      key: "auditor",
      header: "Auditor",
      cell: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.auditorName ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <TriangleAlert className="size-4" />
          Discrepancy report
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {flagged.length}
          </span>
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          disabled={flagged.length === 0}
        >
          <Download />
          Export CSV
        </Button>
      </div>
      {flagged.length === 0 ? (
        <Card className="px-4 py-8 text-center text-sm text-muted-foreground">
          No discrepancies flagged. Missing and damaged assets appear here
          automatically.
        </Card>
      ) : (
        <DataTable<AuditItemRow>
          data={flagged}
          columns={columns}
          getRowKey={(r) => r.id}
        />
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                               */
/* -------------------------------------------------------------------------- */

function EmptyState({
  canManage,
  onCreate,
}: {
  canManage: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 text-center">
      <ClipboardCheck className="size-8 text-muted-foreground" />
      <p className="mt-3 text-lg font-medium text-foreground">
        No audit cycles yet
      </p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create a cycle to verify a department or location&apos;s assets. Missing
        and damaged items are reported automatically.
      </p>
      {canManage ? (
        <Button className="mt-4" onClick={onCreate}>
          <Plus />
          New audit cycle
        </Button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** "1–15 Jul" (same month) or "28 Jun – 12 Jul" (spanning months). */
function formatDateRange(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startISO} – ${endISO}`;
  }
  const mon = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${end.getDate()} ${mon(end)}`;
  }
  return `${start.getDate()} ${mon(start)} – ${end.getDate()} ${mon(end)}`;
}
