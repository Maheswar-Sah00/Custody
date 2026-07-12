"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

import {
  Button,
  DataTable,
  Modal,
  SelectField,
  StatusPill,
  formatStatusLabel,
  useToast,
  type DataTableColumn,
  type StatusVariant,
} from "@/components";
import type { UserRole } from "@/core/db/schema";
import { updateEmployee } from "../actions";
import type { DepartmentRow, EmployeeRow } from "../_data";

const NONE = "none";

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: "Employee", value: "employee" },
  { label: "Department Head", value: "dept_head" },
  { label: "Asset Manager", value: "asset_manager" },
  { label: "Admin", value: "admin" },
];

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
];

const ROLE_VARIANT: Record<UserRole, StatusVariant> = {
  admin: "info",
  asset_manager: "info",
  dept_head: "warning",
  employee: "neutral",
};

interface FormState {
  role: UserRole;
  departmentId: string;
  status: "active" | "inactive";
}

export function EmployeesTab({
  employees,
  departments,
}: {
  employees: EmployeeRow[];
  departments: DepartmentRow[];
}) {
  const { toast } = useToast();
  const [pending, startTransition] = React.useTransition();

  const [editing, setEditing] = React.useState<EmployeeRow | null>(null);
  const [form, setForm] = React.useState<FormState>({
    role: "employee",
    departmentId: NONE,
    status: "active",
  });

  const openEdit = (row: EmployeeRow) => {
    setForm({
      role: row.role,
      departmentId: row.departmentId ? String(row.departmentId) : NONE,
      status: row.status,
    });
    setEditing(row);
  };

  const close = () => setEditing(null);

  const submit = () => {
    if (!editing) return;
    startTransition(async () => {
      const result = await updateEmployee({
        id: editing.id,
        role: form.role,
        departmentId: form.departmentId,
        status: form.status,
      });
      if (result.ok) {
        toast({ title: "Employee updated", variant: "success" });
        close();
      } else {
        toast({ title: result.error, variant: "error" });
      }
    });
  };

  const departmentOptions = [
    { label: "— No department —", value: NONE },
    ...departments.map((d) => ({ label: d.name, value: String(d.id) })),
  ];

  const columns: DataTableColumn<EmployeeRow>[] = [
    { key: "name", header: "Name", cellClassName: "font-medium" },
    {
      key: "email",
      header: "Email",
      cell: (u) => <span className="text-muted-foreground">{u.email}</span>,
    },
    {
      key: "department",
      header: "Department",
      cell: (u) =>
        u.departmentName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "role",
      header: "Role",
      cell: (u) => (
        <StatusPill variant={ROLE_VARIANT[u.role]}>
          {formatStatusLabel(u.role)}
        </StatusPill>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (u) => <StatusPill status={u.status} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headerClassName: "text-right",
      cellClassName: "text-right",
      cell: (u) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openEdit(u)}
          disabled={pending}
        >
          <Pencil />
          Manage
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable<EmployeeRow>
        data={employees}
        columns={columns}
        getRowKey={(u) => u.id}
        emptyState="No employees found."
      />

      <Modal
        open={editing !== null}
        onOpenChange={(open) => (open ? null : close())}
        title={editing ? `Manage ${editing.name}` : "Manage employee"}
        description={editing?.email}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectField
            label="Role"
            hint="This is the only place roles are assigned."
            options={ROLE_OPTIONS}
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
          />
          <SelectField
            label="Department"
            options={departmentOptions}
            value={form.departmentId}
            onValueChange={(v) => setForm({ ...form, departmentId: v })}
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
