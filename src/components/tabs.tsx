"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export interface TabItem {
  /** Stable value emitted on select. */
  value: string
  /** Visible label. */
  label: React.ReactNode
  /** Optional trailing count badge (e.g. unread notifications). */
  count?: number
  disabled?: boolean
}

export interface TabsProps {
  items: TabItem[]
  /** Controlled active value. */
  value?: string
  /** Uncontrolled initial value; defaults to the first item. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /** Wrapper classes. */
  className?: string
  "aria-label"?: string
}

/**
 * Tabs — a pill-style tab switcher. Used by Organization setup (Departments /
 * Categories / Employee) and as filter chips elsewhere. Works controlled
 * (`value` + `onValueChange`) or uncontrolled (`defaultValue`).
 *
 * @example
 * ```tsx
 * <Tabs
 *   items={[
 *     { value: "departments", label: "Departments" },
 *     { value: "categories", label: "Categories" },
 *     { value: "employee", label: "Employee" },
 *   ]}
 *   value={tab}
 *   onValueChange={setTab}
 * />
 * ```
 */
function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  ...props
}: TabsProps) {
  const [internal, setInternal] = React.useState(
    defaultValue ?? items[0]?.value
  )
  const active = value ?? internal

  const select = (next: string) => {
    if (value === undefined) setInternal(next)
    onValueChange?.(next)
  }

  return (
    <div
      role="tablist"
      aria-label={props["aria-label"]}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1",
        className
      )}
    >
      {items.map((item) => {
        const isActive = item.value === active
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => select(item.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export { Tabs }
