/**
 * Server-side data access for the Organization Setup screen. Imported by the
 * server component (page.tsx); the returned rows are handed to the client tabs
 * as initial props. Read-only — all mutations live in actions.ts.
 */
import "server-only";

import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/core/db";
import {
  assetCategories,
  departments,
  users,
  type EntityStatus,
  type UserRole,
} from "@/core/db/schema";

export interface DepartmentRow {
  id: number;
  name: string;
  status: EntityStatus;
  headId: number | null;
  headName: string | null;
  parentId: number | null;
  parentName: string | null;
}

export interface CategoryRow {
  id: number;
  name: string;
  /** key → human label, e.g. { warranty_months: "Warranty (months)" }. */
  customFields: Record<string, string>;
}

export interface EmployeeRow {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: EntityStatus;
  departmentId: number | null;
  departmentName: string | null;
}

export interface UserOption {
  id: number;
  name: string;
}

export interface OrgData {
  departments: DepartmentRow[];
  categories: CategoryRow[];
  employees: EmployeeRow[];
  /** All users, for the "assign head" / employee pickers. */
  userOptions: UserOption[];
}

export async function loadOrgData(): Promise<OrgData> {
  const parent = alias(departments, "parent_dept");
  const head = alias(users, "head_user");

  const [departmentRows, categoryRows, employeeRows, userRows] =
    await Promise.all([
      db
        .select({
          id: departments.id,
          name: departments.name,
          status: departments.status,
          headId: departments.headId,
          headName: head.name,
          parentId: departments.parentId,
          parentName: parent.name,
        })
        .from(departments)
        .leftJoin(head, eq(head.id, departments.headId))
        .leftJoin(parent, eq(parent.id, departments.parentId))
        .orderBy(asc(departments.name)),

      db
        .select({
          id: assetCategories.id,
          name: assetCategories.name,
          customFields: assetCategories.customFields,
        })
        .from(assetCategories)
        .orderBy(asc(assetCategories.name)),

      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          status: users.status,
          departmentId: users.departmentId,
          departmentName: departments.name,
        })
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .orderBy(asc(users.name)),

      db
        .select({ id: users.id, name: users.name })
        .from(users)
        .orderBy(asc(users.name)),
    ]);

  return {
    departments: departmentRows,
    categories: categoryRows.map((c) => ({
      ...c,
      customFields: (c.customFields ?? {}) as Record<string, string>,
    })),
    employees: employeeRows,
    userOptions: userRows,
  };
}
