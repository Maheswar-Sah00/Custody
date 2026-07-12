"use server";

/**
 * Organization Setup mutations. Every action here is ADMIN-ONLY and every write
 * is recorded via the core activity-log wrapper so it shows up in the audit
 * trail. Actions return a serializable {@link ActionResult} instead of throwing,
 * so the client tabs can surface a toast; RBAC/validation failures are mapped to
 * a friendly message.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getSession, type Session } from "@/core/auth/session";
import { logActivity } from "@/core/activity-log";
import { db } from "@/core/db";
import {
  assetCategories,
  departments,
  entityStatusEnum,
  userRoleEnum,
  users,
} from "@/core/db/schema";
import { ApiError, ValidationError } from "@/core/errors";
import { requireRole } from "@/core/rbac";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

/** Guard + uniform error handling shared by every action below. */
async function withAdmin(
  fn: (session: Session) => Promise<void>,
): Promise<ActionResult> {
  try {
    const session = requireRole(await getSession(), ["admin"]);
    await fn(session);
    revalidatePath("/org");
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: error.message };
    console.error("Org action failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Coerce a picker value ("" | "none" | id string) to a nullable FK. */
const optionalId = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "" || v === "none") return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  });

const statusSchema = z.enum(entityStatusEnum.enumValues);
const roleSchema = z.enum(userRoleEnum.enumValues);

/* -------------------------------------------------------------------------- */
/*  Departments                                                               */
/* -------------------------------------------------------------------------- */

const departmentInput = z.object({
  name: z.string().trim().min(1, "Department name is required"),
  headId: optionalId,
  parentId: optionalId,
  status: statusSchema,
});

export async function createDepartment(
  raw: z.input<typeof departmentInput>,
): Promise<ActionResult> {
  return withAdmin(async (session) => {
    const input = departmentInput.parse(raw);

    const [created] = await db
      .insert(departments)
      .values({
        name: input.name,
        headId: input.headId,
        parentId: input.parentId,
        status: input.status,
      })
      .returning();

    await logActivity({
      actorId: session.userId,
      action: "department.created",
      entityType: "department",
      entityId: created.id,
      after: created,
    });
  });
}

const departmentUpdateInput = departmentInput.extend({
  id: z.number().int().positive(),
});

export async function updateDepartment(
  raw: z.input<typeof departmentUpdateInput>,
): Promise<ActionResult> {
  return withAdmin(async (session) => {
    const input = departmentUpdateInput.parse(raw);

    if (input.parentId === input.id) {
      throw new ValidationError("A department cannot be its own parent.");
    }

    const [before] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, input.id));
    if (!before) throw new ValidationError("Department not found.");

    const [after] = await db
      .update(departments)
      .set({
        name: input.name,
        headId: input.headId,
        parentId: input.parentId,
        status: input.status,
      })
      .where(eq(departments.id, input.id))
      .returning();

    await logActivity({
      actorId: session.userId,
      action: "department.updated",
      entityType: "department",
      entityId: input.id,
      before,
      after,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Asset categories                                                          */
/* -------------------------------------------------------------------------- */

const customFieldsSchema = z.record(z.string(), z.string());

const categoryInput = z.object({
  name: z.string().trim().min(1, "Category name is required"),
  customFields: customFieldsSchema,
});

export async function createCategory(
  raw: z.input<typeof categoryInput>,
): Promise<ActionResult> {
  return withAdmin(async (session) => {
    const input = categoryInput.parse(raw);

    const [created] = await db
      .insert(assetCategories)
      .values({ name: input.name, customFields: input.customFields })
      .returning();

    await logActivity({
      actorId: session.userId,
      action: "category.created",
      entityType: "asset_category",
      entityId: created.id,
      after: created,
    });
  });
}

const categoryUpdateInput = categoryInput.extend({
  id: z.number().int().positive(),
});

export async function updateCategory(
  raw: z.input<typeof categoryUpdateInput>,
): Promise<ActionResult> {
  return withAdmin(async (session) => {
    const input = categoryUpdateInput.parse(raw);

    const [before] = await db
      .select()
      .from(assetCategories)
      .where(eq(assetCategories.id, input.id));
    if (!before) throw new ValidationError("Category not found.");

    const [after] = await db
      .update(assetCategories)
      .set({ name: input.name, customFields: input.customFields })
      .where(eq(assetCategories.id, input.id))
      .returning();

    await logActivity({
      actorId: session.userId,
      action: "category.updated",
      entityType: "asset_category",
      entityId: input.id,
      before,
      after,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Employees — the ONLY place roles are assigned                             */
/* -------------------------------------------------------------------------- */

const employeeUpdateInput = z.object({
  id: z.number().int().positive(),
  role: roleSchema,
  departmentId: optionalId,
  status: statusSchema,
});

export async function updateEmployee(
  raw: z.input<typeof employeeUpdateInput>,
): Promise<ActionResult> {
  return withAdmin(async (session) => {
    const input = employeeUpdateInput.parse(raw);

    const [before] = await db
      .select()
      .from(users)
      .where(eq(users.id, input.id));
    if (!before) throw new ValidationError("Employee not found.");

    const [updated] = await db
      .update(users)
      .set({
        role: input.role,
        departmentId: input.departmentId,
        status: input.status,
      })
      .where(eq(users.id, input.id))
      .returning();

    // Redact the password hash from the audit snapshot.
    const redact = (u: typeof updated) => {
      const rest = { ...u };
      delete (rest as { passwordHash?: string }).passwordHash;
      return rest;
    };

    await logActivity({
      actorId: session.userId,
      action:
        before.role !== updated.role ? "user.role_changed" : "user.updated",
      entityType: "user",
      entityId: input.id,
      before: redact(before),
      after: redact(updated),
    });
  });
}
