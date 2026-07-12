"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  CalendarClock,
  Download,
  Flame,
  Moon,
  TrendingUp,
  Wrench,
} from "lucide-react";

import { Button, Card, DataTable, PageHeader, type DataTableColumn } from "@/components";
import { cn } from "@/lib/utils";
import { downloadCsv, toCsv } from "@/lib/csv";

import type {
  DeptAllocationRow,
  IdleAsset,
  LifecycleAsset,
  ReportsData,
  UsedAsset,
} from "../_data";

/* Design-system chart tokens (see globals.css). Single-series charts, so each
   uses one hue and the card title names the series — no legend needed. */
const EMERALD = "hsl(160 84% 39%)"; // --chart-1
const BLUE = "hsl(217 91% 60%)"; // --chart-2
const AXIS = "hsl(240 5% 65%)"; // muted-foreground
const GRID = "hsl(240 4% 16%)"; // border

export function ReportsClient({ data }: { data: ReportsData }) {
  function exportReport() {
    const blocks: string[] = [];

    blocks.push(
      "Utilization by Department\n" +
        toCsv(
          ["Department", "Assets Allocated"],
          data.utilizationByDept.map((d) => [d.department, d.allocated]),
        ),
    );
    blocks.push(
      "Maintenance Frequency\n" +
        toCsv(
          ["Month", "Requests"],
          data.maintenanceFrequency.map((m) => [m.month, m.count]),
        ),
    );
    blocks.push(
      "Most Used Assets\n" +
        toCsv(
          ["Tag", "Asset", "Bookings (30d)"],
          data.mostUsed.map((a) => [a.tag, a.name, a.bookings]),
        ),
    );
    blocks.push(
      "Idle Assets\n" +
        toCsv(
          ["Tag", "Asset", "Days Idle", "Never Used"],
          data.idleAssets.map((a) => [
            a.tag,
            a.name,
            a.daysIdle,
            a.neverUsed ? "yes" : "no",
          ]),
        ),
    );
    blocks.push(
      "Lifecycle Watch-list\n" +
        toCsv(
          ["Tag", "Asset", "Reason", "Detail"],
          data.lifecycle.map((a) => [a.tag, a.name, a.reason, a.detail]),
        ),
    );
    blocks.push(
      "Department Allocation Summary\n" +
        toCsv(
          ["Department", "Active Allocations", "Overdue"],
          data.deptAllocationSummary.map((d) => [
            d.department,
            d.activeAllocations,
            d.overdue,
          ]),
        ),
    );

    downloadCsv(
      `assetflow-report-${data.generatedAt.slice(0, 10)}`,
      blocks.join("\r\n\r\n"),
    );
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Utilization, maintenance, and lifecycle insight across the fleet."
        actions={
          <Button variant="outline" onClick={exportReport}>
            <Download />
            Export Report
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Two charts on top */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="Utilization by Department"
            subtitle="Assets currently allocated"
            icon={<TrendingUp className="size-4" />}
          >
            {data.utilizationByDept.some((d) => d.allocated > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={data.utilizationByDept}
                  margin={{ top: 8, right: 8, left: -16, bottom: 4 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={GRID}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="department"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    interval={0}
                    tickFormatter={(v: string) =>
                      v.length > 10 ? `${v.slice(0, 9)}…` : v
                    }
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={32}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(240 4% 16% / 0.4)" }}
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "hsl(240 5% 96%)" }}
                  />
                  <Bar
                    dataKey="allocated"
                    name="Allocated"
                    fill={EMERALD}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart message="No active allocations to chart yet." />
            )}
          </ChartCard>

          <ChartCard
            title="Maintenance Frequency"
            subtitle="Requests raised per month (last 6)"
            icon={<Wrench className="size-4" />}
          >
            <ResponsiveContainer width="100%" height={260}>
              <LineChart
                data={data.maintenanceFrequency}
                margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={GRID}
                  vertical={false}
                />
                <XAxis
                  dataKey="month"
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: AXIS, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  cursor={{ stroke: GRID }}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(240 5% 96%)" }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Requests"
                  stroke={BLUE}
                  strokeWidth={2}
                  dot={{ r: 3, fill: BLUE, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Most used vs idle */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <MostUsedCard assets={data.mostUsed} />
          <IdleCard assets={data.idleAssets} />
        </div>

        {/* Lifecycle + heatmap */}
        <LifecycleCard assets={data.lifecycle} />

        <BookingHeatmap heatmap={data.heatmap} />

        {/* Department allocation summary */}
        <DeptSummaryCard rows={data.deptAllocationSummary} />
      </div>
    </>
  );
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "hsl(240 6% 10%)",
  border: "1px solid hsl(240 4% 16%)",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(240 5% 96%)",
};

/* -------------------------------------------------------------------------- */
/*  Chart card shell                                                          */
/* -------------------------------------------------------------------------- */

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Most used / idle lists                                                    */
/* -------------------------------------------------------------------------- */

function MostUsedCard({ assets }: { assets: UsedAsset[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Flame className="size-4 text-amber-400" />
        <h2 className="text-sm font-medium text-foreground">Most Used</h2>
      </div>
      {assets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No bookings in the last 30 days.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {assets.map((a) => (
            <li key={a.tag} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-sm font-medium text-foreground">
                  {a.tag}
                </span>
                <p className="truncate text-xs text-muted-foreground">{a.name}</p>
              </div>
              <span className="shrink-0 text-sm text-emerald-300">
                {a.bookings} booking{a.bookings === 1 ? "" : "s"} this month
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function IdleCard({ assets }: { assets: IdleAsset[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Moon className="size-4 text-blue-400" />
        <h2 className="text-sm font-medium text-foreground">Idle Assets</h2>
      </div>
      {assets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing has been idle for 60+ days. Healthy fleet.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {assets.map((a) => (
            <li key={a.tag} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono text-sm font-medium text-foreground">
                  {a.tag}
                </span>
                <p className="truncate text-xs text-muted-foreground">{a.name}</p>
              </div>
              <span className="shrink-0 text-sm text-muted-foreground">
                {a.neverUsed ? "never used" : `unused ${a.daysIdle}d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Lifecycle watch-list                                                      */
/* -------------------------------------------------------------------------- */

function LifecycleCard({ assets }: { assets: LifecycleAsset[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium text-foreground">
          Due for maintenance / nearing retirement
        </h2>
      </div>
      {assets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing needs attention right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {assets.map((a) => (
            <div
              key={a.tag}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
            >
              <div className="min-w-0">
                <span className="font-mono text-sm font-medium text-foreground">
                  {a.tag}
                </span>
                <p className="truncate text-xs text-muted-foreground">{a.name}</p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    a.reason === "In maintenance"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-blue-500/30 bg-blue-500/10 text-blue-300",
                  )}
                >
                  {a.reason}
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Department allocation summary                                             */
/* -------------------------------------------------------------------------- */

function DeptSummaryCard({ rows }: { rows: DeptAllocationRow[] }) {
  const columns: DataTableColumn<DeptAllocationRow>[] = [
    { key: "department", header: "Department" },
    {
      key: "activeAllocations",
      header: "Active Allocations",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
    },
    {
      key: "overdue",
      header: "Overdue",
      headerClassName: "text-right",
      cellClassName: "text-right tabular-nums",
      cell: (r) => (
        <span className={r.overdue > 0 ? "text-red-400" : "text-muted-foreground"}>
          {r.overdue}
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
        <Activity className="size-4" />
        Department allocation summary
      </h2>
      <DataTable<DeptAllocationRow>
        data={rows}
        columns={columns}
        getRowKey={(r) => r.department}
        emptyState="No departments to summarize."
      />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Booking heatmap (sequential — one hue, light→dark by count)               */
/* -------------------------------------------------------------------------- */

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon-first
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Business window keeps the grid readable; scrolls horizontally on small screens. */
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00–21:00

function BookingHeatmap({
  heatmap,
}: {
  heatmap: { grid: number[][]; maxCount: number };
}) {
  const { grid, maxCount } = heatmap;

  const cellColor = (count: number): string | undefined => {
    if (count <= 0) return undefined;
    const alpha = 0.18 + 0.82 * (count / Math.max(1, maxCount));
    return `hsla(160, 84%, 39%, ${alpha.toFixed(3)})`;
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          <Flame className="size-4" />
          Booking heatmap
        </h2>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Less
          <span className="flex gap-0.5">
            {[0.2, 0.45, 0.7, 1].map((a) => (
              <span
                key={a}
                className="size-3 rounded-sm"
                style={{ backgroundColor: `hsla(160,84%,39%,${a})` }}
              />
            ))}
          </span>
          More
        </div>
      </div>

      <Card className="overflow-x-auto p-4">
        {maxCount === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No bookings in the last 90 days to map.
          </p>
        ) : (
          <div className="min-w-[560px]">
            {/* Hour header */}
            <div className="mb-1 flex pl-10">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
                >
                  {h % 3 === 0 ? `${h}` : ""}
                </div>
              ))}
            </div>
            {DAY_ORDER.map((dow) => (
              <div key={dow} className="mb-1 flex items-center">
                <div className="w-10 pr-2 text-right text-[11px] text-muted-foreground">
                  {DAY_LABELS[dow]}
                </div>
                <div className="flex flex-1 gap-0.5">
                  {HOURS.map((h) => {
                    const count = grid[dow]?.[h] ?? 0;
                    return (
                      <div
                        key={h}
                        title={`${DAY_LABELS[dow]} ${String(h).padStart(2, "0")}:00 — ${count} booking${count === 1 ? "" : "s"}`}
                        className="aspect-square flex-1 rounded-sm border border-border/60"
                        style={{ backgroundColor: cellColor(count) }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
