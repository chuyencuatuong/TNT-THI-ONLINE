import { makeDb, as, asAdmin } from "./db.mjs";
import { resolveExamScoring, scoreQuestionWithAnswer, combineScores } from "../../src/lib/scoring";
import { computeActiveSeconds } from "../../src/lib/diagnosis";

const db = await makeDb();
let fails = 0;
const ok = (cond: boolean, msg: string) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fails++; };
async function expectError(p: Promise<unknown>, needle: string, msg: string) {
  try { await p; ok(false, msg + " (không báo lỗi)"); } catch (e: any) { ok(String(e.message).includes(needle), `${msg} [${String(e.message).slice(0, 70)}]`); }
}
const rnd = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: T[]): T => a[rnd(a.length)];
const T = "00000000-0000-0000-0000-00000000000a", S = "00000000-0000-0000-0000-00000000000b", S2 = "00000000-0000-0000-0000-00000000000c", U = "00000000-0000-0000-0000-00000000000d";

await asAdmin(db);
await db.exec(`insert into auth.users(id) values ('${T}'),('${S}'),('${S2}'),('${U}');
  insert into profiles(id, full_name, role) values ('${T}','Thầy','teacher'),('${S}','HS 1','student'),('${S2}','HS 2','student');`);

async function makeExam(mode: string, method: string | null) {
  const ex = (await db.query(`insert into exams(title, created_by, scoring_mode, custom_scoring_method) values ('Đề ${mode}', $1, $2, $3) returning id`, [T, mode, method])).rows[0] as any;
  const qs: any[] = [];
  const parts = [...Array(12).fill(1), ...Array(4).fill(2), ...Array(6).fill(3)];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const correct = part === 1 ? { choice: pick(["A","B","C","D"]) } : part === 2 ? { a: pick([true,false]), b: pick([true,false]), c: pick([true,false]), d: pick([true,false]) } : { value: pick(["12.5", "3", "-2", "0,75", "1000"]) };
    const q = (await db.query(`insert into questions(part, content_latex, correct_answer, created_by, default_points, solution_latex) values ($1, $2, $3, $4, $5, 'lời giải') returning id, part, correct_answer, default_points`,
      [part, `Câu ${i + 1}`, JSON.stringify(correct), T, part === 3 ? pick([0.5, 0.25]) : null])).rows[0] as any;
    const cp = mode === "tuy_chinh" ? pick([0.3, 0.5, 1, null]) : null;
    const c2 = mode === "tuy_chinh" && part === 2 && Math.random() < 0.6 ? { a: 0.1, b: 0.2, c: 0.3, d: 0.4 } : null;
    await db.query(`insert into exam_questions(exam_id, question_id, order_index, part, custom_points, custom_part2_points) values ($1,$2,$3,$4,$5,$6)`,
      [ex.id, q.id, i, part, cp, c2 ? JSON.stringify(c2) : null]);
    await db.query(`insert into question_option_rationale(question_id, option_key, error_type) values ($1, 'A', 'conceptual')`, [q.id]);
    qs.push({ ...q, custom_points: cp, custom_part2_points: c2, eq_part: part });
  }
  return { id: ex.id, qs, mode, method };
}

async function runExam(e: any) {
  console.log(`\n== Đề ${e.mode}/${e.method}`);
  await as(db, S);
  ok((await db.query(`select id from questions`)).rows.length === 0, "HS chưa nộp: không đọc được câu hỏi nào");
  await expectError(db.query(`select get_exam_paper($1)`, [e.id]), "no_attempt", "get_exam_paper bị chặn khi chưa có lượt làm");
  const att = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number, submitted_at, started_at) values ($1,$2,1, now(), now() - interval '5 days') returning id, submitted_at, started_at`, [e.id, S])).rows[0] as any;
  ok(att.submitted_at === null, "Trigger xoá submitted_at do HS tự gửi lên");
  const paper = (await db.query(`select get_exam_paper($1) as p`, [e.id])).rows[0] as any;
  ok(paper.p.length === 22 && paper.p.every((x: any) => x.question.correct_answer === null && x.question.solution_latex === null), "get_exam_paper: 22 câu, không có đáp án/lời giải");
  ok((await db.query(`select id from questions`)).rows.length === 0, "Vẫn không đọc được bảng questions khi đang làm");
  ok((await db.query(`select id from question_option_rationale`)).rows.length === 0, "Không đọc được lý giải phương án khi đang làm");
  await db.query(`insert into answer_events(attempt_id, question_id, event_type, answer_value, created_at) values ($1, $2, 'select', '{"choice":"A"}', '2020-01-01')`, [att.id, e.qs[0].id]);
  const evt = (await db.query(`select created_at from answer_events where attempt_id = $1`, [att.id])).rows[0] as any;
  ok(new Date(evt.created_at).getFullYear() > 2020, "Giờ ghi sự kiện do máy chủ đặt");
  await expectError(db.query(`insert into attempt_scores(attempt_id, total_score) values ($1, 10)`, [att.id]), "row-level security", "HS không tự ghi attempt_scores");
  await db.query(`update exam_attempts set submitted_at = now() where id = $1`, [att.id]);
  await asAdmin(db);
  ok((await db.query(`select submitted_at from exam_attempts where id=$1`, [att.id])).rows[0]!["submitted_at" as never] === null, "HS không tự đánh dấu đã nộp");

  // Sự kiện có giờ cố định để đối chiếu thời gian (tắt trigger tạm thời)
  await db.exec(`delete from answer_events; alter table answer_events disable trigger trg_answer_events_created_at; alter table question_view_events disable trigger trg_view_events_created_at;`);
  const evRows: any[] = [], viewRows: any[] = [];
  let t = Date.parse("2026-10-02T01:00:00.000Z");
  for (const q of e.qs) {
    const n = rnd(4); // 0 = bỏ trống
    for (let k = 0; k < n; k++) {
      t += 1000 + rnd(90000);
      const v = q.part === 1 ? { choice: pick(["A","B","C","D"]) } : q.part === 2 ? { a: pick([true,false]), b: pick([true,false]), ...(Math.random()<.8?{c: pick([true,false])}:{}), d: pick([true,false]) } : { value: pick(["12,5", "3", " -2 ", "0.75", "1 000", "abc"]) };
      evRows.push([q.id, k === 0 ? "select" : "change", JSON.stringify(v), new Date(t).toISOString()]);
    }
    const nv = rnd(3);
    for (let k = 0; k < nv; k++) {
      t += 500 + rnd(5000); viewRows.push([q.id, "enter", new Date(t).toISOString()]);
      t += 123 + rnd(200000); if (Math.random() < 0.9) viewRows.push([q.id, "leave", new Date(t).toISOString()]);
    }
  }
  for (const r of evRows) await db.query(`insert into answer_events(attempt_id, question_id, event_type, answer_value, created_at) values ($1,$2,$3,$4,$5)`, [att.id, ...r]);
  for (const r of viewRows) await db.query(`insert into question_view_events(attempt_id, question_id, event_type, created_at) values ($1,$2,$3,$4)`, [att.id, ...r]);
  await db.exec(`alter table answer_events enable trigger trg_answer_events_created_at; alter table question_view_events enable trigger trg_view_events_created_at;`);

  // Kết quả kỳ vọng tính bằng chính code TypeScript cũ
  const scoring = resolveExamScoring(e.mode, e.method, e.qs.map((q: any) => ({ question_id: q.id, part: q.eq_part, default_points: q.default_points === null ? null : Number(q.default_points), custom_points: q.custom_points, custom_part2_points: q.custom_part2_points })));
  const exp: Record<string, any> = {}; let p1 = 0, p2 = 0, p3 = 0; const wrong: string[] = [];
  for (const q of e.qs) {
    const qe = evRows.filter(r => r[0] === q.id); const qv = viewRows.filter(r => r[0] === q.id);
    const final = qe.length ? JSON.parse(qe[qe.length - 1][2]) : null;
    const time = qv.length ? computeActiveSeconds(qv.map(r => ({ event_type: r[1], created_at: r[2] }))) : qe.length ? Math.max(0, Math.round((Date.parse(qe[qe.length-1][3]) - Date.parse(qe[0][3])) / 1000)) : 0;
    const res = scoreQuestionWithAnswer({ part: q.part, correct_answer: q.correct_answer, default_points: q.default_points === null ? null : Number(q.default_points) }, final, scoring.get(q.id), e.mode === "tuy_chinh");
    if (q.part === 1) p1 += res.score; else if (q.part === 2) p2 += res.score; else p3 += res.score;
    if (res.score < scoring.get(q.id)!.maxScore) wrong.push(q.id);
    exp[q.id] = { score: res.score, sub: res.subCorrectCount, time, changes: Math.max(0, qe.length - 1) };
  }
  const totals = combineScores(p1, p2, p3);

  await as(db, S2);
  await expectError(db.query(`select submit_attempt($1)`, [att.id]), "not_owner", "HS khác không nộp hộ được");
  await as(db, S);
  const out = (await db.query(`select submit_attempt($1) as s`, [att.id])).rows[0] as any;
  ok(Math.abs(Number(out.s.total_score) - totals.totalScore) < 1e-9 && Math.abs(Number(out.s.part1_score) - totals.part1Score) < 1e-9 && Math.abs(Number(out.s.part2_score) - totals.part2Score) < 1e-9 && Math.abs(Number(out.s.part3_score) - totals.part3Score) < 1e-9,
    `Tổng điểm trùng TS: SQL ${out.s.total_score} = TS ${totals.totalScore}`);
  const rows = (await db.query(`select question_id, score::float8, sub_correct_count, time_spent_seconds, change_count from question_responses where attempt_id=$1`, [att.id])).rows as any[];
  let mism = 0;
  for (const r of rows) {
    const x = exp[r.question_id];
    const stored = Math.round(x.score * 100) / 100;
    if (Math.abs(r.score - stored) > 1e-9 || (r.sub_correct_count ?? null) !== (x.sub ?? null) || r.time_spent_seconds !== x.time || r.change_count !== x.changes) { mism++; console.log("    lệch", r, x); }
  }
  ok(rows.length === 22 && mism === 0, `22 dòng question_responses trùng TS (điểm, số ý đúng, thời gian, số lần đổi)`);
  const jr = (await db.query(`select question_id from wrong_answer_journal where student_id=$1 and source_attempt_id=$2`, [S, att.id])).rows as any[];
  ok(jr.length === wrong.length && wrong.every(w => jr.some(j => j.question_id === w)), `Nhật ký câu sai: ${jr.length} câu, trùng TS`);
  ok((await db.query(`select id from questions`)).rows.length >= 22, "Đã nộp: đọc được câu hỏi của đề này");
  ok((await db.query(`select id from question_option_rationale`)).rows.length >= 22, "Đã nộp: đọc được lý giải phương án");
  const again = (await db.query(`select submit_attempt($1) as s`, [att.id])).rows[0] as any;
  ok(again.s.total_score === out.s.total_score && again.s.computed_at === out.s.computed_at, "Nộp lại: trả điểm cũ, không chấm lại");
  await expectError(db.query(`insert into answer_events(attempt_id, question_id, event_type, answer_value) values ($1,$2,'change','{"choice":"B"}')`, [att.id, e.qs[0].id]), "row-level security", "Không ghi thêm đáp án sau khi nộp");
}

const exams = [await makeExam("chuan_thpt", null), await makeExam("tuy_chinh", "thu_cong"), await makeExam("tuy_chinh", "tu_dong")];
for (let round = 0; round < 3; round++) {
  for (const e of exams) {
    await asAdmin(db);
    await db.exec(`delete from exam_attempts where student_id = '${S}'`);
    await runExam(e);
  }
}

console.log("\n== Vai trò & ẩn danh");
await as(db, U);
await expectError(db.query(`insert into profiles(id, full_name, role) values ($1, 'Kẻ gian', 'teacher')`, [U]), "row-level security", "Tự tạo hồ sơ giáo viên bị chặn");
await db.query(`insert into profiles(id, full_name, role) values ($1, 'Người mới', 'student')`, [U]);
await expectError(db.query(`update profiles set role = 'teacher' where id = $1`, [U]), "role_change_not_allowed", "Tự đổi thành giáo viên bị chặn");
await as(db, T);
await expectError(db.query(`update profiles set role = 'teacher' where id = $1`, [U]), "role_change_not_allowed", "Giáo viên cũng không đổi vai trò qua API");
await as(db, null);
ok((await db.query(`select id from questions`)).rows.length === 0, "Chưa đăng nhập: không đọc được câu hỏi");
await as(db, T);
ok((await db.query(`select id from questions`)).rows.length === 66, "Giáo viên vẫn đọc được toàn bộ câu hỏi");
await asAdmin(db);
await db.query(`update profiles set role='teacher' where id=$1`, [U]);
ok(true, "SQL Editor (không có auth.uid) vẫn đổi được vai trò");

console.log(fails ? `\nTHẤT BẠI: ${fails}` : "\nTẤT CẢ ĐẠT");
process.exit(fails ? 1 : 0);
