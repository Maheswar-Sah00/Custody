"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { Button, PageHeader, Tabs } from "@/components";
import type { OrgData } from "../_data";
import { DepartmentsTab } from "./departments-tab";
import { CategoriesTab } from "./categories-tab";
import { EmployeesTab } from "./employees-tab";

type TabValue = "departments" | "categories" | "employees";

const TABS = [
  { value: "departments", label: "Departments" },
  { value: "categories", label: "Asset Categories" },
  { value: "employees", label: "Employee Directory" },
] as const;

const ADD_LABEL: Record<TabValue, string> = {
  departments: "Add department",
  categories: "Add category",
  employees: undefined as unknown as string, // employees are added via signup
};

/**
 * Organization Setup shell: PageHeader, then a row holding the three pill tabs
 * and the contextual "+ Add" button (matches the mockup). Only the active tab
 * is mounted; clicking "+ Add" bumps `addNonce`, which the mounted tab observes
 * to open its create modal.
 */
export function OrgClient({ data }: { data: OrgData }) {
  const [tab, setTab] = React.useState<TabValue>("departments");
  const [addNonce, setAddNonce] = React.useState(0);

  // The employee directory has no "create" flow — people arrive via signup and
  // are then assigned roles/departments here — so hide Add on that tab.
  const canAdd = tab !== "employees";

  return (
    <>
      <PageHeader
        title="Organization setup"
        description="Manage departments, asset categories, and who does what."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          items={TABS as unknown as { value: string; label: string }[]}
          value={tab}
          onValueChange={(v) => setTab(v as TabValue)}
          aria-label="Organization sections"
        />
        {canAdd ? (
          <Button onClick={() => setAddNonce((n) => n + 1)}>
            <Plus />
            {ADD_LABEL[tab]}
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {tab === "departments" ? (
          <DepartmentsTab
            departments={data.departments}
            userOptions={data.userOptions}
            addNonce={addNonce}
          />
        ) : null}
        {tab === "categories" ? (
          <CategoriesTab categories={data.categories} addNonce={addNonce} />
        ) : null}
        {tab === "employees" ? (
          <EmployeesTab
            employees={data.employees}
            departments={data.departments}
          />
        ) : null}
      </div>
    </>
  );
}

/**
 * Open a create modal when the parent's "+ Add" button is clicked. Returns a
 * ref-guarded effect: mounting a tab with a non-zero nonce must NOT auto-open.
 */
export function useAddSignal(addNonce: number, onAdd: () => void) {
  const seen = React.useRef(addNonce);
  React.useEffect(() => {
    if (addNonce !== seen.current) {
      seen.current = addNonce;
      onAdd();
    }
    // onAdd is stable enough for our usage; we intentionally key only on nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addNonce]);
}
