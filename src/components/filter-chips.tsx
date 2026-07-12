"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

export interface FilterChip {
  value: string
  label: React.ReactNode
  count?: number
}

export interface FilterChipsProps {
  chips: FilterChip[]
  /** Currently selected values. */
  value: string[]
  onChange: (value: string[]) => void
  /**
   * When true, only one chip can be active at a time (radio-like). Defaults to
   * false (multi-select).
   */
  single?: boolean
  className?: string
  "aria-label"?: string
}

/**
 * FilterChips — a row of toggleable chips for filtering. Used by the Assets
 * filters (status/category) and the Notifications category filter. Controlled:
 * owns no state, emits the next selection array.
 *
 * @example
 * ```tsx
 * const [status, setStatus] = React.useState<string[]>([])
 * <FilterChips
 *   chips={[
 *     { value: "available", label: "Available" },
 *     { value: "allocated", label: "Allocated" },
 *   ]}
 *   value={status}
 *   onChange={setStatus}
 * />
 * ```
 */
function FilterChips({
  chips,
  value,
  onChange,
  single = false,
  className,
  ...props
}: FilterChipsProps) {
  const toggle = (chipValue: string) => {
    if (single) {
      onChange(value.includes(chipValue) ? [] : [chipValue])
      return
    }
    onChange(
      value.includes(chipValue)
        ? value.filter((v) => v !== chipValue)
        : [...value, chipValue]
    )
  }

  return (
    <div
      role="group"
      aria-label={props["aria-label"]}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {chips.map((chip) => {
        const active = value.includes(chip.value)
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(chip.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-zinc-600 hover:text-foreground"
            )}
          >
            {active ? <Check className="size-3.5" /> : null}
            {chip.label}
            {typeof chip.count === "number" ? (
              <span className="text-xs text-muted-foreground">
                {chip.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export { FilterChips }
