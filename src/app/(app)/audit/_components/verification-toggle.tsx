"use client";

import * as React from "react";
import { Ban, CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AuditVerification } from "@/core/db/schema";

/** The three states an auditor can set (everything except the initial pending). */
export type VerificationChoice = "verified" | "missing" | "damaged";

interface Segment {
  value: VerificationChoice;
  label: string;
  icon: React.ReactNode;
  /** Active (selected) styling. */
  active: string;
}

const SEGMENTS: Segment[] = [
  {
    value: "verified",
    label: "Verified",
    icon: <CheckCircle2 />,
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  },
  {
    value: "missing",
    label: "Missing",
    icon: <Ban />,
    active: "bg-red-500/15 text-red-300 border-red-500/40",
  },
  {
    value: "damaged",
    label: "Damaged",
    icon: <TriangleAlert />,
    active: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  },
];

/**
 * Three-state pill toggle for an audit checklist row. Clicking a state selects
 * it; clicking the already-selected state clears the row back to `pending`.
 * Read-only mode (a closed cycle) renders the states without interactivity.
 */
export function VerificationToggle({
  value,
  disabled,
  busy,
  onChange,
}: {
  value: AuditVerification;
  disabled?: boolean;
  busy?: boolean;
  onChange: (next: AuditVerification) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5"
      role="group"
      aria-label="Verification"
    >
      {SEGMENTS.map((seg) => {
        const isActive = value === seg.value;
        return (
          <button
            key={seg.value}
            type="button"
            aria-pressed={isActive}
            disabled={disabled || busy}
            onClick={() => onChange(isActive ? "pending" : seg.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-xs font-medium transition-colors [&_svg]:size-3.5",
              isActive
                ? seg.active
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              (disabled || busy) && "cursor-not-allowed opacity-60",
            )}
          >
            {busy && isActive ? (
              <Loader2 className="animate-spin" />
            ) : (
              seg.icon
            )}
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
