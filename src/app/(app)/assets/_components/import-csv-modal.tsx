"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";

import { Button, Modal, StatusPill, useToast } from "@/components";
import { importAssets, type CsvAssetRow, type ImportRowResult } from "../actions";

interface ImportCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Bulk asset import. Parses a CSV client-side, sends the rows to the
 * `importAssets` server action which validates each row (required name + a known
 * category) and imports the valid ones with auto-generated tags. Per-row results
 * — imported (with tag) or the reason it failed — are shown back to the user.
 */
export function ImportCsvModal({ open, onOpenChange }: ImportCsvModalProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<CsvAssetRow[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<ImportRowResult[] | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setFileName(null);
      setRows([]);
      setParseError(null);
      setResults(null);
    }
  }, [open]);

  async function onFile(file: File) {
    setFileName(file.name);
    setResults(null);
    setParseError(null);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setParseError("No data rows found in the file.");
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch {
      setParseError("Could not read that file as CSV.");
      setRows([]);
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      const result = await importAssets(rows);
      if (!result.ok) {
        toast({ title: "Import failed", description: result.error, variant: "error" });
        return;
      }
      setResults(result.results);
      const failed = result.results.length - result.imported;
      toast({
        title: `Imported ${result.imported} asset${result.imported === 1 ? "" : "s"}`,
        description: failed > 0 ? `${failed} row(s) had errors.` : "All rows imported.",
        variant: failed > 0 ? "warning" : "success",
      });
      if (result.imported > 0) router.refresh();
    } catch {
      toast({ title: "Import failed", description: "Please try again.", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  const importedCount = results?.filter((r) => r.status === "imported").length ?? 0;
  const errorCount = results ? results.length - importedCount : 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Import assets from CSV"
      description="Onboard many assets at once. Columns: name, category, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            {results ? "Close" : "Cancel"}
          </Button>
          {!results ? (
            <Button onClick={handleImport} disabled={submitting || rows.length === 0}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              {submitting ? "Importing…" : `Import ${rows.length || ""} row${rows.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-input bg-background px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-zinc-600 hover:text-foreground">
          <FileUp className="size-4 shrink-0" />
          <span className="truncate">{fileName ?? "Choose a .csv file"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>

        {parseError ? (
          <p className="text-sm font-medium text-destructive">{parseError}</p>
        ) : null}

        {!results && rows.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Parsed <span className="font-medium text-foreground">{rows.length}</span>{" "}
            row(s), ready to validate and import.
          </p>
        ) : null}

        {results ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="size-4" /> {importedCount} imported
              </span>
              {errorCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-red-400">
                  <XCircle className="size-4" /> {errorCount} failed
                </span>
              ) : null}
            </div>
            <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background/40 p-2">
              {results.map((r) => (
                <div
                  key={r.row}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate text-muted-foreground">
                    <span className="text-foreground">Row {r.row}</span>
                    {r.name ? ` — ${r.name}` : ""}
                  </span>
                  {r.status === "imported" ? (
                    <StatusPill variant="success">{r.tag}</StatusPill>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-red-400">
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Minimal CSV parser                                                        */
/* -------------------------------------------------------------------------- */

/** Header aliases → CsvAssetRow field. */
const HEADER_MAP: Record<string, keyof CsvAssetRow> = {
  name: "name",
  category: "category",
  serialnumber: "serialNumber",
  serial: "serialNumber",
  acquisitiondate: "acquisitionDate",
  purchasedate: "acquisitionDate",
  acquisitioncost: "acquisitionCost",
  cost: "acquisitionCost",
  price: "acquisitionCost",
  condition: "condition",
  location: "location",
  isbookable: "isBookable",
  bookable: "isBookable",
  shared: "isBookable",
};

/** Parse CSV text into typed rows. Handles quoted fields and CRLF/LF. */
function parseCsv(text: string): CsvAssetRow[] {
  const records = tokenize(text).filter(
    (fields) => fields.length > 0 && fields.some((f) => f.trim() !== ""),
  );
  if (records.length < 2) return [];

  const headers = records[0].map((h) =>
    h.trim().toLowerCase().replace(/[\s_-]+/g, ""),
  );

  return records.slice(1).map((fields) => {
    const row: CsvAssetRow = {};
    headers.forEach((h, i) => {
      const key = HEADER_MAP[h];
      if (key) row[key] = (fields[i] ?? "").trim();
    });
    return row;
  });
}

/** Split CSV text into an array of records (each an array of field strings). */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // Flush trailing field/record if the file didn't end with a newline.
  if (field !== "" || record.length > 0) {
    record.push(field);
    rows.push(record);
  }
  return rows;
}
