import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupDb, type TestDb } from "./helpers";

/**
 * Contract test: every `.rpc("fn", { p_arg: … })` call in the application source
 * must name a function that exists in the migrated database, with EXACTLY the
 * argument names that function declares. Mocks in unit tests cannot catch a
 * renamed parameter; this does.
 */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

function extractRpcCalls(source: string): { fn: string; args: string[] }[] {
  const out: { fn: string; args: string[] }[] = [];
  const re = /\.rpc\(\s*"(\w+)"\s*(?:,\s*\{)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const fn = m[1]!;
    const args: string[] = [];
    if (m[0].endsWith("{")) {
      // balanced scan of the argument object; collect only TOP-LEVEL keys
      let depth = 1;
      let i = re.lastIndex;
      let top = "";
      for (; i < source.length && depth > 0; i++) {
        const c = source[i]!;
        if (c === "{" || c === "(" || c === "[") depth++;
        else if (c === "}" || c === ")" || c === "]") depth--;
        else if (depth === 1) top += c;
      }
      for (const k of top.matchAll(/(?:^|,)\s*(p_\w+)\s*:/g)) args.push(k[1]!);
    }
    out.push({ fn, args });
  }
  return out;
}

describe.skipIf(!hasDb)("application ↔ database RPC contract", () => {
  let db: TestDb;
  beforeAll(async () => { db = await setupDb(); });
  afterAll(async () => { await db?.drop(); });

  const calls = walk(path.resolve(__dirname, "../../src")).flatMap((f) => extractRpcCalls(fs.readFileSync(f, "utf8")).map((c) => ({ ...c, file: path.relative(process.cwd(), f) })));

  it("finds the RPC calls it is supposed to check", () => {
    const names = new Set(calls.map((c) => c.fn));
    for (const n of ["create_checkout_order", "begin_payment_attempt", "mark_payment_initialized", "mark_payment_init_failed", "record_payment_event", "complete_payment_event", "apply_payment_result", "claim_email", "finish_email", "ensure_my_profile", "admin_save_product", "admin_set_product_status", "admin_adjust_stock", "admin_set_stock", "admin_add_product_image", "admin_save_category"]) expect(names, n).toContain(n);
  });

  it("every call matches a real function and its declared argument names", async () => {
    for (const c of calls) {
      const { rows } = await db.su.query(
        `select p.proargnames as names, p.pronargdefaults as ndef, p.pronargs as nargs
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = $1`,
        [c.fn],
      );
      expect(rows.length, `${c.fn} (${c.file}) does not exist`).toBeGreaterThan(0);
      const declared: string[] = rows[0].names ?? [];
      const required = declared.slice(0, rows[0].nargs - rows[0].ndef);
      for (const a of c.args) expect(declared, `${c.fn} (${c.file}) has no parameter ${a}`).toContain(a);
      for (const r of required) expect(c.args, `${c.fn} (${c.file}) is missing required ${r}`).toContain(r);
    }
  });
});
