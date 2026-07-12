CREATE TYPE "public"."allocation_status" AS ENUM('active', 'returned');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('available', 'allocated', 'reserved', 'under_maintenance', 'lost', 'retired', 'disposed');--> statement-breakpoint
CREATE TYPE "public"."audit_cycle_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."audit_verification" AS ENUM('pending', 'verified', 'missing', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('upcoming', 'ongoing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('pending', 'approved', 'rejected', 'assigned', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('alert', 'approval', 'booking');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'asset_manager', 'dept_head', 'employee');--> statement-breakpoint
CREATE SEQUENCE "public"."asset_tag_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"holder_user_id" integer,
	"holder_department_id" integer,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_return_date" date,
	"returned_at" timestamp with time zone,
	"checkin_condition_notes" text,
	"status" "allocation_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag" text DEFAULT 'AF-' || lpad(nextval('asset_tag_seq')::text, 4, '0') NOT NULL,
	"name" text NOT NULL,
	"category_id" integer NOT NULL,
	"serial_number" text,
	"acquisition_date" date,
	"acquisition_cost" numeric(12, 2),
	"condition" text,
	"location" text,
	"status" "asset_status" DEFAULT 'available' NOT NULL,
	"is_bookable" boolean DEFAULT false NOT NULL,
	"photo_path" text,
	"qr_data" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "audit_cycle_auditors" (
	"cycle_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "audit_cycle_auditors_cycle_id_user_id_pk" PRIMARY KEY("cycle_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "audit_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"scope_department_id" integer,
	"scope_location" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "audit_cycle_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"expected_location" text,
	"verification" "audit_verification" DEFAULT 'pending' NOT NULL,
	"auditor_id" integer
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"booked_by" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"head_id" integer,
	"parent_id" integer,
	"status" "entity_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"raised_by" integer NOT NULL,
	"issue" text NOT NULL,
	"priority" "maintenance_priority" DEFAULT 'medium' NOT NULL,
	"photo_path" text,
	"status" "maintenance_status" DEFAULT 'pending' NOT NULL,
	"technician_name" text,
	"decided_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" "notification_category" NOT NULL,
	"message" text NOT NULL,
	"entity_ref" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_transitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_state" "asset_status" NOT NULL,
	"to_state" "asset_status" NOT NULL,
	"required_role" "user_role"
);
--> statement-breakpoint
CREATE TABLE "transfer_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"to_user_id" integer NOT NULL,
	"reason" text NOT NULL,
	"status" "transfer_status" DEFAULT 'requested' NOT NULL,
	"decided_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"department_id" integer,
	"status" "entity_status" DEFAULT 'active' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_holder_department_id_departments_id_fk" FOREIGN KEY ("holder_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_asset_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_cycle_auditors" ADD CONSTRAINT "audit_cycle_auditors_cycle_id_audit_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."audit_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_cycle_auditors" ADD CONSTRAINT "audit_cycle_auditors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_cycles" ADD CONSTRAINT "audit_cycles_scope_department_id_departments_id_fk" FOREIGN KEY ("scope_department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_cycle_id_audit_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."audit_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_auditor_id_users_id_fk" FOREIGN KEY ("auditor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booked_by_users_id_fk" FOREIGN KEY ("booked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_id_users_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_id_departments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;