// Shared helpers for building a throw-away test database that mirrors the real
// Supabase project: shim → baseline dump → migrations. Pure Node (needs only the
// `pg` package and any reachable PostgreSQL 15+ server) — no psql required.
//
// SAFETY: this only ever creates and drops a database it names itself
// (pure_test_<random>) on the server in TEST_DATABASE_URL. Never point
// TEST_DATABASE_URL at your real Supabase database.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../..");
export const SQL = {
  shim: path.join(root, "supabase/tests/00_supabase_shim.sql"),
  publicState: path.join(root, "supabase/tests/01_supabase_public_state.sql"),
  baseline: path.join(root, "supabase/baseline/pure1_schema_dump.sql"),
  migrationsDir: path.join(root, "supabase/migrations"),
};

export function listMigrations() {
  return fs
    .readdirSync(SQL.migrationsDir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort()
    .map((f) => path.join(SQL.migrationsDir, f));
}

/** Decode one COPY text-format field. */
function unescapeCopy(v) {
  if (v === "\\N") return null;
  return v.replace(/\\(.)/g, (_, c) =>
    c === "t" ? "\t" : c === "n" ? "\n" : c === "r" ? "\r" : c,
  );
}
const lit = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

/**
 * Turn a pg_dump plain-format file into SQL the `pg` driver can run:
 *  - drop psql-only meta commands (\restrict / \unrestrict)
 *  - drop settings unknown to older servers (transaction_timeout)
 *  - turn `COPY … FROM stdin` data blocks into INSERT statements
 */
export function prepareDump(text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\\(un)?restrict\b/.test(line)) continue;
    if (/^SET transaction_timeout\b/.test(line)) continue;
    const copy = line.match(/^COPY ([\w."]+) \(([^)]*)\) FROM stdin;$/);
    if (copy) {
      const rows = [];
      for (i++; i < lines.length && lines[i] !== "\\."; i++) {
        rows.push(lines[i].split("\t").map(unescapeCopy));
      }
      if (rows.length) {
        out.push(
          `INSERT INTO ${copy[1]} (${copy[2]}) VALUES\n` +
            rows.map((r) => `(${r.map(lit).join(", ")})`).join(",\n") +
            ";",
        );
      }
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

export async function runSqlFile(client, file, transform = (s) => s) {
  const sql = transform(fs.readFileSync(file, "utf8"));
  try {
    await client.query(sql);
  } catch (e) {
    e.message = `${path.relative(root, file)}: ${e.message}`;
    throw e;
  }
}

function withDatabase(url, dbname) {
  const u = new URL(url);
  u.pathname = `/${dbname}`;
  return u.toString();
}

/**
 * Create a fresh database and bring it to "Supabase project + all migrations".
 * Returns { url, name, drop() }.
 */
export async function buildTestDatabase(adminUrl, { migrations = true } = {}) {
  const name = `pure_test_${crypto.randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = withDatabase(adminUrl, name);

  // One fresh connection per file: the dump sets search_path = '' for its session.
  const apply = async (file, transform) => {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      await runSqlFile(c, file, transform);
    } finally {
      await c.end();
    }
  };

  await apply(SQL.shim);
  {
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query("drop schema if exists public cascade");
    await c.end();
  }
  await apply(SQL.baseline, prepareDump);
  await apply(SQL.publicState);
  if (migrations) {
    for (const f of listMigrations()) await apply(f);
  }

  return {
    url,
    name,
    async drop() {
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}
