import { makeDb } from "./db.mjs";
import { scoreQuestionWithAnswer, normalizeShortAnswer } from "../../src/lib/scoring";

const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const P3 = ["12.5", "12,50", "12,5", "-3", " 1 000 ", "1000", "abc", "ABC", "Ab c", "0x1A", "26", "1e3", "1000.0", "", ".5", "0.5", "5.", "5", "Infinity", "1,2,3", "1.2,3", "0", "  ", "+5", "-0", "0b101", "0o17", "15", "1e400", "1e-400", "0.000001", "0.0000005", "√2", "x=2", "X = 2"];
function p1ans(): unknown { return pick([null, { choice: pick(["A","B","C","D"]) }, { choice: "" }, { choice: null }, {}, "A", { choice: 1 }, { choice: 0 }, { choice: false }, [], { choice: pick(["A","B"]) }]); }
function boolish(): unknown { return pick([true, false, null, undefined, "true", 1, 0, true, false]); }
function p2obj(): Record<string, unknown> { const o: Record<string, unknown> = {}; for (const k of ["a","b","c","d"]) { const v = boolish(); if (v !== undefined) o[k] = v; } return o; }
function p2ans(): unknown { return pick([null, p2obj(), p2obj(), p2obj(), "abc", [true], {}]); }
function p3ans(): unknown { return pick([null, { value: pick(P3) }, { value: pick(P3) }, { value: "" }, {}]); }

const cases: any[] = [];
for (let i = 0; i < 6000; i++) {
  const part = pick([1, 2, 3]) as 1 | 2 | 3;
  const correct = part === 1 ? pick([{ choice: pick(["A","B","C","D"]) }, { choice: "A" }, {}])
    : part === 2 ? { a: pick([true,false]), b: pick([true,false]), c: pick([true,false]), d: pick([true,false]) }
    : { value: pick(P3.filter(s => s.trim() !== "")) };
  const answer = part === 1 ? p1ans() : part === 2 ? p2ans() : p3ans();
  const isCustom = Math.random() < 0.5;
  const sub = Math.random() < 0.4 ? { a: pick([0.1,0.25,0.5]), b: pick([0.1,0.25]), c: pick([0.2,0.3]), d: pick([0.25,0.4]) } : null;
  const max = pick([0.25, 0.5, 1, 1.25, 0.33, 2.5, 0.42]);
  const dp = pick([null, 0.5, 0.25, 1]);
  let ts;
  try {
    ts = scoreQuestionWithAnswer({ part, correct_answer: correct, default_points: dp }, answer, { maxScore: max, part2SubPoints: sub as any }, isCustom);
  } catch { continue; } // TS ném lỗi (dữ liệu hỏng) -> bỏ qua, SQL trả 0
  cases.push({ part, correct, answer: answer === undefined ? null : answer, dp, isCustom, max, sub, ts });
}

const db = await makeDb();
const res = await db.query(`
  select (x->>'i')::int as i, s.score::float8 as score, s.sub_correct
  from jsonb_array_elements($1::jsonb) x,
  lateral tnt_score_question((x->>'part')::int, x->'correct', case when jsonb_typeof(x->'answer')='null' then null else x->'answer' end,
     (x->>'dp')::numeric, (x->>'isCustom')::boolean, (x->>'max')::numeric,
     case when jsonb_typeof(x->'sub')='null' then null else x->'sub' end) s`,
  [JSON.stringify(cases.map((c, i) => ({ ...c, i })))]);
let bad = 0;
for (const r of res.rows as any[]) {
  const c = cases[r.i];
  const okScore = Math.abs(r.score - c.ts.score) < 1e-9;
  const okSub = (r.sub_correct ?? null) === (c.ts.subCorrectCount ?? null);
  if (!okScore || !okSub) { bad++; if (bad <= 8) console.log("LỆCH", JSON.stringify(c), "sql=", r.score, r.sub_correct); }
}
console.log(`score parity: ${res.rows.length} ca, lệch ${bad}`);

// Number() của JS
const ALPH = "0123456789.+-eExXoObBaf,In";
const strs: string[] = [...P3.map(normalizeShortAnswer)];
for (let i = 0; i < 20000; i++) { let s = ""; const L = rnd(7); for (let j = 0; j < L; j++) s += ALPH[rnd(ALPH.length)]; strs.push(s); }
const r2 = await db.query(`select ord::int as i, tnt_js_number(v) as n from jsonb_array_elements_text($1::jsonb) with ordinality t(v, ord)`, [JSON.stringify(strs)]);
let bad2 = 0;
for (const r of r2.rows as any[]) {
  const s = strs[r.i - 1]; const js = Number(s);
  const sql = r.n === null ? NaN : Number(r.n);
  const same = (Number.isNaN(js) && Number.isNaN(sql)) || js === sql || Math.abs(js - sql) <= Math.abs(js) * 1e-15;
  if (!same) { bad2++; if (bad2 <= 8) console.log("NUMBER LỆCH", JSON.stringify(s), js, r.n); }
}
console.log(`Number() parity: ${strs.length} chuỗi, lệch ${bad2}`);
