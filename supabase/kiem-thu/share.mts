// Kiểm thử migration_024: link chia sẻ, ?ref=, dọn khách bỏ dở, củng cố quyền đọc.
import { makeDb, as, asAdmin } from "./db.mjs";
const db = await makeDb();
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
async function expectError(p: Promise<unknown>, needle: string, msg: string) {
  try { await p; ok(false, msg + " (không báo lỗi)"); } catch (e: any) { ok(String(e.message).includes(needle), `${msg} [${String(e.message).slice(0, 70)}]`); }
}
const T = "00000000-0000-0000-0000-00000000000a";
const G1 = "00000000-0000-0000-0000-0000000000a1"; // khách chia sẻ
const G2 = "00000000-0000-0000-0000-0000000000a2"; // khách được mời
const OLD = "00000000-0000-0000-0000-0000000000a3"; // khách bỏ dở lâu
const OLD2 = "00000000-0000-0000-0000-0000000000a4"; // khách cũ nhưng đã nộp
const S = "00000000-0000-0000-0000-00000000000b";

await asAdmin(db);
await db.exec(`insert into auth.users(id, is_anonymous, created_at) values
  ('${T}', false, now()), ('${S}', false, now()),
  ('${G1}', true, now()), ('${G2}', true, now()),
  ('${OLD}', true, now() - interval '40 days'), ('${OLD2}', true, now() - interval '40 days');
  insert into profiles(id, full_name, role) values ('${T}','Thầy','teacher'),('${S}','Lê Văn Sáng','student');
  insert into profiles(id, full_name, role, is_guest) values ('${OLD}','Khách','student',true),('${OLD2}','Khách cũ','student',true);
  insert into classes(name) values ('12A1');`);
const pub = (await db.query(`insert into exams(title, created_by, duration_minutes, is_public, public_slug) values ('Giữa kỳ 1', $1, 90, true, 'giua-ky-1') returning id`, [T])).rows[0] as any;
const pub2 = (await db.query(`insert into exams(title, created_by, is_public, public_slug) values ('Cuối kỳ 1', $1, true, 'cuoi-ky-1') returning id`, [T])).rows[0] as any;
const priv = (await db.query(`insert into exams(title, created_by) values ('Đề lớp riêng', $1) returning id`, [T])).rows[0] as any;
for (const ex of [pub.id, pub2.id, priv.id]) {
  const q = (await db.query(`insert into questions(part, content_latex, correct_answer, created_by) values (1, 'c', '{"choice":"A"}', $1) returning id`, [T])).rows[0] as any;
  await db.query(`insert into exam_questions(exam_id, question_id, order_index, part) values ($1,$2,0,1)`, [ex, q.id]);
}
// Khách cũ đã nộp bài (dữ liệu thật, phải giữ)
const oldAtt = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number, submitted_at) values ($1,$2,1, now()) returning id`, [pub.id, OLD2])).rows[0] as any;
await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number) values ($1,$2,1)`, [pub.id, OLD]);

console.log("== Quyền đọc đề / lớp");
await as(db, null);
ok((await db.query(`select id from exams`)).rows.length === 2, "Chưa đăng nhập: chỉ thấy 2 đề công khai");
ok((await db.query(`select * from exam_questions`)).rows.length === 2, "Chưa đăng nhập: chỉ thấy câu của đề công khai");
ok((await db.query(`select id from classes`)).rows.length === 0, "Chưa đăng nhập: không thấy lớp");
await as(db, S);
ok((await db.query(`select id from exams`)).rows.length === 3, "Học sinh có tài khoản: thấy cả 3 đề (Kho đề)");
ok((await db.query(`select id from classes`)).rows.length === 1, "Học sinh có tài khoản: thấy lớp");

console.log("== Khách 1 làm bài và chia sẻ");
await as(db, G1, { is_anonymous: true });
await db.query(`insert into profiles(id, full_name, role, is_guest) values ($1, 'Khách', 'student', true)`, [G1]);
ok((await db.query(`select id from exams`)).rows.length === 2, "Khách: chỉ thấy đề công khai");
ok((await db.query(`select id from classes`)).rows.length === 0, "Khách: không thấy lớp");
const a1 = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number) values ($1,$2,1) returning id`, [pub.id, G1])).rows[0] as any;
await expectError(db.query(`select create_attempt_share($1)`, [a1.id]), "share_not_allowed", "Chưa nộp thì chưa chia sẻ được");
const qid = ((await db.query(`select get_exam_paper($1) as p`, [pub.id])).rows[0] as any).p[0].question_id;
await db.query(`insert into answer_events(attempt_id, question_id, event_type, answer_value) values ($1,$2,'select','{"choice":"A"}')`, [a1.id, qid]);
await db.query(`select submit_attempt($1)`, [a1.id]);
await db.query(`update profiles set full_name='Trần Thị Bích Ngọc', info_completed_at=now() where id=$1`, [G1]);
const tok = ((await db.query(`select create_attempt_share($1, true) as t`, [a1.id])).rows[0] as any).t;
ok(typeof tok === "string" && tok.length === 36, "Tạo link chia sẻ sau khi nộp");
const tok2 = ((await db.query(`select create_attempt_share($1, false) as t`, [a1.id])).rows[0] as any).t;
ok(tok2 === tok, "Tạo lại trả cùng link (1 link/lượt làm)");
await expectError(db.query(`insert into attempt_shares(attempt_id, created_by) values ($1,$2)`, [a1.id, G1]), "row-level security", "Không ghi thẳng vào bảng chia sẻ");
await db.query(`select create_attempt_share($1, true)`, [a1.id]);

console.log("== Người ngoài mở link");
await as(db, null);
const sh = ((await db.query(`select get_shared_result($1) as r`, [tok])).rows[0] as any).r;
ok(sh?.given_name === "Ngọc" && sh.slug === "giua-ky-1" && Number(sh.total_score) > 0 && sh.show_score === true, `Tóm lược: tên gọi + điểm (${JSON.stringify(sh)})`);
ok(!("school_name" in sh) && !("full_name" in sh), "Không lộ họ đầy đủ / trường");
ok(((await db.query(`select get_shared_result('00000000-0000-0000-0000-000000000999') as r`)).rows[0] as any).r === null, "Token lạ -> null");

console.log("== Khách 2 vào từ link (?ref=)");
await as(db, G2, { is_anonymous: true });
await db.query(`insert into profiles(id, full_name, role, is_guest) values ($1, 'Khách', 'student', true)`, [G2]);
const a2 = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number, ref_share) values ($1,$2,1,$3) returning ref_share`, [pub.id, G2, tok])).rows[0] as any;
ok(a2.ref_share === tok, "Lượt làm ghi lại token chia sẻ");
const a3 = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number, ref_share) values ($1,$2,1,$3) returning ref_share`, [pub2.id, G2, tok])).rows[0] as any;
ok(a3.ref_share === null, "Token của đề khác bị bỏ");
await as(db, G1, { is_anonymous: true });
const a4 = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number, ref_share) values ($1,$2,2,$3) returning ref_share`, [pub.id, G1, tok])).rows[0] as any;
ok(a4.ref_share === null, "Tự bấm link của chính mình không tính");
await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number) values ($1,$2,3)`, [pub.id, G1]);
await expectError(db.query(`insert into exam_attempts(exam_id, student_id, attempt_number) values ($1,$2,4)`, [pub.id, G1]), "guest_attempt_limit", "Khách tối đa 3 lượt / đề");
ok((await db.query(`select * from attempt_shares`)).rows.length === 1, "Khách thấy link của mình");
await as(db, G2, { is_anonymous: true });
ok((await db.query(`select * from attempt_shares`)).rows.length === 0, "Khách khác không đọc được bảng chia sẻ");

console.log("== Giáo viên");
await as(db, T);
ok((await db.query(`select * from attempt_shares`)).rows.length === 1, "Giáo viên đọc được link chia sẻ");
ok(((await db.query(`select count(*)::int as n from exam_attempts where ref_share is not null`)).rows[0] as any).n === 1, "Giáo viên đếm được 1 lượt làm từ chia sẻ");

console.log("== Thu hồi");
await as(db, G1, { is_anonymous: true });
await db.query(`select revoke_attempt_share($1)`, [a1.id]);
await as(db, null);
ok(((await db.query(`select get_shared_result($1) as r`, [tok])).rows[0] as any).r === null, "Thu hồi xong link hết hiệu lực");

console.log("== Dọn khách bỏ dở");
await as(db, G1, { is_anonymous: true });
await expectError(db.query(`select cleanup_abandoned_guests(30)`), "permission denied", "Người dùng không gọi được hàm dọn");
await asAdmin(db);
const n = ((await db.query(`select cleanup_abandoned_guests(30) as n`)).rows[0] as any).n;
ok(n === 1, `Xoá đúng 1 khách bỏ dở (được ${n})`);
const left = (await db.query(`select id from auth.users order by id`)).rows.map((r: any) => r.id);
ok(!left.includes(OLD) && left.includes(OLD2) && left.includes(G1), "Giữ khách đã nộp bài và khách mới");
ok(((await db.query(`select count(*)::int as n from exam_attempts where id=$1`, [oldAtt.id])).rows[0] as any).n === 1, "Bài đã nộp của khách cũ còn nguyên");

console.log(fails === 0 ? "TẤT CẢ ĐẠT" : `CÓ ${fails} LỖI`);
process.exit(fails ? 1 : 0);
