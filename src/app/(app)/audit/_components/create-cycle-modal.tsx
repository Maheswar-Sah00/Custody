"use client";

import * as React from "react";
import { ClipboardList, Loader2 } from "lucide-react";

import {
  Button,
  DatePickerField,
  FilterChips,
  InputField,
  Modal,
  SelectField,
  Tabs,
  useToast,
} from "@/components";
import type { CreateAuditOptions } from "../_data";
import { createAuditCycle } from "../actions";

type ScopeType = "department" | "location";

interface Errors {
  name?: string;
  scope?: string;
  startDate?: string;
  endDate?: string;
  auditors?: string;
}

export function CreateCycleModal({
  open,
  onOpenChange,
  options,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: CreateAuditOptions;
  onCreated: (cycleId: number) => void;
}) {
  const { toast } = useToast();

  const [name, setName] = React.useState("");
  const [scopeType, setScopeType] = React.useState<ScopeType>("department");
  const [departmentId, setDepartmentId] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [auditorIds, setAuditorIds] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Errors>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName("");
      setScopeType("department");
      setDepartmentId("");
      setLocation("");
      setStartDate("");
      setEndDate("");
      setAuditorIds([]);
      setErrors({});
    }
  }, [open]);

  async function submit() {
    const next: Errors = {};
    if (!name.trim()) next.name = "Give the cycle a name.";
    if (scopeType === "department" && !departmentId) {
      next.scope = "Pick a department to audit.";
    }
    if (scopeType === "location" && !location) {
      next.scope = "Pick a location to audit.";
    }
    if (!startDate) next.startDate = "Required.";
    if (!endDate) next.endDate = "Required.";
    if (startDate && endDate && endDate < startDate) {
      next.endDate = "End can't be before start.";
    }
    if (auditorIds.length === 0) next.auditors = "Assign at least one auditor.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const result = await createAuditCycle({
        name,
        scopeType,
        departmentId:
          scopeType === "department" ? Number(departmentId) : undefined,
        location: scopeType === "location" ? location : undefined,
        startDate,
        endDate,
        auditorIds: auditorIds.map(Number),
      });
      if (!result.ok) {
        toast({
          title: "Couldn't create cycle",
          description: result.error,
          variant: "error",
        });
        return;
      }
      toast({
        title: "Audit cycle created",
        description:
          result.itemCount > 0
            ? `${result.itemCount} asset${result.itemCount === 1 ? "" : "s"} added to the checklist.`
            : "No assets matched the scope — the checklist is empty.",
        variant: "success",
      });
      onOpenChange(false);
      onCreated(result.cycleId);
    } catch (error) {
      toast({
        title: "Couldn't create cycle",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New audit cycle"
      description="Define the scope, dates, and auditors. The checklist is populated automatically from the assets in scope."
      className="max-w-lg"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <ClipboardList />
            )}
            Create cycle
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <InputField
          label="Cycle name"
          required
          placeholder="e.g. Q3 FY26 Engineering Audit"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">
            Scope <span className="text-destructive">*</span>
          </p>
          <Tabs
            items={[
              { value: "department", label: "Department" },
              { value: "location", label: "Location" },
            ]}
            value={scopeType}
            onValueChange={(v) => {
              setScopeType(v as ScopeType);
              setErrors((e) => ({ ...e, scope: undefined }));
            }}
          />
          {scopeType === "department" ? (
            <SelectField
              placeholder="Select a department"
              options={options.departments.map((d) => ({
                label: d.name,
                value: String(d.id),
              }))}
              value={departmentId}
              onValueChange={setDepartmentId}
              error={errors.scope}
            />
          ) : (
            <SelectField
              placeholder="Select a location"
              options={options.locations.map((l) => ({ label: l, value: l }))}
              value={location}
              onValueChange={setLocation}
              error={errors.scope}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DatePickerField
            label="Start date"
            required
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            error={errors.startDate}
          />
          <DatePickerField
            label="End date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            error={errors.endDate}
          />
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">
            Auditors <span className="text-destructive">*</span>
          </p>
          <FilterChips
            aria-label="Assign auditors"
            chips={options.employees.map((emp) => ({
              value: String(emp.id),
              label: emp.name,
            }))}
            value={auditorIds}
            onChange={(v) => {
              setAuditorIds(v);
              setErrors((e) => ({ ...e, auditors: undefined }));
            }}
          />
          {errors.auditors ? (
            <p className="text-xs font-medium text-destructive">
              {errors.auditors}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Selected auditors can mark items in this cycle.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
