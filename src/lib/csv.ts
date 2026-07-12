/**
 * Tiny client-side CSV generation + download. No external service — the file is
 * built in memory and handed to the browser as a Blob download. Used by the
 * audit discrepancy report and the reports "Export Report" button.
 */

type Cell = string | number | boolean | null | undefined;

/** RFC-4180-ish field escaping: quote when the value contains "," '"' or newlines. */
function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Build a CSV string from a header row + body rows. */
export function toCsv(header: Cell[], rows: Cell[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  // Leading BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
}

/** Trigger a browser download of `csv` as `filename`. Client-only. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
