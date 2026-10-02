// Dựng một Postgres trong bộ nhớ (PGlite) giống Supabase: schema.sql + toàn bộ
// migration_0xx theo thứ tự, rồi cấp quyền mặc định như Supabase.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUPA = path.resolve(HERE, "..");

export async function makeDb() {
  const db = new PGlite();
  const migrations = fs
    .readdirSync(SUPA)
    .filter((f) => /^migration_\d{3}_.*\.sql$/.test(f))
    .sort()
    .map((f) => path.join(SUPA, f));
  const files = [path.join(HERE, "bootstrap.sql"), path.join(SUPA, "schema.sql"), ...migrations, path.join(HERE, "grants.sql")];
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(f, "utf8"));
    } catch (e) {
      throw new Error(`Lỗi khi chạy ${path.basename(f)}: ${e.message}`);
    }
  }
  return db;
}

export async function as(db, uid, extraClaims = {}) {
  if (!uid) {
    await db.exec(`reset role; select set_config('request.jwt.claims','',false); set role anon;`);
    return;
  }
  const claims = JSON.stringify({ sub: uid, role: "authenticated", ...extraClaims });
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role authenticated;`);
}

export async function asAdmin(db) {
  await db.exec(`reset role; select set_config('request.jwt.claims','',false);`);
}
