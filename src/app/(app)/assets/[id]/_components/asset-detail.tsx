"use client";

import * as React from "react";
import { Printer } from "lucide-react";

import {
  Button,
  Card,
  DataTable,
  PageHeader,
  StatusPill,
  Tabs,
  formatStatusLabel,
  type DataTableColumn,
} from "@/components";
import type {
  AllocationHistoryRow,
  AssetDetail,
  MaintenanceHistoryRow,
} from "../../_data";

interface AssetDetailViewProps {
  detail: AssetDetail;
  /** Pre-rendered QR PNG data URL. */
  qrImage: string;
}

export function AssetDetailView({ detail, qrImage }: AssetDetailViewProps) {
  const [tab, setTab] = React.useState<"allocation" | "maintenance">("allocation");

  const customFieldEntries = Object.entries(detail.customFieldDefs);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span>{detail.name}</span>
            <StatusPill status={detail.status} />
          </span>
        }
        description={
          <span className="font-mono text-sm text-muted-foreground">
            {detail.tag}
          </span>
        }
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print QR
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Left: photo + QR */}
        <div className="space-y-6">
          {detail.photoPath ? (
            <Card className="overflow-hidden p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.photoPath}
                alt={detail.name}
                className="h-48 w-full object-cover"
              />
            </Card>
          ) : null}

          <Card className="flex flex-col items-center gap-3 p-6">
            <p className="self-start text-xs font-medium uppercase tracking-wide text-muted-foreground">
              QR code
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrImage}
              alt={`QR code for ${detail.tag}`}
              className="size-44 rounded-lg bg-white p-2"
            />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">
              {detail.qrData}
            </p>
          </Card>
        </div>

        {/* Right: fields + history */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Details
            </h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <Field label="Category" value={detail.categoryName} />
              <Field label="Status" value={formatStatusLabel(detail.status)} />
              <Field label="Serial number" value={detail.serialNumber} mono />
              <Field label="Condition" value={detail.condition} />
              <Field label="Location" value={detail.location} />
              <Field
                label="Acquisition date"
                value={detail.acquisitionDate ? formatDate(detail.acquisitionDate) : null}
              />
              <Field
                label="Acquisition cost"
                value={detail.acquisitionCost ? formatMoney(detail.acquisitionCost) : null}
              />
              <Field
                label="Shared / bookable"
                value={detail.isBookable ? "Yes" : "No"}
              />
              {customFieldEntries.map(([key]) => (
                <Field
                  key={key}
                  label={humanizeKey(key)}
                  value={detail.customValues[key] ?? null}
                />
              ))}
            </dl>
          </Card>

          <Card className="p-6">
            <div className="mb-4">
              <Tabs
                items={[
                  {
                    value: "allocation",
                    label: "Allocation History",
                    count: detail.allocationHistory.length,
                  },
                  {
                    value: "maintenance",
                    label: "Maintenance History",
                    count: detail.maintenanceHistory.length,
                  },
                ]}
                value={tab}
                onValueChange={(v) => setTab(v as typeof tab)}
              />
            </div>

            {tab === "allocation" ? (
              <AllocationHistoryTable rows={detail.allocationHistory} />
            ) : (
              <MaintenanceHistoryTable rows={detail.maintenanceHistory} />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  History tables                                                            */
/* -------------------------------------------------------------------------- */

function AllocationHistoryTable({ rows }: { rows: AllocationHistoryRow[] }) {
  const columns: DataTableColumn<AllocationHistoryRow>[] = [
    {
      key: "holderName",
      header: "Holder",
      cell: (r) => (
        <span className="text-foreground">
          {r.holderName}
          <span className="ml-2 text-xs text-muted-foreground">
            {r.holderType === "department" ? "Department" : "Employee"}
          </span>
        </span>
      ),
    },
    {
      key: "allocatedAt",
      header: "Allocated",
      cell: (r) => formatDate(r.allocatedAt),
    },
    {
      key: "expectedReturnDate",
      header: "Expected return",
      cell: (r) =>
        r.expectedReturnDate ? formatDate(r.expectedReturnDate) : <Dash />,
    },
    {
      key: "returnedAt",
      header: "Returned",
      cell: (r) => (r.returnedAt ? formatDate(r.returnedAt) : <Dash />),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
  ];
  return (
    <DataTable<AllocationHistoryRow>
      data={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      emptyState="This asset has never been allocated."
    />
  );
}

function MaintenanceHistoryTable({ rows }: { rows: MaintenanceHistoryRow[] }) {
  const columns: DataTableColumn<MaintenanceHistoryRow>[] = [
    { key: "issue", header: "Issue" },
    {
      key: "priority",
      header: "Priority",
      cell: (r) => <StatusPill status={r.priority} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "technicianName",
      header: "Technician",
      cell: (r) => r.technicianName ?? <Dash />,
    },
    { key: "createdAt", header: "Raised", cell: (r) => formatDate(r.createdAt) },
  ];
  return (
    <DataTable<MaintenanceHistoryRow>
      data={rows}
      columns={columns}
      getRowKey={(r) => r.id}
      emptyState="No maintenance requests for this asset."
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Bits                                                                      */
/* -------------------------------------------------------------------------- */

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-sm text-foreground" : "text-sm text-foreground"}>
        {value ?? <Dash />}
      </dd>
    </div>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatMoney(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function humanizeKey(key: string): string {
  return key
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
