"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Upload } from "lucide-react";

import {
  Button,
  DataTable,
  FilterChips,
  Input,
  PageHeader,
  StatusPill,
  type DataTableColumn,
  type FilterChip,
} from "@/components";
import type { AssetStatus } from "@/core/db/schema";
import type { AssetDirectoryRow } from "../_data";
import { RegisterAssetModal } from "./register-asset-modal";
import { ImportCsvModal } from "./import-csv-modal";

/** Live category shape from /api/org/categories. */
export interface CategoryOption {
  id: number;
  name: string;
  customFields: Record<string, string>;
}

interface DepartmentOption {
  id: number;
  name: string;
}

interface AssetsClientProps {
  assets: AssetDirectoryRow[];
  /** Whether the current user may register/import assets (admin/asset_manager). */
  canRegister: boolean;
}

/** Asset lifecycle statuses shown as filter chips (a fixed domain enum). */
const STATUS_CHIPS: { value: AssetStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "allocated", label: "Allocated" },
  { value: "reserved", label: "Reserved" },
  { value: "under_maintenance", label: "Under Maintenance" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
  { value: "disposed", label: "Disposed" },
];

/**
 * Asset Directory — search, live filter chips (category / status / department),
 * and a clickable table. Registration and CSV import are gated to registrars.
 */
export function AssetsClient({ assets, canRegister }: AssetsClientProps) {
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState<string[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = React.useState<string[]>([]);

  const [categories, setCategories] = React.useState<CategoryOption[]>([]);
  const [departments, setDepartments] = React.useState<DepartmentOption[]>([]);

  const [registerOpen, setRegisterOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  // Live picklists — never hardcoded (see /api/org/*).
  React.useEffect(() => {
    fetch("/api/org/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: { id: number; name: string; custom_fields: Record<string, string> }[]) =>
        setCategories(
          data.map((c) => ({ id: c.id, name: c.name, customFields: c.custom_fields ?? {} })),
        ),
      )
      .catch(() => setCategories([]));
    fetch("/api/org/departments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DepartmentOption[]) => setDepartments(data))
      .catch(() => setDepartments([]));
  }, []);

  const categoryChips: FilterChip[] = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));
  const departmentChips: FilterChip[] = departments.map((d) => ({
    value: String(d.id),
    label: d.name,
  }));

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (q) {
        const haystack = [a.tag, a.serialNumber, a.qrData, a.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (categoryFilter.length && !categoryFilter.includes(String(a.categoryId)))
        return false;
      if (statusFilter.length && !statusFilter.includes(a.status)) return false;
      if (
        departmentFilter.length &&
        !(a.departmentId && departmentFilter.includes(String(a.departmentId)))
      )
        return false;
      return true;
    });
  }, [assets, query, categoryFilter, statusFilter, departmentFilter]);

  const columns: DataTableColumn<AssetDirectoryRow>[] = [
    {
      key: "tag",
      header: "Tag",
      cell: (a) => <span className="font-medium text-foreground">{a.tag}</span>,
      className: "w-28",
    },
    {
      key: "name",
      header: "Name",
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate text-foreground">{a.name}</p>
          {a.serialNumber ? (
            <p className="truncate text-xs text-muted-foreground">
              SN {a.serialNumber}
            </p>
          ) : null}
        </div>
      ),
    },
    { key: "categoryName", header: "Category" },
    {
      key: "status",
      header: "Status",
      cell: (a) => <StatusPill status={a.status} />,
    },
    {
      key: "location",
      header: "Location",
      cell: (a) => a.location ?? <span className="text-muted-foreground">—</span>,
    },
  ];

  const anyFilter =
    categoryFilter.length || statusFilter.length || departmentFilter.length || query;

  return (
    <>
      <PageHeader
        title="Assets"
        description="Every tracked item in the organization."
        actions={
          canRegister ? (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload />
                Import CSV
              </Button>
              <Button onClick={() => setRegisterOpen(true)}>
                <Plus />
                Register Asset
              </Button>
            </>
          ) : null
        }
      />

      {/* Search */}
      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by tag, serial number, or QR code…"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div className="mb-5 space-y-3">
        <FilterRow label="Category">
          <FilterChips
            chips={categoryChips}
            value={categoryFilter}
            onChange={setCategoryFilter}
            aria-label="Filter by category"
          />
        </FilterRow>
        <FilterRow label="Status">
          <FilterChips
            chips={STATUS_CHIPS.map((s) => ({ value: s.value, label: s.label }))}
            value={statusFilter}
            onChange={setStatusFilter}
            aria-label="Filter by status"
          />
        </FilterRow>
        <FilterRow label="Department">
          <FilterChips
            chips={departmentChips}
            value={departmentFilter}
            onChange={setDepartmentFilter}
            aria-label="Filter by department"
          />
        </FilterRow>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {assets.length} assets
        </p>
        {anyFilter ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => {
              setQuery("");
              setCategoryFilter([]);
              setStatusFilter([]);
              setDepartmentFilter([]);
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <DataTable<AssetDirectoryRow>
        data={filtered}
        columns={columns}
        getRowKey={(a) => a.id}
        onRowClick={(a) => router.push(`/assets/${a.id}`)}
        emptyState={
          assets.length === 0
            ? "No assets yet. Register your first asset to get started."
            : "No assets match your search and filters."
        }
      />

      {canRegister ? (
        <>
          <RegisterAssetModal
            open={registerOpen}
            onOpenChange={setRegisterOpen}
            categories={categories}
          />
          <ImportCsvModal open={importOpen} onOpenChange={setImportOpen} />
        </>
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
