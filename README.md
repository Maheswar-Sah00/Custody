# AssetFlow

Modular ERP for enterprise asset & resource management.

AssetFlow follows a modular ERP architecture — each business domain is an
independent module sharing a core kernel, mirroring how production ERPs
(Odoo, SAP) are structured. The kernel lives in `src/core` (database schema
and client, auth, RBAC, asset state machine, activity log, notifications) and
is the stable contract every feature module — assets, allocations, bookings,
maintenance, audits — builds against. Feature modules own their screens and
routes but never redefine schema, sessions, or lifecycle rules.

## Stack

Next.js 14 (App Router) · TypeScript · Drizzle ORM + raw PostgreSQL ·
Tailwind CSS + shadcn/ui · JWT auth (bcryptjs + jose) · zod

## Setup

Requirements: Node 20+, Docker.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env        # then set a real JWT_SECRET (openssl rand -base64 48)

# 3. Start Postgres 16
docker compose up -d

# 4. Apply migrations (Drizzle-generated schema + hand-written constraints)
npm run db:migrate

# 5. Seed the demo org
npm run db:seed

# 6. Run the app
npm run dev
```

Demo logins after seeding:

| Email | Password | Role |
| --- | --- | --- |
| admin@assetflow.com | admin123 | admin |
| aditi.rao@assetflow.com | password123 | dept_head (Engineering) |
| vikram.nair@assetflow.com | password123 | asset_manager |
| priya.shah@assetflow.com | password123 | employee |

## Zero external APIs

Everything runs self-hosted — there are no third-party SaaS dependencies:

- **Auth** — bcryptjs password hashing + jose-signed JWTs in an httpOnly
  cookie. No Auth0/Clerk/NextAuth providers.
- **Password reset** — short-lived signed token returned in-app. No email
  service.
- **Notifications** — rows in the `notifications` table, read by the in-app
  notification center. No push/email provider.
- **QR codes** — `assets.qr_data` holds a self-describing payload
  (`assetflow:asset:AF-0114`) rendered/scanned by the app itself. No QR SaaS.
- **Database** — plain Postgres 16 in Docker.

## Project layout

```
src/core/               ← the kernel (this is the contract; import, don't fork)
  db/schema.ts          ← all tables, enums, and inferred types
  db/index.ts           ← Drizzle client over a pg Pool (db, pool, DbExecutor)
  auth/                 ← passwords, JWT tokens, cookie sessions, signup/login/reset
  rbac.ts               ← hasRole / requireRole / requireSession guards
  state-machine.ts      ← canTransition + ASSET_STATE_TRANSITIONS (asset lifecycle)
  activity-log.ts       ← logActivity(...) audit trail writer
  notifications.ts      ← notify(...) in-app notification writer
  errors.ts             ← ApiError family + toErrorResponse for routes
src/app/api/auth/       ← signup, login, logout, forgot-password, reset-password
drizzle/                ← migrations (0001_constraints.sql is hand-written SQL)
scripts/seed.ts         ← demo org seed (npm run db:seed)
```

### Database invariants enforced in Postgres

Beyond the Drizzle schema, `drizzle/0001_constraints.sql` adds:

- `no_overlapping_bookings` — GiST exclusion constraint: no two
  upcoming/ongoing bookings of the same asset may overlap in time.
- `one_active_allocation` — partial unique index: an asset has at most one
  active allocation.
- `allocation_single_holder` — an allocation is held by exactly one party
  (user XOR department).
- Asset tags auto-generate from a sequence as `AF-0001`, `AF-0002`, …

All foreign keys are `ON DELETE RESTRICT`.

### Rules for feature modules

- Import tables and types from `@/core/db/schema` — never redeclare them.
- Guard every mutation with `requireRole` / `requireSession`.
- Validate asset status changes with `canTransition` before writing.
- Wrap multi-step writes in `db.transaction` and pass the transaction into
  `logActivity` / `notify` so side effects commit atomically.
- Self-service signup only ever creates `employee` users; role elevation is
  an admin action.
