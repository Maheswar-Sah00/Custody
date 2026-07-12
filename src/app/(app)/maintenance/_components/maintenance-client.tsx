"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  ImageOff,
  Loader2,
  Play,
  Plus,
  ThumbsUp,
  UserCog,
  Wrench,
  XCircle,
} from "lucide-react";

import {
  Button,
  Card,
  InputField,
  Modal,
  PageHeader,
  SelectField,
  StatusPill,
  TextareaField,
  useToast,
} from "@/components";
import type {
  MaintenancePriority,
  MaintenanceStatus,
  UserRole,
} from "@/core/db/schema";
import { cn } from "@/lib/utils";
import type { MaintenanceAssetOption, MaintenanceCard } from "../_data";
import { raiseRequest, transitionRequest } from "../actions";

/* -------------------------------------------------------------------------- */
/*  Board configuration                                                       */
/* -------------------------------------------------------------------------- */

interface ColumnDef {
  status: MaintenanceStatus;
  title: string;
  accent: string;
}

const COLUMNS: ColumnDef[] = [
  { status: "pending", title: "Pending", accent: "bg-zinc-500" },
  { status: "approved", title: "Approved", accent: "bg-emerald-500" },
  { status: "assigned", title: "Technician Assigned", accent: "bg-blue-500" },
  { status: "in_progress", title: "In Progress", accent: "bg-amber-500" },
  { status: "resolved", title: "Resolved", accent: "bg-emerald-600" },
];

/** A status a request can be moved *into* (everything except the initial 'pending'). */
type TransitionTarget = Exclude<MaintenanceStatus, "pending">;

/** Legal next status for each column (mirror of the server's MAINT_NEXT). */
const NEXT: Record<MaintenanceStatus, TransitionTarget[]> = {
  pending: ["approved", "rejected"],
  approved: ["assigned"],
  assigned: ["in_progress"],
  in_progress: ["resolved"],
  resolved: [],
  rejected: [],
};

const PRIORITY_TONE: Record<MaintenancePriority, string> = {
  low: "border-zinc-600/40 bg-zinc-500/10 text-zinc-300",
  medium: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  high: "border-red-500/40 bg-red-500/10 text-red-300",
};

interface MaintenanceClientProps {
  requests: MaintenanceCard[];
  assets: MaintenanceAssetOption[];
  role: UserRole;
  currentUserId: number;
}

export function MaintenanceClient({
  requests: initialRequests,
  assets,
  role,
}: MaintenanceClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [requests, setRequests] = React.useState<MaintenanceCard[]>(initialRequests);
  const [raiseOpen, setRaiseOpen] = React.useState(false);
  const [assignFor, setAssignFor] = React.useState<MaintenanceCard | null>(null);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);

  const canManage = role === "admin" || role === "asset_manager";

  // Keep local state in sync when the server component re-renders with fresh data.
  React.useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byStatus = React.useCallback(
    (status: MaintenanceStatus) => requests.filter((r) => r.status === status),
    [requests],
  );
  const rejected = byStatus("rejected");

  async function refetch() {
    try {
      const res = await fetch("/api/maintenance", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        columns: Record<MaintenanceStatus, MaintenanceCard[]>;
        rejected: MaintenanceCard[];
      };
      const flat = [
        ...Object.values(data.columns).flat(),
        ...data.rejected,
      ];
      setRequests(flat);
    } catch {
      /* keep current state */
    }
  }

  /** Central transition runner — fires the status + auto-flip toasts. */
  const runTransition = React.useCallback(
    async (
      card: MaintenanceCard,
      to: TransitionTarget,
      technicianName?: string,
    ): Promise<boolean> => {
      setBusyId(card.id);
      try {
        const result = await transitionRequest({
          requestId: card.id,
          to,
          technicianName: technicianName ?? null,
        });
        if (!result.ok) {
          toast({ title: "Move blocked", description: result.error, variant: "error" });
          return false;
        }

        toast({
          title: `${card.assetTag} — ${label(to)}`,
          description:
            to === "assigned" && technicianName
              ? `Assigned to ${technicianName}.`
              : undefined,
          variant: to === "rejected" ? "warning" : "success",
        });

        // The second showcase: make the auto asset-status flip loud + obvious.
        if (result.assetFlip) {
          const f = result.assetFlip;
          toast({
            title: `${f.tag} → ${label(f.to)}`,
            description: "Asset status updated automatically.",
            variant: f.to === "available" ? "success" : "warning",
            duration: 6000,
          });
        }

        await refetch();
        router.refresh();
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [router, toast],
  );

  /* ---- drag & drop ----------------------------------------------------- */

  function handleDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const card = requests.find((r) => r.id === Number(active.id));
    const target = over.id as MaintenanceStatus;
    if (!card || card.status === target) return;

    if (!(NEXT[card.status] as MaintenanceStatus[]).includes(target)) {
      toast({
        title: "Not a valid move",
        description: `A ${label(card.status)} card can't move to ${label(target)}.`,
        variant: "error",
      });
      return;
    }

    // Assigning needs a technician name — open the modal instead of moving now.
    if (target === "assigned") {
      setAssignFor(card);
      return;
    }
    await runTransition(card, target as TransitionTarget);
  }

  const activeCard = requests.find((r) => r.id === activeId) ?? null;

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Raise issues and move them Pending → Approved → Technician Assigned → In Progress → Resolved. Approving flips the asset to Under Maintenance; resolving returns it to Available."
        actions={
          <Button onClick={() => setRaiseOpen(true)}>
            <Plus />
            Raise request
          </Button>
        }
      />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.status}
              column={col}
              cards={byStatus(col.status)}
              canManage={canManage}
              busyId={busyId}
              onAction={runTransition}
              onAssign={(card) => setAssignFor(card)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeCard ? (
            <RequestCard card={activeCard} canManage={false} busy={false} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {rejected.length > 0 ? (
        <RejectedStrip cards={rejected} />
      ) : null}

      <RaiseRequestModal
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        assets={assets}
        onDone={async () => {
          await refetch();
          router.refresh();
        }}
      />

      <AssignTechnicianModal
        card={assignFor}
        onOpenChange={(open) => {
          if (!open) setAssignFor(null);
        }}
        onAssign={async (name) => {
          if (!assignFor) return false;
          const ok = await runTransition(assignFor, "assigned", name);
          if (ok) setAssignFor(null);
          return ok;
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Column (droppable)                                                        */
/* -------------------------------------------------------------------------- */

function BoardColumn({
  column,
  cards,
  canManage,
  busyId,
  onAction,
  onAssign,
}: {
  column: ColumnDef;
  cards: MaintenanceCard[];
  canManage: boolean;
  busyId: number | null;
  onAction: (
    card: MaintenanceCard,
    to: TransitionTarget,
    technicianName?: string,
  ) => Promise<boolean>;
  onAssign: (card: MaintenanceCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={cn("size-2.5 rounded-full", column.accent)} />
        <h2 className="text-sm font-medium text-foreground">{column.title}</h2>
        <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
          {cards.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[8rem] flex-1 flex-col gap-3 rounded-lg border border-dashed border-transparent p-1 transition-colors",
          isOver && "border-primary/50 bg-primary/5",
        )}
      >
        {cards.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {isOver ? "Drop to move here" : "Nothing here"}
          </p>
        ) : (
          cards.map((card) => (
            <DraggableCard
              key={card.id}
              card={card}
              canManage={canManage}
              busy={busyId === card.id}
              onAction={onAction}
              onAssign={onAssign}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Draggable card wrapper                                                    */
/* -------------------------------------------------------------------------- */

function DraggableCard({
  card,
  canManage,
  busy,
  onAction,
  onAssign,
}: {
  card: MaintenanceCard;
  canManage: boolean;
  busy: boolean;
  onAction: (
    card: MaintenanceCard,
    to: TransitionTarget,
    technicianName?: string,
  ) => Promise<boolean>;
  onAssign: (card: MaintenanceCard) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    disabled: !canManage,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(isDragging && "opacity-40")}
      {...(canManage ? { ...listeners, ...attributes } : {})}
    >
      <RequestCard
        card={card}
        canManage={canManage}
        busy={busy}
        onAction={onAction}
        onAssign={onAssign}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card                                                                      */
/* -------------------------------------------------------------------------- */

function RequestCard({
  card,
  canManage,
  busy,
  dragging,
  onAction,
  onAssign,
}: {
  card: MaintenanceCard;
  canManage: boolean;
  busy: boolean;
  dragging?: boolean;
  onAction?: (
    card: MaintenanceCard,
    to: TransitionTarget,
    technicianName?: string,
  ) => Promise<boolean>;
  onAssign?: (card: MaintenanceCard) => void;
}) {
  return (
    <Card
      className={cn(
        "space-y-2.5 p-3 shadow-sm",
        canManage && "cursor-grab active:cursor-grabbing",
        dragging && "rotate-1 shadow-lg ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Thumbnail path={card.photoPath} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-foreground">
              {card.assetTag}
            </span>
            <PriorityPill priority={card.priority} />
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-foreground">{card.issue}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {card.assetName}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>By {card.raisedByName}</span>
        {card.technicianName ? (
          <span className="flex items-center gap-1 text-foreground">
            <UserCog className="size-3.5" />
            {card.technicianName}
          </span>
        ) : null}
      </div>

      {canManage && onAction ? (
        <CardActions
          card={card}
          busy={busy}
          onAction={onAction}
          onAssign={onAssign}
        />
      ) : null}
    </Card>
  );
}

/** The explicit action buttons — the reliable fallback to drag-and-drop. */
function CardActions({
  card,
  busy,
  onAction,
  onAssign,
}: {
  card: MaintenanceCard;
  busy: boolean;
  onAction: (
    card: MaintenanceCard,
    to: TransitionTarget,
    technicianName?: string,
  ) => Promise<boolean>;
  onAssign?: (card: MaintenanceCard) => void;
}) {
  // Stop drag sensors from swallowing the click.
  const stop = (e: React.PointerEvent | React.MouseEvent) => e.stopPropagation();

  const spinner = busy ? <Loader2 className="animate-spin" /> : null;

  if (card.status === "pending") {
    return (
      <div className="flex gap-2 border-t border-border pt-2.5" onPointerDown={stop}>
        <Button
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() => onAction(card, "approved")}
        >
          {spinner ?? <ThumbsUp />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onAction(card, "rejected")}
        >
          <XCircle />
          Reject
        </Button>
      </div>
    );
  }

  if (card.status === "approved") {
    return (
      <div className="border-t border-border pt-2.5" onPointerDown={stop}>
        <Button
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onAssign?.(card)}
        >
          {spinner ?? <UserCog />}
          Assign technician
        </Button>
      </div>
    );
  }

  if (card.status === "assigned") {
    return (
      <div className="border-t border-border pt-2.5" onPointerDown={stop}>
        <Button
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onAction(card, "in_progress")}
        >
          {spinner ?? <Play />}
          Start work
        </Button>
      </div>
    );
  }

  if (card.status === "in_progress") {
    return (
      <div className="border-t border-border pt-2.5" onPointerDown={stop}>
        <Button
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onAction(card, "resolved")}
        >
          {spinner ?? <CheckCircle2 />}
          Mark resolved
        </Button>
      </div>
    );
  }

  // resolved — terminal.
  return (
    <div className="flex items-center gap-1.5 border-t border-border pt-2.5 text-xs text-emerald-400">
      <CheckCircle2 className="size-3.5" />
      Resolved{card.decidedByName ? ` by ${card.decidedByName}` : ""}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rejected strip                                                            */
/* -------------------------------------------------------------------------- */

function RejectedStrip({ cards }: { cards: MaintenanceCard[] }) {
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <CircleSlash className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Rejected ({cards.length})
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.id} className="flex items-start gap-2.5 p-3 opacity-70">
            <Thumbnail path={card.photoPath} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-foreground">
                  {card.assetTag}
                </span>
                <StatusPill status="rejected" />
              </div>
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {card.issue}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Raise request modal                                                       */
/* -------------------------------------------------------------------------- */

function RaiseRequestModal({
  open,
  onOpenChange,
  assets,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assets: MaintenanceAssetOption[];
  onDone: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [assetId, setAssetId] = React.useState("");
  const [issue, setIssue] = React.useState("");
  const [priority, setPriority] = React.useState<MaintenancePriority>("medium");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [errors, setErrors] = React.useState<{ assetId?: string; issue?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setAssetId("");
      setIssue("");
      setPriority("medium");
      setPhoto(null);
      setErrors({});
    }
  }, [open]);

  async function uploadPhoto(file: File): Promise<string> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Photo upload failed.");
    }
    const data = (await res.json()) as { path: string };
    return data.path;
  }

  async function submit() {
    const next: typeof errors = {};
    if (!assetId) next.assetId = "Select the asset with the issue.";
    if (!issue.trim()) next.issue = "Describe the issue.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      let photoPath: string | null = null;
      if (photo) photoPath = await uploadPhoto(photo);

      const result = await raiseRequest({
        assetId: Number(assetId),
        issue,
        priority,
        photoPath,
      });
      if (!result.ok) {
        toast({ title: "Couldn't raise request", description: result.error, variant: "error" });
        return;
      }
      toast({ title: "Request raised", description: "It's now in Pending.", variant: "success" });
      onOpenChange(false);
      await onDone();
    } catch (error) {
      toast({
        title: "Couldn't raise request",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Raise maintenance request"
      description="Report an issue with an asset. It lands in Pending for an asset manager to approve."
      className="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Wrench />}
            Raise request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SelectField
          label="Asset"
          required
          placeholder="Select the affected asset"
          options={assets.map((a) => ({
            label: `${a.tag} · ${a.name}`,
            value: String(a.id),
          }))}
          value={assetId}
          onValueChange={setAssetId}
          error={errors.assetId}
        />
        <TextareaField
          label="Issue"
          required
          placeholder="e.g. Projector bulb not turning on"
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          error={errors.issue}
          rows={3}
        />
        <SelectField
          label="Priority"
          options={[
            { label: "Low", value: "low" },
            { label: "Medium", value: "medium" },
            { label: "High", value: "high" },
          ]}
          value={priority}
          onValueChange={(v) => setPriority(v as MaintenancePriority)}
        />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Photo (optional)</p>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-zinc-600 hover:text-foreground">
            <Plus className="size-4 shrink-0" />
            <span className="truncate">
              {photo ? photo.name : "Attach a photo (PNG, JPG, WebP — max 5 MB)"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Assign technician modal                                                   */
/* -------------------------------------------------------------------------- */

function AssignTechnicianModal({
  card,
  onOpenChange,
  onAssign,
}: {
  card: MaintenanceCard | null;
  onOpenChange: (open: boolean) => void;
  onAssign: (name: string) => Promise<boolean>;
}) {
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (card) {
      setName(card.technicianName ?? "");
      setError(null);
    }
  }, [card]);

  async function submit() {
    if (!name.trim()) {
      setError("Enter the technician's name.");
      return;
    }
    setSubmitting(true);
    const ok = await onAssign(name.trim());
    setSubmitting(false);
    if (!ok) setError("Couldn't assign — see the notification.");
  }

  return (
    <Modal
      open={card != null}
      onOpenChange={onOpenChange}
      title="Assign technician"
      description={
        card
          ? `Assign a technician to ${card.assetTag} — this moves the asset to Under Maintenance.`
          : ""
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <UserCog />}
            Assign
          </Button>
        </>
      }
    >
      <InputField
        label="Technician name"
        required
        placeholder="e.g. Suresh Kumar"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error ?? undefined}
      />
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small pieces                                                              */
/* -------------------------------------------------------------------------- */

function PriorityPill({ priority }: { priority: MaintenancePriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        PRIORITY_TONE[priority],
      )}
    >
      <ChevronRight className="size-2.5" />
      {priority}
    </span>
  );
}

function Thumbnail({ path }: { path: string | null }) {
  if (!path) {
    return (
      <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground">
        <ImageOff className="size-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={path}
      alt="Attached"
      className="size-11 shrink-0 rounded-md border border-border object-cover"
    />
  );
}

/** "under_maintenance" → "Under Maintenance", "in_progress" → "In Progress". */
function label(value: string): string {
  return value
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
