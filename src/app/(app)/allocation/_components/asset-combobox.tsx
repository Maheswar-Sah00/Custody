"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { Input, StatusPill } from "@/components";
import { cn } from "@/lib/utils";
import type { AllocatableAsset } from "../_data";

interface AssetComboboxProps {
  assets: AllocatableAsset[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/**
 * Searchable asset selector for the top of the allocation screen. Type a tag or
 * name (e.g. "AF-0114" or "MacBook") and pick the asset; the current status is
 * shown inline so the holder can see at a glance what state it's in.
 */
export function AssetCombobox({ assets, selectedId, onSelect }: AssetComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = assets.find((a) => a.id === selectedId) ?? null;

  // Close on outside click.
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets.slice(0, 50);
    return assets
      .filter((a) => `${a.tag} ${a.name}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [assets, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-input bg-background px-4 py-3 text-left text-sm transition-colors hover:border-zinc-600"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-3">
            <span className="font-mono font-medium text-foreground">{selected.tag}</span>
            <span className="truncate text-muted-foreground">{selected.name}</span>
            <StatusPill status={selected.status} />
          </span>
        ) : (
          <span className="text-muted-foreground">Search and select an asset…</span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Type a tag or name…"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No assets match “{query}”.
              </li>
            ) : (
              matches.map((a) => {
                const isSelected = a.id === selectedId;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(a.id);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-secondary",
                        isSelected && "bg-secondary/60",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0 text-primary",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="w-20 shrink-0 font-mono font-medium text-foreground">
                        {a.tag}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {a.name}
                      </span>
                      <StatusPill status={a.status} />
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
