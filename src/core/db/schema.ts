/**
 * AssetFlow — core database schema.
 *
 * This file is the single source of truth for the data model. Every module
 * imports its tables and types from here; do not fork table definitions.
 *
 * Conventions:
 *  - All foreign keys are ON DELETE RESTRICT (nothing is silently orphaned).
 *  - Enum + cross-column constraints that Drizzle cannot express live in
 *    drizzle/0001_constraints.sql (booking overlap exclusion, single active
 *    allocation, asset tag sequence default).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* -------------------------------------------------------------------------- */
/*  Enums                                                                     */
/* -------------------------------------------------------------------------- */

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "asset_manager",
  "dept_head",
  "employee",
]);

/** Shared active/inactive flag used by users and departments. */
export const entityStatusEnum = pgEnum("entity_status", ["active", "inactive"]);

export const assetStatusEnum = pgEnum("asset_status", [
  "available",
  "allocated",
  "reserved",
  "under_maintenance",
  "lost",
  "retired",
  "disposed",
]);

export const allocationStatusEnum = pgEnum("allocation_status", [
  "active",
  "returned",
]);

export const transferStatusEnum = pgEnum("transfer_status", [
  "requested",
  "approved",
  "rejected",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "upcoming",
  "ongoing",
  "completed",
  "cancelled",
]);

export const maintenancePriorityEnum = pgEnum("maintenance_priority", [
  "low",
  "medium",
  "high",
]);

export const maintenanceStatusEnum = pgEnum("maintenance_status", [
  "pending",
  "approved",
  "rejected",
  "assigned",
  "in_progress",
  "resolved",
]);

export const auditCycleStatusEnum = pgEnum("audit_cycle_status", [
  "open",
  "closed",
]);

export const auditVerificationEnum = pgEnum("audit_verification", [
  "pending",
  "verified",
  "missing",
  "damaged",
]);

export const notificationCategoryEnum = pgEnum("notification_category", [
  "alert",
  "approval",
  "booking",
]);

/* -------------------------------------------------------------------------- */
/*  Sequences                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Backs the human-readable asset tag. The formatted default
 * ('AF-' || lpad(nextval(...)::text, 4, '0')) is applied to assets.tag in
 * drizzle/0001_constraints.sql.
 */
export const assetTagSeq = pgSequence("asset_tag_seq", { startWith: 1 });

/* -------------------------------------------------------------------------- */
/*  Tables                                                                    */
/* -------------------------------------------------------------------------- */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("employee"),
  departmentId: integer("department_id").references(
    (): AnyPgColumn => departments.id,
    { onDelete: "restrict" },
  ),
  status: entityStatusEnum("status").notNull().default("active"),
});

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  headId: integer("head_id").references((): AnyPgColumn => users.id, {
    onDelete: "restrict",
  }),
  parentId: integer("parent_id").references(
    (): AnyPgColumn => departments.id,
    { onDelete: "restrict" },
  ),
  status: entityStatusEnum("status").notNull().default("active"),
});

export const assetCategories = pgTable("asset_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** Per-category custom field definitions, e.g. { "warranty_months": "number" }. */
  customFields: jsonb("custom_fields").notNull().default({}),
});

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  /**
   * Human-readable tag, e.g. "AF-0114". Auto-generated from asset_tag_seq;
   * the formatted default is attached in drizzle/0001_constraints.sql.
   */
  tag: text("tag")
    .notNull()
    .unique()
    .default(sql`'AF-' || lpad(nextval('asset_tag_seq')::text, 4, '0')`),
  name: text("name").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => assetCategories.id, { onDelete: "restrict" }),
  serialNumber: text("serial_number"),
  acquisitionDate: date("acquisition_date"),
  acquisitionCost: numeric("acquisition_cost", { precision: 12, scale: 2 }),
  condition: text("condition"),
  location: text("location"),
  status: assetStatusEnum("status").notNull().default("available"),
  isBookable: boolean("is_bookable").notNull().default(false),
  photoPath: text("photo_path"),
  qrData: text("qr_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const allocations = pgTable("allocations", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  /** Exactly one of holder_user_id / holder_department_id is set (enforced in 0001_constraints.sql). */
  holderUserId: integer("holder_user_id").references(() => users.id, {
    onDelete: "restrict",
  }),
  holderDepartmentId: integer("holder_department_id").references(
    () => departments.id,
    { onDelete: "restrict" },
  ),
  allocatedAt: timestamp("allocated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expectedReturnDate: date("expected_return_date"),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  checkinConditionNotes: text("checkin_condition_notes"),
  status: allocationStatusEnum("status").notNull().default("active"),
});

export const transferRequests = pgTable("transfer_requests", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  fromUserId: integer("from_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  toUserId: integer("to_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  status: transferStatusEnum("status").notNull().default("requested"),
  decidedBy: integer("decided_by").references(() => users.id, {
    onDelete: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  bookedBy: integer("booked_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  /** Overlap of upcoming/ongoing bookings per asset is excluded in 0001_constraints.sql. */
  status: bookingStatusEnum("status").notNull().default("upcoming"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const maintenanceRequests = pgTable("maintenance_requests", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  raisedBy: integer("raised_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  issue: text("issue").notNull(),
  priority: maintenancePriorityEnum("priority").notNull().default("medium"),
  photoPath: text("photo_path"),
  status: maintenanceStatusEnum("status").notNull().default("pending"),
  technicianName: text("technician_name"),
  decidedBy: integer("decided_by").references(() => users.id, {
    onDelete: "restrict",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditCycles = pgTable("audit_cycles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  scopeDepartmentId: integer("scope_department_id").references(
    () => departments.id,
    { onDelete: "restrict" },
  ),
  scopeLocation: text("scope_location"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: auditCycleStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditCycleAuditors = pgTable(
  "audit_cycle_auditors",
  {
    cycleId: integer("cycle_id")
      .notNull()
      .references(() => auditCycles.id, { onDelete: "restrict" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cycleId, t.userId] }),
  }),
);

export const auditItems = pgTable("audit_items", {
  id: serial("id").primaryKey(),
  cycleId: integer("cycle_id")
    .notNull()
    .references(() => auditCycles.id, { onDelete: "restrict" }),
  assetId: integer("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  expectedLocation: text("expected_location"),
  verification: auditVerificationEnum("verification")
    .notNull()
    .default("pending"),
  auditorId: integer("auditor_id").references(() => users.id, {
    onDelete: "restrict",
  }),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  category: notificationCategoryEnum("category").notNull(),
  message: text("message").notNull(),
  /** Free-form pointer to the related entity, e.g. "asset:AF-0114" or "booking:12". */
  entityRef: text("entity_ref"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => users.id, {
    onDelete: "restrict",
  }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Reference table of legal asset lifecycle moves. Seeded from
 * ASSET_STATE_TRANSITIONS in src/core/state-machine.ts — that map is the
 * canonical definition; this table mirrors it for reporting/joins.
 */
export const stateTransitions = pgTable("state_transitions", {
  id: serial("id").primaryKey(),
  fromState: assetStatusEnum("from_state").notNull(),
  toState: assetStatusEnum("to_state").notNull(),
  /** Role required to perform the move; NULL = any authenticated user. Admin may always. */
  requiredRole: userRoleEnum("required_role"),
});

/* -------------------------------------------------------------------------- */
/*  Inferred types                                                            */
/* -------------------------------------------------------------------------- */

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type AssetCategory = typeof assetCategories.$inferSelect;
export type NewAssetCategory = typeof assetCategories.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type Allocation = typeof allocations.$inferSelect;
export type NewAllocation = typeof allocations.$inferInsert;

export type TransferRequest = typeof transferRequests.$inferSelect;
export type NewTransferRequest = typeof transferRequests.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type NewMaintenanceRequest = typeof maintenanceRequests.$inferInsert;

export type AuditCycle = typeof auditCycles.$inferSelect;
export type NewAuditCycle = typeof auditCycles.$inferInsert;

export type AuditCycleAuditor = typeof auditCycleAuditors.$inferSelect;
export type NewAuditCycleAuditor = typeof auditCycleAuditors.$inferInsert;

export type AuditItem = typeof auditItems.$inferSelect;
export type NewAuditItem = typeof auditItems.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type NewActivityLog = typeof activityLogs.$inferInsert;

export type StateTransitionRow = typeof stateTransitions.$inferSelect;
export type NewStateTransitionRow = typeof stateTransitions.$inferInsert;

/* Enum value unions — import these instead of retyping string literals. */
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type EntityStatus = (typeof entityStatusEnum.enumValues)[number];
export type AssetStatus = (typeof assetStatusEnum.enumValues)[number];
export type AllocationStatus = (typeof allocationStatusEnum.enumValues)[number];
export type TransferStatus = (typeof transferStatusEnum.enumValues)[number];
export type BookingStatus = (typeof bookingStatusEnum.enumValues)[number];
export type MaintenancePriority =
  (typeof maintenancePriorityEnum.enumValues)[number];
export type MaintenanceStatus =
  (typeof maintenanceStatusEnum.enumValues)[number];
export type AuditCycleStatus = (typeof auditCycleStatusEnum.enumValues)[number];
export type AuditVerification =
  (typeof auditVerificationEnum.enumValues)[number];
export type NotificationCategory =
  (typeof notificationCategoryEnum.enumValues)[number];
