import * as React from "react"

import { cn } from "@/lib/utils"

export interface PageHeaderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Page title. */
  title: React.ReactNode
  /** Optional supporting text below the title. */
  description?: React.ReactNode
  /** Right-aligned slot — typically an action Button or a group of controls. */
  actions?: React.ReactNode
}

/**
 * PageHeader — a consistent page title row with an optional description and a
 * right-aligned actions slot. Put it at the top of every screen so headings
 * line up across the app.
 *
 * @example
 * ```tsx
 * <PageHeader
 *   title="Assets"
 *   description="Every tracked item in the organization."
 *   actions={<Button>Register asset</Button>}
 * />
 * ```
 */
const PageHeader = React.forwardRef<HTMLDivElement, PageHeaderProps>(
  ({ title, description, actions, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
)
PageHeader.displayName = "PageHeader"

export { PageHeader }
