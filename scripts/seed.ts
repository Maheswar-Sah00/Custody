/**
 * AssetFlow demo seed.
 *
 * Resets every table and loads a realistic demo org (names match the design
 * mockups). Idempotent: safe to re-run at any time.
 *
 *   npm run db:seed
 *
 * Logins after seeding:
 *   admin@assetflow.com / admin123   (admin)
 *   everyone else       / password123
 */
import "dotenv/config";

import { sql } from "drizzle-orm";

import { hashPassword } from "../src/core/auth/passwords";
import { db, pool } from "../src/core/db";
import {
  activityLogs,
  allocations,
  assetCategories,
  assets,
  auditCycleAuditors,
  auditCycles,
  auditItems,
  bookings,
  departments,
  maintenanceRequests,
  notifications,
  stateTransitions,
  transferRequests,
  users,
  type NewAsset,
} from "../src/core/db/schema";
import { ASSET_STATE_TRANSITIONS } from "../src/core/state-machine";

/* ----------------------------- date helpers ------------------------------ */

const now = new Date();

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/** YYYY-MM-DD (what Drizzle expects for `date` columns). */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today at HH:MM local time. */
function todayAt(hours: number, minutes = 0): Date {
  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function bookingStatusFor(startsAt: Date, endsAt: Date) {
  if (now < startsAt) return "upcoming" as const;
  if (now < endsAt) return "ongoing" as const;
  return "completed" as const;
}

const qrFor = (tag: string) => `assetflow:asset:${tag}`;

async function main() {
  console.log("Seeding AssetFlow demo data...");

  /* ------------------------------- reset -------------------------------- */

  await db.execute(sql`
    TRUNCATE TABLE
      activity_logs, notifications, audit_items, audit_cycle_auditors,
      audit_cycles, maintenance_requests, bookings, transfer_requests,
      allocations, assets, asset_categories, state_transitions,
      users, departments
    RESTART IDENTITY CASCADE
  `);

  /* --------------------------- departments/users ------------------------- */

  const [engineering, facilities, fieldOps] = await db
    .insert(departments)
    .values([
      { name: "Engineering", status: "active" },
      { name: "Facilities", status: "active" },
      { name: "Field Ops", status: "inactive" },
    ])
    .returning();

  // Field Ops sits under Facilities in the org tree.
  await db
    .update(departments)
    .set({ parentId: facilities.id })
    .where(sql`${departments.id} = ${fieldOps.id}`);

  const adminHash = await hashPassword("admin123");
  const userHash = await hashPassword("password123");

  const [
    admin,
    aditi,
    rohan,
    sana,
    vikram,
    priya,
    raj,
    neha,
    arjun,
    meera,
    karan,
    divya,
    procurement,
  ] = await db
    .insert(users)
    .values([
      { name: "System Administrator", email: "admin@assetflow.com", passwordHash: adminHash, role: "admin" },
      { name: "Aditi Rao", email: "aditi.rao@assetflow.com", passwordHash: userHash, role: "dept_head", departmentId: engineering.id },
      { name: "Rohan Mehta", email: "rohan.mehta@assetflow.com", passwordHash: userHash, role: "dept_head", departmentId: facilities.id },
      { name: "Sana Iqbal", email: "sana.iqbal@assetflow.com", passwordHash: userHash, role: "dept_head", departmentId: fieldOps.id },
      { name: "Vikram Nair", email: "vikram.nair@assetflow.com", passwordHash: userHash, role: "asset_manager", departmentId: facilities.id },
      { name: "Priya Shah", email: "priya.shah@assetflow.com", passwordHash: userHash, role: "employee", departmentId: engineering.id },
      { name: "Raj", email: "raj@assetflow.com", passwordHash: userHash, role: "employee", departmentId: engineering.id },
      { name: "Neha Kulkarni", email: "neha.kulkarni@assetflow.com", passwordHash: userHash, role: "employee", departmentId: engineering.id },
      { name: "Arjun Singh", email: "arjun.singh@assetflow.com", passwordHash: userHash, role: "employee", departmentId: facilities.id },
      { name: "Meera Joshi", email: "meera.joshi@assetflow.com", passwordHash: userHash, role: "employee", departmentId: fieldOps.id },
      { name: "Karan Patel", email: "karan.patel@assetflow.com", passwordHash: userHash, role: "employee", departmentId: fieldOps.id },
      { name: "Divya Menon", email: "divya.menon@assetflow.com", passwordHash: userHash, role: "employee", departmentId: facilities.id },
      { name: "Procurement Team", email: "procurement@assetflow.com", passwordHash: userHash, role: "employee", departmentId: facilities.id },
    ])
    .returning();

  // Wire up department heads (circular FK, so done after users exist).
  await db.update(departments).set({ headId: aditi.id }).where(sql`${departments.id} = ${engineering.id}`);
  await db.update(departments).set({ headId: rohan.id }).where(sql`${departments.id} = ${facilities.id}`);
  await db.update(departments).set({ headId: sana.id }).where(sql`${departments.id} = ${fieldOps.id}`);

  /* ------------------------------ categories ----------------------------- */

  const [electronics, furniture, vehicles] = await db
    .insert(assetCategories)
    .values([
      { name: "Electronics", customFields: { warranty_months: "number" } },
      { name: "Furniture", customFields: {} },
      { name: "Vehicles", customFields: {} },
    ])
    .returning();

  /* -------------------------------- assets ------------------------------- */

  type SeedAsset = Omit<NewAsset, "qrData"> & { tag: string };
  const A = (
    tag: string,
    name: string,
    categoryId: number,
    extra: Partial<SeedAsset> = {},
  ): SeedAsset => ({
    tag,
    name,
    categoryId,
    condition: "good",
    location: "HQ — Floor 1",
    acquisitionDate: toDateString(daysAgo(400)),
    ...extra,
  });

  const seedAssets: SeedAsset[] = [
    // --- Electronics ---
    A("AF-0114", 'MacBook Pro 16"', electronics.id, {
      serialNumber: "C02XK1ZHJGH5", acquisitionCost: "2499.00", location: "HQ — Floor 2",
      status: "allocated", acquisitionDate: toDateString(daysAgo(200)),
    }),
    A("AF-0021", "Dell Latitude 5440", electronics.id, {
      serialNumber: "DL5440-88213", acquisitionCost: "1150.00", location: "HQ — Floor 2",
      status: "allocated",
    }),
    A("AF-0062", "Epson EB-X51 Projector", electronics.id, {
      serialNumber: "EPX51-00762", acquisitionCost: "540.00", location: "HQ — AV Store",
      status: "under_maintenance", condition: "needs repair",
    }),
    A("AF-0001", 'Dell UltraSharp 27" Monitor', electronics.id, { serialNumber: "DU27-1001", acquisitionCost: "420.00" }),
    A("AF-0002", 'Dell UltraSharp 27" Monitor', electronics.id, { serialNumber: "DU27-1002", acquisitionCost: "420.00" }),
    A("AF-0003", 'LG 32" 4K Monitor', electronics.id, { serialNumber: "LG32-2201", acquisitionCost: "610.00" }),
    A("AF-0004", "ThinkPad X1 Carbon", electronics.id, { serialNumber: "TPX1-7741", acquisitionCost: "1780.00", location: "HQ — Floor 2" }),
    A("AF-0005", "ThinkPad T14", electronics.id, { serialNumber: "TPT14-5520", acquisitionCost: "1320.00", location: "HQ — Floor 2" }),
    A("AF-0006", "iPad Pro 12.9", electronics.id, { serialNumber: "IPP-90112", acquisitionCost: "1099.00" }),
    A("AF-0007", "iPhone 15", electronics.id, { serialNumber: "IP15-33321", acquisitionCost: "799.00" }),
    A("AF-0008", "Samsung Galaxy S24", electronics.id, { serialNumber: "SGS24-1187", acquisitionCost: "749.00" }),
    A("AF-0009", "HP LaserJet Pro M404", electronics.id, { serialNumber: "HPLJ-40417", acquisitionCost: "329.00", location: "HQ — Print Room" }),
    A("AF-0010", "Canon imageRUNNER 2630", electronics.id, { serialNumber: "CIR-26302", acquisitionCost: "2150.00", location: "HQ — Print Room" }),
    A("AF-0011", "Logitech Rally Camera", electronics.id, { serialNumber: "LRC-8810", acquisitionCost: "1299.00", location: "HQ — Conference Room A1" }),
    A("AF-0012", "Poly Studio X50", electronics.id, { serialNumber: "PSX50-412", acquisitionCost: "2199.00", location: "HQ — Conference Room B2" }),
    A("AF-0013", "Cisco Catalyst 9300 Switch", electronics.id, { serialNumber: "CC93-77120", acquisitionCost: "4800.00", location: "HQ — Server Room" }),
    A("AF-0014", "Dell PowerEdge R760", electronics.id, { serialNumber: "DPE-76033", acquisitionCost: "9200.00", location: "HQ — Server Room" }),
    A("AF-0015", "APC Smart-UPS 3000", electronics.id, { serialNumber: "APC3K-1904", acquisitionCost: "1450.00", location: "HQ — Server Room" }),
    A("AF-0016", "Zebra ZD421 Label Printer", electronics.id, { serialNumber: "ZZD-42155", acquisitionCost: "389.00", location: "Warehouse" }),
    A("AF-0017", "Honeywell Barcode Scanner", electronics.id, { serialNumber: "HBS-1250G", acquisitionCost: "145.00", location: "Warehouse" }),
    A("AF-0018", "DJI Mavic 3 Drone", electronics.id, {
      serialNumber: "DJM3-0091", acquisitionCost: "2049.00", location: "Field Ops Depot", status: "lost", condition: "unknown",
    }),
    A("AF-0019", "Panasonic Toughbook 40", electronics.id, { serialNumber: "PTB40-777", acquisitionCost: "3450.00", location: "Field Ops Depot" }),
    A("AF-0020", "Trimble GPS Unit R12", electronics.id, { serialNumber: "TGR12-208", acquisitionCost: "5100.00", location: "Field Ops Depot" }),

    // --- Furniture ---
    A("AF-0030", "Conference Room B2", furniture.id, {
      isBookable: true, location: "HQ — Floor 1", acquisitionCost: "15000.00",
      serialNumber: null, condition: "excellent",
    }),
    A("AF-0031", "Conference Room A1", furniture.id, {
      isBookable: true, location: "HQ — Floor 1", acquisitionCost: "12000.00",
      serialNumber: null, condition: "excellent",
    }),
    A("AF-0032", "Herman Miller Aeron Chair", furniture.id, { serialNumber: "HMA-55211", acquisitionCost: "1395.00", location: "HQ — Floor 2" }),
    A("AF-0033", "Herman Miller Aeron Chair", furniture.id, { serialNumber: "HMA-55212", acquisitionCost: "1395.00", location: "HQ — Floor 2" }),
    A("AF-0034", "Standing Desk 160cm", furniture.id, { serialNumber: "SD160-901", acquisitionCost: "650.00", location: "HQ — Floor 2" }),
    A("AF-0035", "Standing Desk 160cm", furniture.id, { serialNumber: "SD160-902", acquisitionCost: "650.00", location: "HQ — Floor 2" }),
    A("AF-0036", "Steelcase Filing Cabinet", furniture.id, { serialNumber: "SFC-30419", acquisitionCost: "480.00", location: "HQ — Floor 1" }),
    A("AF-0037", "Lounge Sofa 3-Seater", furniture.id, { serialNumber: null, acquisitionCost: "1850.00", location: "HQ — Lobby" }),
    A("AF-0038", "Whiteboard 200x120", furniture.id, { serialNumber: null, acquisitionCost: "310.00", location: "HQ — Floor 2", condition: "fair" }),
    A("AF-0039", "Office Chair (Broken Castor)", furniture.id, {
      serialNumber: "OC-11873", acquisitionCost: "220.00", location: "HQ — Floor 1", condition: "poor",
    }),
    A("AF-0040", "Reception Desk", furniture.id, { serialNumber: null, acquisitionCost: "2400.00", location: "HQ — Lobby" }),
    A("AF-0041", "Bookshelf Oak 5-Tier", furniture.id, { serialNumber: null, acquisitionCost: "390.00", location: "HQ — Floor 1" }),
    A("AF-0042", "Retired CRT Monitor Desk", furniture.id, {
      serialNumber: null, acquisitionCost: "150.00", location: "Storage", status: "retired", condition: "poor",
      acquisitionDate: toDateString(daysAgo(3000)),
    }),

    // --- Vehicles ---
    A("AF-0050", "Toyota HiAce Van", vehicles.id, {
      serialNumber: "VIN-JTFSK22P500018344", acquisitionCost: "38500.00", location: "Field Ops Depot", status: "allocated",
    }),
    A("AF-0051", "Ford Transit Cargo", vehicles.id, { serialNumber: "VIN-1FTBW2CM5HKA71203", acquisitionCost: "42200.00", location: "Field Ops Depot" }),
    A("AF-0052", "Toyota Forklift 8FGU25", vehicles.id, { serialNumber: "TFL-825601", acquisitionCost: "28900.00", location: "Warehouse" }),
    A("AF-0053", "Honda CB350 Courier Bike", vehicles.id, { serialNumber: "VIN-ME4KC09AXKK000217", acquisitionCost: "4300.00", location: "HQ — Parking" }),
    A("AF-0054", "Tata Ace Mini Truck", vehicles.id, {
      serialNumber: "VIN-MAT445123PVA00871", acquisitionCost: "8900.00", location: "Warehouse", status: "under_maintenance", condition: "needs repair",
    }),
  ];

  const insertedAssets = await db
    .insert(assets)
    .values(seedAssets.map((a) => ({ ...a, qrData: qrFor(a.tag) })))
    .returning();

  const byTag = new Map(insertedAssets.map((a) => [a.tag, a]));
  const asset = (tag: string) => {
    const found = byTag.get(tag);
    if (!found) throw new Error(`seed bug: asset ${tag} missing`);
    return found;
  };

  // Seeded tags were explicit; move the sequence well past them so
  // auto-generated tags (AF-0201, ...) never collide.
  await db.execute(sql`SELECT setval('asset_tag_seq', 200, true)`);

  /* ----------------------------- allocations ----------------------------- */

  const [macbookAlloc, overdueAlloc] = await db
    .insert(allocations)
    .values([
      {
        // Laptop AF-0114 allocated to Priya Shah (mockup).
        assetId: asset("AF-0114").id,
        holderUserId: priya.id,
        allocatedAt: daysAgo(30),
        expectedReturnDate: toDateString(daysFromNow(60)),
        status: "active",
      },
      {
        // OVERDUE: expected back 10 days ago, still out with Raj.
        assetId: asset("AF-0021").id,
        holderUserId: raj.id,
        allocatedAt: daysAgo(45),
        expectedReturnDate: toDateString(daysAgo(10)),
        status: "active",
      },
      {
        // Department-held vehicle.
        assetId: asset("AF-0050").id,
        holderDepartmentId: fieldOps.id,
        allocatedAt: daysAgo(120),
        expectedReturnDate: null,
        status: "active",
      },
      {
        // Historical, already returned.
        assetId: asset("AF-0005").id,
        holderUserId: neha.id,
        allocatedAt: daysAgo(90),
        expectedReturnDate: toDateString(daysAgo(30)),
        returnedAt: daysAgo(32),
        checkinConditionNotes: "Returned in good condition, minor scuff on lid.",
        status: "returned",
      },
    ])
    .returning();

  /* ------------------------------- bookings ------------------------------ */

  // Existing booking: Conference Room B2, 09:00–10:00 today, Procurement Team.
  const b2Start = todayAt(9);
  const b2End = todayAt(10);
  const [b2Booking] = await db
    .insert(bookings)
    .values([
      {
        assetId: asset("AF-0030").id,
        bookedBy: procurement.id,
        startsAt: b2Start,
        endsAt: b2End,
        status: bookingStatusFor(b2Start, b2End),
        createdAt: daysAgo(2),
      },
      {
        assetId: asset("AF-0030").id,
        bookedBy: aditi.id,
        startsAt: new Date(daysFromNow(1).setHours(14, 0, 0, 0)),
        endsAt: new Date(daysFromNow(1).setHours(15, 30, 0, 0)),
        status: "upcoming",
        createdAt: daysAgo(1),
      },
      {
        assetId: asset("AF-0031").id,
        bookedBy: neha.id,
        startsAt: new Date(daysFromNow(2).setHours(11, 0, 0, 0)),
        endsAt: new Date(daysFromNow(2).setHours(12, 0, 0, 0)),
        status: "upcoming",
        createdAt: daysAgo(1),
      },
    ])
    .returning();

  /* ------------------------- maintenance requests ------------------------ */

  const [projectorMaint] = await db
    .insert(maintenanceRequests)
    .values([
      {
        // Projector AF-0062 is under_maintenance (mockup).
        assetId: asset("AF-0062").id,
        raisedBy: rohan.id,
        issue: "Lamp flickers and shuts off after ~10 minutes of use.",
        priority: "high",
        status: "in_progress",
        technicianName: "Suresh Kumar",
        decidedBy: admin.id,
        createdAt: daysAgo(5),
      },
      {
        assetId: asset("AF-0054").id,
        raisedBy: meera.id,
        issue: "Clutch slipping; needs service before next warehouse run.",
        priority: "medium",
        status: "assigned",
        technicianName: "City Auto Works",
        decidedBy: vikram.id,
        createdAt: daysAgo(8),
      },
      {
        assetId: asset("AF-0039").id,
        raisedBy: karan.id,
        issue: "Front-left castor broken; chair unusable.",
        priority: "low",
        status: "pending",
        createdAt: daysAgo(1),
      },
    ])
    .returning();

  /* --------------------------- transfer requests ------------------------- */

  const [transferReq] = await db
    .insert(transferRequests)
    .values([
      {
        assetId: asset("AF-0021").id,
        fromUserId: raj.id,
        toUserId: arjun.id,
        reason: "Moving to Facilities project; Arjun takes over the field laptop.",
        status: "requested",
        createdAt: daysAgo(2),
      },
      {
        assetId: asset("AF-0004").id,
        fromUserId: neha.id,
        toUserId: priya.id,
        reason: "Neha switched to a desktop workstation.",
        status: "approved",
        decidedBy: aditi.id,
        createdAt: daysAgo(20),
      },
    ])
    .returning();

  /* ------------------------------ audit cycle ---------------------------- */

  const [auditCycle] = await db
    .insert(auditCycles)
    .values({
      name: "Q3 FY26 Engineering Audit",
      scopeDepartmentId: engineering.id,
      scopeLocation: "HQ — Floor 2",
      startDate: toDateString(daysAgo(7)),
      endDate: toDateString(daysFromNow(21)),
      status: "open",
    })
    .returning();

  await db.insert(auditCycleAuditors).values([
    { cycleId: auditCycle.id, userId: vikram.id },
    { cycleId: auditCycle.id, userId: sana.id },
  ]);

  await db.insert(auditItems).values([
    { cycleId: auditCycle.id, assetId: asset("AF-0114").id, expectedLocation: "HQ — Floor 2", verification: "verified", auditorId: vikram.id },
    { cycleId: auditCycle.id, assetId: asset("AF-0004").id, expectedLocation: "HQ — Floor 2", verification: "pending" },
    { cycleId: auditCycle.id, assetId: asset("AF-0021").id, expectedLocation: "HQ — Floor 2", verification: "pending" },
    { cycleId: auditCycle.id, assetId: asset("AF-0018").id, expectedLocation: "Field Ops Depot", verification: "missing", auditorId: sana.id },
  ]);

  /* --------------------------- state transitions ------------------------- */

  await db.insert(stateTransitions).values(
    ASSET_STATE_TRANSITIONS.map((t) => ({
      fromState: t.from,
      toState: t.to,
      requiredRole: t.requiredRole,
    })),
  );

  /* ----------------------------- notifications --------------------------- */

  await db.insert(notifications).values([
    {
      userId: raj.id,
      category: "alert",
      message: "Dell Latitude 5440 (AF-0021) was due back 10 days ago. Please return or request an extension.",
      entityRef: `allocation:${overdueAlloc.id}`,
    },
    {
      userId: vikram.id,
      category: "alert",
      message: "Overdue allocation: AF-0021 (Dell Latitude 5440) held by Raj is past its expected return date.",
      entityRef: `allocation:${overdueAlloc.id}`,
    },
    {
      userId: aditi.id,
      category: "approval",
      message: "Transfer request: Raj → Arjun Singh for AF-0021 (Dell Latitude 5440) awaits your decision.",
      entityRef: `transfer_request:${transferReq.id}`,
    },
    {
      userId: procurement.id,
      category: "booking",
      message: "Your booking for Conference Room B2 (AF-0030) is confirmed, today 09:00–10:00.",
      entityRef: `booking:${b2Booking.id}`,
    },
    {
      userId: rohan.id,
      category: "alert",
      message: "Epson EB-X51 Projector (AF-0062) is under maintenance — technician Suresh Kumar assigned.",
      entityRef: `maintenance_request:${projectorMaint.id}`,
    },
  ]);

  /* ----------------------------- activity logs --------------------------- */

  await db.insert(activityLogs).values([
    {
      actorId: admin.id,
      action: "asset.created",
      entityType: "asset",
      entityId: asset("AF-0114").id,
      after: { tag: "AF-0114", name: 'MacBook Pro 16"', status: "available" },
      createdAt: daysAgo(200),
    },
    {
      actorId: vikram.id,
      action: "asset.allocated",
      entityType: "asset",
      entityId: asset("AF-0114").id,
      before: { status: "available" },
      after: { status: "allocated", holder: "Priya Shah", allocationId: macbookAlloc.id },
      createdAt: daysAgo(30),
    },
    {
      actorId: rohan.id,
      action: "maintenance.requested",
      entityType: "maintenance_request",
      entityId: projectorMaint.id,
      after: { asset: "AF-0062", issue: "Lamp flickers", priority: "high" },
      createdAt: daysAgo(5),
    },
    {
      actorId: admin.id,
      action: "asset.status_changed",
      entityType: "asset",
      entityId: asset("AF-0062").id,
      before: { status: "available" },
      after: { status: "under_maintenance" },
      createdAt: daysAgo(5),
    },
    {
      actorId: procurement.id,
      action: "booking.created",
      entityType: "booking",
      entityId: b2Booking.id,
      after: { asset: "AF-0030", startsAt: b2Start.toISOString(), endsAt: b2End.toISOString() },
      createdAt: daysAgo(2),
    },
    {
      actorId: raj.id,
      action: "transfer.requested",
      entityType: "transfer_request",
      entityId: transferReq.id,
      after: { asset: "AF-0021", to: "Arjun Singh" },
      createdAt: daysAgo(2),
    },
  ]);

  console.log(`  departments: 3, users: 13, categories: 3, assets: ${insertedAssets.length}`);
  console.log("  allocations: 4 (1 overdue), bookings: 3, maintenance: 3, transfers: 2");
  console.log(`  state transitions: ${ASSET_STATE_TRANSITIONS.length}, plus notifications & activity logs`);
  console.log("Done. Login: admin@assetflow.com / admin123 (others: password123)");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
