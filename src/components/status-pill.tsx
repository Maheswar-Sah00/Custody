import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * StatusPill — a small colored pill for statuses across every screen.
 *
 * One component, one `variant` prop. Variants map to the shared semantic
 * palette (see globals.css):
 *   success → emerald   info → blue   error → red   warning → amber
 *   neutral → zinc      pending → zinc (muted)
 *
 * Two ways to use it:
 *   <StatusPill variant="success">Available</StatusPill>   // explicit
 *   <StatusPill status="under_maintenance" />              // inferred + labeled
 *
 * `status` accepts any of the schema status enum values (asset, allocation,
 * transfer, booking, maintenance, audit verification, entity). The variant and
 * a human label are derived automatically so callers can pass a row value
 * straight from the database.
 */
const statusPillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        info: "border-blue-500/30 bg-blue-500/10 text-blue-400",
        error: "border-red-500/30 bg-red-500/10 text-red-400",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
        neutral: "border-zinc-600/40 bg-zinc-500/10 text-zinc-300",
        pending: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

export type StatusVariant = NonNullable<
  VariantProps<typeof statusPillVariants>["variant"]
>

/**
 * Canonical status → variant map. Keyed by the raw enum values from
 * core/db/schema.ts so any table row can be rendered directly. Extend here
 * (not per-screen) when new statuses appear so colors stay consistent.
 */
const STATUS_VARIANTS: Record<string, StatusVariant> = {
  // entity / generic
  active: "success",
  inactive: "neutral",
  // asset
  available: "success",
  allocated: "info",
  reserved: "info",
  under_maintenance: "warning",
  lost: "error",
  retired: "neutral",
  disposed: "neutral",
  // allocation
  returned: "neutral",
  // transfer / maintenance approvals
  requested: "pending",
  approved: "success",
  rejected: "error",
  assigned: "info",
  in_progress: "warning",
  resolved: "success",
  // booking
  upcoming: "info",
  ongoing: "warning",
  completed: "success",
  cancelled: "neutral",
  // maintenance priority (handy for reuse)
  low: "neutral",
  medium: "info",
  high: "error",
  // audit verification
  pending: "pending",
  verified: "success",
  missing: "error",
  damaged: "warning",
  // notification categories
  alert: "error",
  approval: "info",
  booking: "info",
}

/** Map a raw status value to its semantic variant (neutral fallback). */
export function statusToVariant(status: string): StatusVariant {
  return STATUS_VARIANTS[status] ?? "neutral"
}

/** "under_maintenance" → "Under Maintenance". */
export function formatStatusLabel(status: string): string {
  return status
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export interface StatusPillProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children">,
    VariantProps<typeof statusPillVariants> {
  /** Raw status value; derives variant + label unless overridden. */
  status?: string
  /** Custom label; defaults to a humanized `status`. */
  children?: React.ReactNode
}

function StatusPill({
  className,
  variant,
  status,
  children,
  ...props
}: StatusPillProps) {
  const resolvedVariant = variant ?? (status ? statusToVariant(status) : "neutral")
  const label = children ?? (status ? formatStatusLabel(status) : null)

  return (
    <span
      className={cn(statusPillVariants({ variant: resolvedVariant }), className)}
      {...props}
    >
      {label}
    </span>
  )
}

export { StatusPill, statusPillVariants }
