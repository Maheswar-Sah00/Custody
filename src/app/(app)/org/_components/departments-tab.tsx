"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

import {
  Button,
  DataTable,
  InputField,
  Modal,
  SelectField,
  StatusPill,
  useToast,
  type DataTableColumn,
} from "@/components";
import { createDepartment, updateDepartment } from "../actions";
import type { DepartmentRow, UserOption } from "../_data";
import { useAddSignal } from "./org-client";

const NONE = "none";

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

interface FormState {
  name: string;
  headId: string;
  parentId: string;
  status: "active" | "inactive";
}

function toForm(row?: DepartmentRow): FormState {
  return {
    name: row?.name ?? "",
    headId: row?.headId ? String(row.headId) : NONE,
    parentId: row?.parentId ? String(row.parentId) : NONE,
    status: row?.status ?? "active",
  };
}

export function DepartmentsTab({
  departments,
  userOptions,
  addNonce,
}: {
  departments: DepartmentRow[];
  userOptions: UserOption[];
  addNonce: number;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  // null = closed; { row: null } = create; { row } = edit.
  const [editing, setEditing] = React.useState<{
    row: DepartmentRow | null;
  } | null>(null);
  const [form, setForm] = React.useState<FormState>(toForm());

  useAddSignal(addNonce, () => {
    setForm(toForm());
    setEditing({ row: null });
  });

  const openEdit = (row: DepartmentRow) => {
    setForm(toForm(row));
    setEditing({ row });
  };

  const close = () => setEditing(null);

  const submit = () => {
    if (!editing) return;
    const row = editing.row;
    startTransition(async () => {
      const result = row
        ? await updateDepartment({
            id: row.id,
            name: form.name,
            headId: form.headId,
            parentId: form.parentId,
            status: form.status,
          })
        : await createDepartment({
            name: form.name,
            headId: form.headId,
            parentId: form.parentId,
            status: form.status,
          });

      if (result.ok) {
        toast({
          title: row ? "Department updated" : "Department created",
          variant: "success",
        });
        close();
      } else {
        toast({ title: result.error, variant: "error" });
      }
    });
  };

  const toggleStatus = (row: DepartmentRow) => {
    startTransition(async () => {
      const next = row.status === "active" ? "inactive" : "active";
      const result = await updateDepartment({
        id: row.id,
        name: row.name,
        headId: row.headId ? String(row.headId) : NONE,
        parentId: row.parentId ? String(row.parentId) : NONE,
        status: next,
      });
      toast(
        result.ok
          ? {
              title: next === "active" ? "Department activated" : "Department deactivated",
              variant: "success",
            }
          : { title: result.error, variant: "error" },
      );
    });
  };

  const headOptions = [
    { label: "— No head —", value: NONE },
    ...userOptions.map((u) => ({ label: u.name, value: String(u.id) })),
  ];

  // Parent options exclude the department being edited (can't parent itself).
  const parentOptions = [
    { label: "— No parent —", value: NONE },
    ...departments
      .filter((d) => d.id !== editing?.row?.id)
      .map((d) => ({ label: d.name, value: String(d.id) })),
  ];

  const columns: DataTableColumn<DepartmentRow>[] = [
    { key: "name", header: "Department", cellClassName: "font-medium" },
    {
      key: "head",
      header: "Head",
      cell: (d) =>
        d.headName ?? <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      key: "parent",
      header: "Parent Dept",
      cell: (d) =>
        d.parentName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (d) => <StatusPill status={d.status} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (d) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(d)}
            disabled={pending}
          >
            <Pencil />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleStatus(d)}
            disabled={pending}
          >
            {d.status === "active" ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable<DepartmentRow>
        data={departments}
        columns={columns}
        getRowKey={(d) => d.id}
        emptyState="No departments yet. Add your first one."
      />

      <Modal
        open={editing !== null}
        onOpenChange={(open) => (open ? null : close())}
        title={editing?.row ? "Edit department" : "Add department"}
        description="Departments form your org hierarchy and can hold assets."
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !form.name.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <InputField
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Engineering"
          />
          <SelectField
            label="Head"
            hint="The person who leads this department."
            options={headOptions}
            value={form.headId}
            onValueChange={(v) => setForm({ ...form, headId: v })}
          />
          <SelectField
            label="Parent department"
            hint="Optional — nest this department under another."
            options={parentOptions}
            value={form.parentId}
            onValueChange={(v) => setForm({ ...form, parentId: v })}
          />
          <SelectField
            label="Status"
            options={STATUS_OPTIONS}
            value={form.status}
            onValueChange={(v) =>
              setForm({ ...form, status: v as FormState["status"] })
            }
          />
        </div>
      </Modal>
    </>
  );
}
