import * as React from "react"

import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

export interface KpiCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Short metric name, e.g. "Total Assets". */
  label: React.ReactNode
  /** The headline figure. Strings or numbers both render large. */
  value: React.ReactNode
  /** Optional supporting line under the value (e.g. "+4 this week"). */
  hint?: React.ReactNode
  /** Optional leading icon (a lucide icon element, typically). */
  icon?: React.ReactNode
  /**
   * Accent for the icon chip and value emphasis. Defaults to a neutral look;
   * use a semantic tone to draw attention (e.g. "warning" for discrepancies).
   */
  tone?: "default" | "success" | "info" | "warning" | "error"
}

const TONE_CLASSES: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-secondary text-muted-foreground",
  success: "bg-emerald-500/10 text-emerald-400",
  info: "bg-blue-500/10 text-blue-400",
  warning: "bg-amber-500/10 text-amber-400",
  error: "bg-red-500/10 text-red-400",
}

/**
 * KpiCard — label + big number, with an optional icon and hint. The dashboard
 * lays out a row of these (6 in the mockup).
 *
 * @example
 * ```tsx
 * <KpiCard label="Under Maintenance" value={8} tone="warning" icon={<Wrench />} />
 * ```
 */
const KpiCard = React.forwardRef<HTMLDivElement, KpiCardProps>(
  ({ label, value, hint, icon, tone = "default", className, ...props }, ref) => (
    <Card
      ref={ref}
      className={cn("flex items-start justify-between gap-4 p-5", className)}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="truncate text-sm font-medium text-muted-foreground">
          {label}
        </p>
        <p className="text-3xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {icon ? (
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
            TONE_CLASSES[tone]
          )}
        >
          {icon}
        </div>
      ) : null}
    </Card>
  )
)
KpiCard.displayName = "KpiCard"

export { KpiCard }
