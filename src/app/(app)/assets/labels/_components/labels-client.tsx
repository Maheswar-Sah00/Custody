"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Search } from "lucide-react";

import {
  Button,
  FilterChips,
  Input,
  PageHeader,
  type FilterChip,
} from "@/components";

/** Asset shape needed to render one QR label — pre-rendered server-side. */
export interface LabelAsset {
  id: number;
  tag: string;
  name: string;
  categoryId: number;
  categoryName: string;
  location: string | null;
  qrData: string;
  /** Pre-rendered QR PNG data URL (generated on the server). */
  qrImage: string;
}

interface LabelsClientProps {
  assets: LabelAsset[];
}

/**
 * QR Label Sheet picker + print preview.
 *
 * Left/top: filter and select assets (search, category / location chips, select
 * all). Below: a live A4 grid preview of the selected labels. Hitting "Print
 * Labels" (or Ctrl/Cmd+P) fires window.print(); the scoped print stylesheet
 * hides the app chrome and everything but the sheet so the browser produces a
 * clean sticker page. Entirely read-only.
 */
export function LabelsClient({ assets }: LabelsClientProps) {
  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>([]);
  const [locationFilter, setLocationFilter] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<Set<number>>(
    () => new Set(assets.map((a) => a.id)),
  );

  // Filter chips are derived straight from the data — no picklist fetch needed,
  // which keeps this route self-contained.
  const categoryChips: FilterChip[] = React.useMemo(() => {
    const seen = new Map<number, string>();
    for (const a of assets) seen.set(a.categoryId, a.categoryName);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ value: String(id), label: name }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [assets]);

  const locationChips: FilterChip[] = React.useMemo(() => {
    const seen = new Set<string>();
    for (const a of assets) if (a.location) seen.add(a.location);
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b))
      .map((loc) => ({ value: loc, label: loc }));
  }, [assets]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (q) {
        const haystack = [a.tag, a.name, a.location, a.qrData]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryFilter.length && !categoryFilter.includes(String(a.categoryId)))
        return false;
      if (locationFilter.length && !(a.location && locationFilter.includes(a.location)))
        return false;
      return true;
    });
  }, [assets, query, categoryFilter, locationFilter]);

  const selectedAssets = React.useMemo(
    () => assets.filter((a) => selected.has(a.id)),
    [assets, selected],
  );

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filteredIds = filtered.map((a) => a.id);
  const allFilteredSelected =
    filtered.length > 0 && filteredIds.every((id) => selected.has(id));

  const selectAllFiltered = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const id of filteredIds) next.delete(id);
      } else {
        for (const id of filteredIds) next.add(id);
      }
      return next;
    });

  const anyFilter = query || categoryFilter.length || locationFilter.length;

  return (
    <>
      {/* Scoped print stylesheet: only present while this page is mounted, so it
          never affects other screens. Hides the app shell (fixed sidebar +
          content offset) and everything except the label sheet. */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="qr-screen-only">
        <PageHeader
          title="QR Label Sheet"
          description="Select assets and print a sheet of scannable QR stickers."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href="/assets">
                  <ArrowLeft />
                  Back to Assets
                </Link>
              </Button>
              <Button
                onClick={() => window.print()}
                disabled={selectedAssets.length === 0}
              >
                <Printer />
                Print Labels
                {selectedAssets.length > 0 ? ` (${selectedAssets.length})` : ""}
              </Button>
            </>
          }
        />

        {/* Search */}
        <div className="relative mb-4 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by tag, name, or location…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="mb-5 space-y-3">
          {categoryChips.length ? (
            <FilterRow label="Category">
              <FilterChips
                chips={categoryChips}
                value={categoryFilter}
                onChange={setCategoryFilter}
                aria-label="Filter by category"
              />
            </FilterRow>
          ) : null}
          {locationChips.length ? (
            <FilterRow label="Location">
              <FilterChips
                chips={locationChips}
                value={locationFilter}
                onChange={setLocationFilter}
                aria-label="Filter by location"
              />
            </FilterRow>
          ) : null}
        </div>

        {/* Selection toolbar */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {selectedAssets.length} selected · {filtered.length} of {assets.length}{" "}
            assets
          </p>
          <div className="flex items-center gap-4">
            {anyFilter ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setQuery("");
                  setCategoryFilter([]);
                  setLocationFilter([]);
                }}
              >
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
              onClick={selectAllFiltered}
              disabled={filtered.length === 0}
            >
              {allFilteredSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
        </div>

        {/* Asset picker — checkbox list */}
        <div className="mb-8 max-h-80 overflow-y-auto rounded-lg border border-border">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No assets match your search and filters.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                    />
                    <span className="w-24 shrink-0 font-mono text-sm font-medium text-foreground">
                      {a.tag}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {a.name}
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {a.location ?? "—"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Preview
        </h2>
        {selectedAssets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Select one or more assets above to build the label sheet.
          </p>
        ) : null}
      </div>

      {/* The sheet: a preview on screen, the sole content in print. */}
      {selectedAssets.length > 0 ? (
        <div id="qr-sheet" className="qr-sheet">
          {selectedAssets.map((a) => (
            <div key={a.id} className="qr-label">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.qrImage}
                alt={`QR code for ${a.tag}`}
                className="qr-label__code"
              />
              <div className="qr-label__meta">
                <p className="qr-label__tag">{a.tag}</p>
                <p className="qr-label__name">{a.name}</p>
                <p className="qr-label__loc">{a.location ?? "—"}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <span className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Print + screen styles for the label sheet, scoped to this route. On screen the
 * sheet is a light "paper" preview card; in print the app chrome is hidden, the
 * page is forced white, and each label avoids breaking across page boundaries.
 */
const PRINT_CSS = `
/* On-screen preview: a white sheet so labels read as they will on paper. */
.qr-sheet {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4mm;
  background: #ffffff;
  color: #000000;
  padding: 6mm;
  border-radius: 0.5rem;
  border: 1px solid hsl(var(--border));
}
.qr-label {
  display: flex;
  align-items: center;
  gap: 3mm;
  padding: 3mm;
  border: 1px solid #d4d4d8;
  border-radius: 4px;
  break-inside: avoid;
  page-break-inside: avoid;
  background: #ffffff;
}
.qr-label__code {
  width: 22mm;
  height: 22mm;
  flex-shrink: 0;
  background: #ffffff;
}
.qr-label__meta {
  min-width: 0;
  flex: 1;
}
.qr-label__tag {
  font-family: var(--font-geist-mono, ui-monospace, monospace);
  font-weight: 700;
  font-size: 11pt;
  line-height: 1.2;
  color: #000000;
}
.qr-label__name {
  font-size: 8pt;
  line-height: 1.25;
  color: #18181b;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.qr-label__loc {
  font-size: 7.5pt;
  line-height: 1.2;
  color: #52525b;
  margin-top: 0.5mm;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media print {
  @page {
    size: A4;
    margin: 12mm;
  }
  /* Hide the app shell: fixed sidebar, command palette, and content offset. */
  aside { display: none !important; }
  .pl-60 { padding-left: 0 !important; }
  main {
    max-width: none !important;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  /* Force a printable white canvas regardless of the dark app theme. */
  html, body {
    background: #ffffff !important;
  }
  /* Everything but the sheet is screen-only. */
  .qr-screen-only { display: none !important; }
  .qr-sheet {
    border: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    gap: 4mm !important;
  }
}
`;
