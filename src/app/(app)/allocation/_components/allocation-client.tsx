"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Clock,
  Loader2,
  PackageCheck,
  UserPlus,
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
  Tabs,
  TextareaField,
  useToast,
} from "@/components";
import type { UserRole } from "@/core/db/schema";
import type {
  AllocatableAsset,
  AllocationData,
  AllocationEvent,
  PendingTransfer,
} from "../_data";
import {
  allocateAsset,
  approveTransfer,
  markReturned,
  rejectTransfer,
  requestTransfer,
  type ActionResult,
} from "../actions";
import { AssetCombobox } from "./asset-combobox";

interface EmployeeOption {
  id: number;
  name: string;
  department_id: number | null;
  role: string;
}
interface DepartmentOption {
  id: number;
  name: string;
}

interface AllocationClientProps {
  data: AllocationData;
  role: UserRole;
}

export function AllocationClient({ data, role }: AllocationClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [employees, setEmployees] = React.useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = React.useState<DepartmentOption[]>([]);
  const [pending, startTransition] = React.useTransition();

  const canAllocate = role === "admin" || role === "asset_manager";
  const canApprove =
    role === "admin" || role === "asset_manager" || role === "dept_head";

  React.useEffect(() => {
    fetch("/api/org/employees")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: EmployeeOption[]) => setEmployees(d))
      .catch(() => setEmployees([]));
    fetch("/api/org/departments")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: DepartmentOption[]) => setDepartments(d))
      .catch(() => setDepartments([]));
  }, []);

  const selected = data.assets.find((a) => a.id === selectedId) ?? null;

  /** Run a server action with a toast + refresh, returning success. */
  const runAction = React.useCallback(
    async (
      action: () => Promise<ActionResult>,
      successTitle: string,
    ): Promise<boolean> => {
      const result = await action();
      if (!result.ok) {
        toast({ title: "Action blocked", description: result.error, variant: "error" });
        return false;
      }
      toast({ title: successTitle, variant: "success" });
      startTransition(() => router.refresh());
      return true;
    },
    [router, toast],
  );

  const historyForSelected = selected
    ? data.history.filter((h) => h.assetId === selected.id)
    : data.history;

  return (
    <>
      <PageHeader
        title="Allocation & Transfer"
        description="Assign assets to holders, move them with an approved transfer, and check them back in."
      />

      {/* Approvals queue */}
      {canApprove && data.pendingTransfers.length > 0 ? (
        <ApprovalsCard
          transfers={data.pendingTransfers}
          disabled={pending}
          onApprove={(id) =>
            runAction(() => approveTransfer({ transferId: id }), "Transfer approved")
          }
          onReject={(id) =>
            runAction(() => rejectTransfer({ transferId: id }), "Transfer rejected")
          }
        />
      ) : null}

      {/* Asset selector */}
      <Card className="mt-6 p-6">
        <label className="mb-2 block text-sm font-medium text-foreground">
          Asset
        </label>
        <AssetCombobox
          assets={data.assets}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {selected ? (
          <div className="mt-6 border-t border-border pt-6">
            <SelectedAssetPanel
              asset={selected}
              employees={employees}
              departments={departments}
              canAllocate={canAllocate}
              disabled={pending}
              runAction={runAction}
            />
          </div>
        ) : (
          <p className="mt-6 border-t border-border pt-6 text-sm text-muted-foreground">
            Select an asset above to allocate it, request a transfer, or check it
            back in.
          </p>
        )}
      </Card>

      {/* History */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {selected
            ? `Allocation history — ${selected.tag}`
            : "Recent allocation activity"}
        </h2>
        <HistoryList events={historyForSelected} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Selected asset panel — the branching core                                 */
/* -------------------------------------------------------------------------- */

function SelectedAssetPanel({
  asset,
  employees,
  departments,
  canAllocate,
  disabled,
  runAction,
}: {
  asset: AllocatableAsset;
  employees: EmployeeOption[];
  departments: DepartmentOption[];
  canAllocate: boolean;
  disabled: boolean;
  runAction: (a: () => Promise<ActionResult>, title: string) => Promise<boolean>;
}) {
  // AVAILABLE → allocation form.
  if (asset.status === "available") {
    return (
      <AllocateForm
        asset={asset}
        employees={employees}
        departments={departments}
        canAllocate={canAllocate}
        disabled={disabled}
        runAction={runAction}
      />
    );
  }

  // ALLOCATED → conflict banner + transfer form (+ check-in).
  if (asset.status === "allocated" && asset.current) {
    return (
      <AllocatedPanel
        asset={asset}
        employees={employees}
        canAllocate={canAllocate}
        disabled={disabled}
        runAction={runAction}
      />
    );
  }

  // Any other lifecycle state — not allocatable from here.
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <p className="text-muted-foreground">
        This asset is <StatusPill status={asset.status} /> and can’t be allocated
        right now. It becomes allocatable once it returns to{" "}
        <span className="text-foreground">Available</span>.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Allocate form (available assets)                                          */
/* -------------------------------------------------------------------------- */

function AllocateForm({
  asset,
  employees,
  departments,
  canAllocate,
  disabled,
  runAction,
}: {
  asset: AllocatableAsset;
  employees: EmployeeOption[];
  departments: DepartmentOption[];
  canAllocate: boolean;
  disabled: boolean;
  runAction: (a: () => Promise<ActionResult>, title: string) => Promise<boolean>;
}) {
  const [holderType, setHolderType] = React.useState<"user" | "department">("user");
  const [holderId, setHolderId] = React.useState("");
  const [expectedReturnDate, setExpectedReturnDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  if (!canAllocate) {
    return (
      <PermissionNote>
        This asset is available, but only an asset manager can allocate it.
      </PermissionNote>
    );
  }

  async function submit() {
    if (!holderId) {
      setError(`Please choose ${holderType === "user" ? "an employee" : "a department"}.`);
      return;
    }
    setError(null);
    setSubmitting(true);
    const ok = await runAction(
      () =>
        allocateAsset({
          assetId: asset.id,
          holderType,
          holderId,
          expectedReturnDate,
        }),
      `${asset.tag} allocated`,
    );
    setSubmitting(false);
    if (ok) {
      setHolderId("");
      setExpectedReturnDate("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <StatusPill variant="success">Available</StatusPill>
        <span className="text-sm text-muted-foreground">
          Assign this asset to a holder.
        </span>
      </div>

      <Tabs
        items={[
          { value: "user", label: "Employee" },
          { value: "department", label: "Department" },
        ]}
        value={holderType}
        onValueChange={(v) => {
          setHolderType(v as "user" | "department");
          setHolderId("");
        }}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {holderType === "user" ? (
          <SelectField
            label="Allocate to employee"
            required
            placeholder="Select an employee"
            options={employees.map((e) => ({ label: e.name, value: String(e.id) }))}
            value={holderId}
            onValueChange={setHolderId}
            error={error ?? undefined}
          />
        ) : (
          <SelectField
            label="Allocate to department"
            required
            placeholder="Select a department"
            options={departments.map((d) => ({ label: d.name, value: String(d.id) }))}
            value={holderId}
            onValueChange={setHolderId}
            error={error ?? undefined}
          />
        )}
        <DatePickerField
          label="Expected return date"
          hint="Optional — leave blank for open-ended."
          value={expectedReturnDate}
          onChange={(e) => setExpectedReturnDate(e.target.value)}
        />
      </div>

      <Button onClick={submit} disabled={submitting || disabled}>
        {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
        Allocate asset
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Allocated panel — conflict banner + transfer + check-in                   */
/* -------------------------------------------------------------------------- */

function AllocatedPanel({
  asset,
  employees,
  canAllocate,
  disabled,
  runAction,
}: {
  asset: AllocatableAsset;
  employees: EmployeeOption[];
  canAllocate: boolean;
  disabled: boolean;
  runAction: (a: () => Promise<ActionResult>, title: string) => Promise<boolean>;
}) {
  const current = asset.current!;
  const holderLabel = current.departmentName
    ? `${current.holderName} (${current.departmentName})`
    : current.holderName;

  const [toUserId, setToUserId] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);

  const isDeptHeld = current.holderType === "department";

  async function submitTransfer() {
    if (!toUserId) {
      setError("Please choose who to transfer to.");
      return;
    }
    if (!reason.trim()) {
      setError("Please give a reason for the transfer.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const ok = await runAction(
      () => requestTransfer({ assetId: asset.id, toUserId, reason }),
      "Transfer request submitted",
    );
    setSubmitting(false);
    if (ok) {
      setToUserId("");
      setReason("");
    }
  }

  return (
    <div className="space-y-5">
      {/* Overdue indicator */}
      {current.isOverdue ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <Clock className="size-4 shrink-0" />
          <span>
            Overdue — expected back{" "}
            {current.expectedReturnDate
              ? new Date(current.expectedReturnDate).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "earlier"}{" "}
            ({current.daysOverdue} day{current.daysOverdue === 1 ? "" : "s"} ago).
          </span>
        </div>
      ) : null}

      {/* Conflict banner — the double-allocation block */}
      <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3">
        <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
        <p className="text-sm font-medium text-red-300">
          Already allocated to {holderLabel} — direct re-allocation is blocked —
          submit a transfer request below
        </p>
      </div>

      {/* Transfer request form */}
      <div className="rounded-lg border border-border bg-background/40 p-5">
        <div className="mb-4 flex items-center gap-2">
          <ArrowLeftRight className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Transfer request</h3>
        </div>

        {isDeptHeld ? (
          <PermissionNote>
            This asset is held by a department. Check it in first, then allocate it
            directly to its next holder.
          </PermissionNote>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">From</label>
                <div className="flex h-9 items-center rounded-md border border-input bg-secondary/40 px-3 text-sm text-muted-foreground">
                  {holderLabel}
                </div>
              </div>
              <SelectField
                label="To"
                required
                placeholder="Select an employee"
                options={employees
                  .filter((e) => e.id !== current.holderId)
                  .map((e) => ({ label: e.name, value: String(e.id) }))}
                value={toUserId}
                onValueChange={setToUserId}
              />
            </div>
            <TextareaField
              label="Reason"
              required
              placeholder="Why should this asset move?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              error={error ?? undefined}
              rows={3}
            />
            <Button onClick={submitTransfer} disabled={submitting || disabled}>
              {submitting ? <Loader2 className="animate-spin" /> : <ArrowLeftRight />}
              Submit request
            </Button>
          </div>
        )}
      </div>

      {/* Check-in (return) */}
      {canAllocate ? (
        <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-5 py-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">Returning the asset?</p>
            <p className="text-muted-foreground">
              Check it in to make it available again.
            </p>
          </div>
          <Button variant="outline" onClick={() => setReturnOpen(true)} disabled={disabled}>
            <PackageCheck />
            Mark returned
          </Button>
        </div>
      ) : null}

      <ReturnModal
        open={returnOpen}
        onOpenChange={setReturnOpen}
        asset={asset}
        holderLabel={holderLabel}
        allocationId={current.allocationId}
        runAction={runAction}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Return (check-in) modal                                                   */
/* -------------------------------------------------------------------------- */

function ReturnModal({
  open,
  onOpenChange,
  asset,
  holderLabel,
  allocationId,
  runAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AllocatableAsset;
  holderLabel: string;
  allocationId: number;
  runAction: (a: () => Promise<ActionResult>, title: string) => Promise<boolean>;
}) {
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setNotes("");
  }, [open]);

  async function submit() {
    setSubmitting(true);
    const ok = await runAction(
      () => markReturned({ allocationId, conditionNotes: notes }),
      `${asset.tag} checked in`,
    );
    setSubmitting(false);
    if (ok) onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Check in ${asset.tag}`}
      description={`Returning ${asset.name} from ${holderLabel}. The asset becomes available again.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <PackageCheck />}
            Confirm return
          </Button>
        </>
      }
    >
      <TextareaField
        label="Condition check-in notes"
        placeholder="e.g. Returned in good condition, minor scuff on lid."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
      />
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Approvals queue                                                           */
/* -------------------------------------------------------------------------- */

function ApprovalsCard({
  transfers,
  disabled,
  onApprove,
  onReject,
}: {
  transfers: PendingTransfer[];
  disabled: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}) {
  return (
    <Card className="mt-6 p-6">
      <div className="mb-4 flex items-center gap-2">
        <ArrowLeftRight className="size-4 text-primary" />
        <h2 className="text-sm font-medium text-foreground">
          Pending transfer approvals
        </h2>
        <StatusPill variant="pending">{transfers.length}</StatusPill>
      </div>
      <ul className="space-y-3">
        {transfers.map((t) => (
          <li
            key={t.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-background/40 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-medium text-foreground">{t.tag}</span>
                <span className="text-muted-foreground">{t.assetName}</span>
              </p>
              <p className="flex items-center gap-2 text-sm text-foreground">
                {t.fromName}
                <ArrowLeftRight className="size-3.5 text-muted-foreground" />
                {t.toName}
              </p>
              <p className="text-sm text-muted-foreground">“{t.reason}”</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                onClick={() => onApprove(t.id)}
                disabled={disabled}
              >
                <CheckCircle2 />
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(t.id)}
                disabled={disabled}
              >
                <XCircle />
                Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  History list                                                              */
/* -------------------------------------------------------------------------- */

function HistoryList({ events }: { events: AllocationEvent[] }) {
  if (events.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No allocation history yet.
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border p-0">
      {events.map((e) => {
        const returned = e.status === "returned";
        const date = returned && e.returnedAt ? e.returnedAt : e.allocatedAt;
        return (
          <div key={e.id} className="flex items-center gap-4 px-5 py-3.5 text-sm">
            <span className="w-16 shrink-0 font-medium text-muted-foreground">
              {formatShortDate(date)}
            </span>
            <span
              className={
                returned
                  ? "size-2 shrink-0 rounded-full bg-zinc-500"
                  : "size-2 shrink-0 rounded-full bg-emerald-500"
              }
            />
            <span className="min-w-0 flex-1">
              <span className="text-foreground">
                {returned ? "Returned by" : "Allocated to"} {e.holderName}
              </span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {e.tag}
              </span>
              {returned && e.checkinConditionNotes ? (
                <span className="text-muted-foreground">
                  {" "}
                  — condition: {e.checkinConditionNotes}
                </span>
              ) : e.departmentName ? (
                <span className="text-muted-foreground"> — {e.departmentName}</span>
              ) : null}
            </span>
            <StatusPill status={e.status} />
          </div>
        );
      })}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bits                                                                      */
/* -------------------------------------------------------------------------- */

function PermissionNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
      <p>{children}</p>
    </div>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
