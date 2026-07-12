"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  Button,
  DataTable,
  InputField,
  Label,
  Modal,
  useToast,
  type DataTableColumn,
} from "@/components";
import { createCategory, updateCategory } from "../actions";
import type { CategoryRow } from "../_data";
import { useAddSignal } from "./org-client";

/** One editable custom-field row in the modal. `id` is a client-only key. */
interface FieldRow {
  id: number;
  key: string;
  label: string;
}

let fieldRowSeq = 1;
const newFieldRow = (key = "", label = ""): FieldRow => ({
  id: fieldRowSeq++,
  key,
  label,
});

function toFieldRows(fields: Record<string, string>): FieldRow[] {
  const rows = Object.entries(fields).map(([key, label]) =>
    newFieldRow(key, label),
  );
  return rows.length ? rows : [newFieldRow()];
}

/** "warranty_months" — snake_case key derived from a label the admin typed. */
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function CategoriesTab({
  categories,
  addNonce,
}: {
  categories: CategoryRow[];
  addNonce: number;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const [editing, setEditing] = React.useState<{
    row: CategoryRow | null;
  } | null>(null);
  const [name, setName] = React.useState("");
  const [fields, setFields] = React.useState<FieldRow[]>([newFieldRow()]);

  const openCreate = () => {
    setName("");
    setFields([newFieldRow()]);
    setEditing({ row: null });
  };

  useAddSignal(addNonce, openCreate);

  const openEdit = (row: CategoryRow) => {
    setName(row.name);
    setFields(toFieldRows(row.customFields));
    setEditing({ row });
  };

  const close = () => setEditing(null);

  const setField = (id: number, patch: Partial<FieldRow>) =>
    setFields((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );

  const submit = () => {
    if (!editing) return;

    // Collapse the editor rows into the JSONB map. A row with a label but no
    // explicit key gets a slug derived from the label; blank rows are dropped.
    const customFields: Record<string, string> = {};
    for (const row of fields) {
      const label = row.label.trim();
      const key = slugify(row.key || label);
      if (!key) continue;
      if (customFields[key]) {
        toast({ title: `Duplicate field key "${key}"`, variant: "error" });
        return;
      }
      customFields[key] = label || key;
    }

    const row = editing.row;
    startTransition(async () => {
      const result = row
        ? await updateCategory({ id: row.id, name, customFields })
        : await createCategory({ name, customFields });

      if (result.ok) {
        toast({
          title: row ? "Category updated" : "Category created",
          variant: "success",
        });
        close();
      } else {
        toast({ title: result.error, variant: "error" });
      }
    });
  };

  const columns: DataTableColumn<CategoryRow>[] = [
    { key: "name", header: "Category", cellClassName: "font-medium" },
    {
      key: "customFields",
      header: "Custom Fields",
      cell: (c) => {
        const keys = Object.keys(c.customFields);
        if (keys.length === 0) {
          return <span className="text-muted-foreground">None</span>;
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {keys.map((k) => (
              <span
                key={k}
                className="rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
                title={c.customFields[k]}
              >
                {k}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (c) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openEdit(c)}
          disabled={pending}
        >
          <Pencil />
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable<CategoryRow>
        data={categories}
        columns={columns}
        getRowKey={(c) => c.id}
        emptyState="No categories yet. Add your first one."
      />

      <Modal
        open={editing !== null}
        onOpenChange={(open) => (open ? null : close())}
        title={editing?.row ? "Edit category" : "Add category"}
        description="Custom fields define the extra attributes assets in this category carry."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InputField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Electronics"
          />

          <div className="space-y-2">
            <Label className="text-foreground">Custom fields</Label>
            <div className="space-y-2">
              {fields.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <InputField
                    aria-label="Field key"
                    wrapperClassName="flex-1"
                    value={row.key}
                    onChange={(e) => setField(row.id, { key: e.target.value })}
                    placeholder="key (e.g. warranty_months)"
                  />
                  <InputField
                    aria-label="Field label"
                    wrapperClassName="flex-1"
                    value={row.label}
                    onChange={(e) => setField(row.id, { label: e.target.value })}
                    placeholder="label (e.g. Warranty months)"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove field"
                    onClick={() =>
                      setFields((rows) =>
                        rows.length > 1
                          ? rows.filter((r) => r.id !== row.id)
                          : [newFieldRow()],
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFields((rows) => [...rows, newFieldRow()])}
            >
              <Plus />
              Add field
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
