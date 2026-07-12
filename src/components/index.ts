/**
 * AssetFlow shared component library.
 *
 * Import everything from here so screens have one obvious source:
 *
 *   import { DataTable, StatusPill, KpiCard, PageHeader } from "@/components"
 *
 * The higher-level components below are the ones feature screens compose with.
 * The low-level shadcn primitives they build on (Button, Card, Dialog, …) are
 * re-exported at the bottom for convenience.
 */

/* -------------------------------------------------------------------------- */
/*  Shared library components                                                 */
/* -------------------------------------------------------------------------- */

export { DataTable, type DataTableColumn, type DataTableProps } from "./data-table"
export {
  StatusPill,
  statusPillVariants,
  statusToVariant,
  formatStatusLabel,
  type StatusVariant,
  type StatusPillProps,
} from "./status-pill"
export { KpiCard, type KpiCardProps } from "./kpi-card"
export { PageHeader, type PageHeaderProps } from "./page-header"
export {
  InputField,
  TextareaField,
  SelectField,
  DatePickerField,
  FieldShell,
  type InputFieldProps,
  type TextareaFieldProps,
  type SelectFieldProps,
  type SelectOption,
  type DatePickerFieldProps,
} from "./form-field"
export { Tabs, type TabItem, type TabsProps } from "./tabs"
export { FilterChips, type FilterChip, type FilterChipsProps } from "./filter-chips"
export {
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastVariant,
} from "./toast"
export { Modal, type ModalProps } from "./modal"

/* -------------------------------------------------------------------------- */
/*  Re-exported UI primitives                                                 */
/* -------------------------------------------------------------------------- */

export { Button, buttonVariants, type ButtonProps } from "./ui/button"
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card"
export { Badge, badgeVariants, type BadgeProps } from "./ui/badge"
export { Input } from "./ui/input"
export { Textarea } from "./ui/textarea"
export { Label } from "./ui/label"
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./ui/table"
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from "./ui/select"
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog"
