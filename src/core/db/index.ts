/**
 * Drizzle client over a node-postgres Pool.
 *
 * Import `db` for queries and `db.transaction` for multi-statement work.
 * The pool is cached on globalThis in development so Next.js hot reloads
 * don't exhaust Postgres connections.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (see .env.example)");
  }
  return new Pool({ connectionString, max: 10 });
}

const globalForDb = globalThis as unknown as { assetflowPool?: Pool };

export const pool: Pool = globalForDb.assetflowPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.assetflowPool = pool;
}

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Database = typeof db;
/** The transaction handle passed to db.transaction callbacks. */
export type Transaction = Parameters<
  Parameters<Database["transaction"]>[0]
>[0];
/** Anything that can execute queries: the root client or a transaction. */
export type DbExecutor = Database | Transaction;

export * as schema from "./schema";
