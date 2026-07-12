"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  Boxes,
  CalendarDays,
  Loader2,
  Search,
  User as UserIcon,
} from "lucide-react";

import { StatusPill, formatStatusLabel } from "@/components";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Result shapes (mirror /api/search)                                        */
/* -------------------------------------------------------------------------- */

interface SearchResults {
  assets: { id: number; tag: string; name: string; status: string }[];
  people: { id: number; name: string; role: string; department: string | null }[];
  resources: { id: number; tag: string; name: string; location: string | null }[];
}

const EMPTY: SearchResults = { assets: [], people: [], resources: [] };

/**
 * Global Cmd+K / Ctrl+K command palette. Searches assets, people, and bookable
 * resources through /api/search (server-side, debounced) and navigates to the
 * relevant screen on select. Mounted once from the app shell.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>(EMPTY);
  const [loading, setLoading] = React.useState(false);

  // Cmd+K / Ctrl+K toggles the palette from anywhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Reset on close.
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setLoading(false);
    }
  }, [open]);

  // Debounced search whenever the query changes while open.
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as SearchResults;
        setResults(data);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setResults(EMPTY);
        }
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const hasResults =
    results.assets.length + results.people.length + results.resources.length > 0;

  return (
    <>
      {/* Discoverable trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 top-3 z-30 flex items-center gap-2 rounded-lg border border-border bg-card/80 px-3 py-1.5 text-sm text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        aria-label="Open search"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            aria-label="Global search"
            className="fixed left-1/2 top-[14%] z-50 w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          >
            <DialogPrimitive.Title className="sr-only">
              Search AssetFlow
            </DialogPrimitive.Title>

            <Command
              shouldFilter={false}
              className="flex flex-col"
              loop
            >
              <div className="flex items-center gap-2.5 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search assets, people, resources…"
                  className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                {loading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </div>

              <Command.List className="max-h-[min(60vh,24rem)] overflow-y-auto p-2">
                {query.trim().length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                    Type to search across assets, people, and resources.
                  </p>
                ) : !loading && !hasResults ? (
                  <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
                    No matches for “{query.trim()}”.
                  </Command.Empty>
                ) : null}

                {results.assets.length > 0 ? (
                  <Group heading="Assets">
                    {results.assets.map((a) => (
                      <Item
                        key={`asset-${a.id}`}
                        value={`asset-${a.id}-${a.tag}`}
                        onSelect={() => go(`/assets/${a.id}`)}
                        icon={<Boxes className="size-4" />}
                        title={a.tag}
                        subtitle={a.name}
                        trailing={<StatusPill status={a.status} />}
                      />
                    ))}
                  </Group>
                ) : null}

                {results.people.length > 0 ? (
                  <Group heading="People">
                    {results.people.map((p) => (
                      <Item
                        key={`person-${p.id}`}
                        value={`person-${p.id}-${p.name}`}
                        onSelect={() => go("/org")}
                        icon={<UserIcon className="size-4" />}
                        title={p.name}
                        subtitle={[formatStatusLabel(p.role), p.department]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))}
                  </Group>
                ) : null}

                {results.resources.length > 0 ? (
                  <Group heading="Resources">
                    {results.resources.map((r) => (
                      <Item
                        key={`resource-${r.id}`}
                        value={`resource-${r.id}-${r.tag}`}
                        onSelect={() => go("/booking")}
                        icon={<CalendarDays className="size-4" />}
                        title={r.tag}
                        subtitle={r.name}
                        trailing={
                          r.location ? (
                            <span className="text-xs text-muted-foreground">
                              {r.location}
                            </span>
                          ) : null
                        }
                      />
                    ))}
                  </Group>
                ) : null}
              </Command.List>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small styled cmdk pieces                                                  */
/* -------------------------------------------------------------------------- */

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  value,
  onSelect,
  icon,
  title,
  subtitle,
  trailing,
}: {
  value: string;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground transition-colors",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="font-medium">{title}</span>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </Command.Item>
  );
}
