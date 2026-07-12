import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * Column definition for {@link DataTable}.
 *
 * @typeParam T - the row shape (e.g. `Asset` from core/db/schema).
 */
export interface DataTableColumn<T> {
  /** Stable key; used for the React key and, by default, to read the cell value. */
  key: string
  /** Column header content. */
  header: React.ReactNode
  /**
   * Cell renderer. Receives the whole row so it can compose values, render a
   * StatusPill, format dates, etc. If omitted, `row[key]` is rendered as-is.
   */
  cell?: (row: T, rowIndex: number) => React.ReactNode
  /** Extra classes for both the header and body cells of this column. */
  className?: string
  /** Header-only classes (e.g. text alignment for a numeric column). */
  headerClassName?: string
  /** Body-cell-only classes. */
  cellClassName?: string
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  data: T[]
  /** Stable row key. Defaults to the array index (fine for static tables). */
  getRowKey?: (row: T, index: number) => React.Key
  /** Called when a row is clicked; makes rows interactive (pointer + hover). */
  onRowClick?: (row: T, index: number) => void
  /** Shown when `data` is empty. Defaults to "No records found.". */
  emptyState?: React.ReactNode
  /** Wrapper classes (border, rounding). */
  className?: string
}

/**
 * DataTable — a generic, themed table with typed columns, hover rows, an empty
 * state, and optional row clicks. Used by Assets, the employee directory, the
 * audit checklist, and anywhere else that lists records.
 *
 * @example
 * ```tsx
 * <DataTable<Asset>
 *   data={assets}
 *   getRowKey={(a) => a.id}
 *   onRowClick={(a) => router.push(`/assets/${a.id}`)}
 *   columns={[
 *     { key: "tag", header: "Tag" },
 *     { key: "name", header: "Name" },
 *     { key: "status", header: "Status",
 *       cell: (a) => <StatusPill status={a.status} /> },
 *   ]}
 * />
 * ```
 */
function DataTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  emptyState = "No records found.",
  className,
}: DataTableProps<T>) {
  const interactive = typeof onRowClick === "function"

  return (
    <div
      className={cn(
        "w-full overflow-x-auto rounded-lg border border-border bg-card",
        className
      )}
    >
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-11 px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                  column.className,
                  column.headerClassName
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="h-28 px-4 text-center text-sm text-muted-foreground"
              >
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, rowIndex) => (
              <TableRow
                key={getRowKey ? getRowKey(row, rowIndex) : rowIndex}
                onClick={
                  interactive ? () => onRowClick!(row, rowIndex) : undefined
                }
                className={cn(
                  "border-border",
                  interactive && "cursor-pointer"
                )}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-sm text-foreground",
                      column.className,
                      column.cellClassName
                    )}
                  >
                    {column.cell
                      ? column.cell(row, rowIndex)
                      : ((row as Record<string, unknown>)[
                          column.key
                        ] as React.ReactNode)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export { DataTable }
