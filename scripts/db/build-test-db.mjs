#!/usr/bin/env node
// Usage:  TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres \
//           node scripts/db/build-test-db.mjs [--no-migrations] [--keep]
// Builds a throw-away database (shim + baseline dump + migrations), prints a
// summary, and drops it again unless --keep is given. Used to prove that the
// migrations apply cleanly on top of the existing schema.
import pg from "pg";
import { buildTestDatabase } from "./lib.mjs";

const adminUrl = process.env.TEST_DATABASE_URL;
if (!adminUrl) {
  console.error("Set TEST_DATABASE_URL to a PostgreSQL server you can create databases on (never your Supabase project).");
  process.exit(2);
}
const keep = process.argv.includes("--keep");
const migrations = !process.argv.includes("--no-migrations");

const db = await buildTestDatabase(adminUrl, { migrations });
try {
  const c = new pg.Client({ connectionString: db.url });
  await c.connect();
  const { rows } = await c.query(`
    select c.relname as table, c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  console.table(rows);
  await c.end();
  console.log(`OK — ${migrations ? "baseline + migrations" : "baseline only"} applied to ${db.name}`);
} finally {
  if (keep) console.log(`kept: ${db.url}`);
  else await db.drop();
}
