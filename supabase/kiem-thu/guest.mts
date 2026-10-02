import { makeDb, as, asAdmin } from "./db.mjs";
const db = await makeDb();
let fails = 0;
const ok = (c: boolean, m: string) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) fails++; };
async function expectError(p: Promise<unknown>, needle: string, msg: string) {
  try { await p; ok(false, msg + " (không báo lỗi)"); } catch (e: any) { ok(String(e.message).includes(needle), `${msg} [${String(e.message).slice(0, 70)}]`); }
}
const T = "00000000-0000-0000-0000-00000000000a", G = "00000000-0000-0000-0000-0000000000a1", S = "00000000-0000-0000-0000-00000000000b";
await asAdmin(db);
await db.exec(`insert into auth.users(id) values ('${T}'),('${G}'),('${S}');
  insert into profiles(id, full_name, role) values ('${T}','Thầy','teacher'),('${S}','HS','student');`);
const pub = (await db.query(`insert into exams(title, created_by, duration_minutes, is_public, public_slug, public_intro) values ('Giữa kỳ 1', $1, 90, true, 'giua-ky-1-toan-12', 'Đề giữa kỳ') returning id`, [T])).rows[0] as any;
const priv = (await db.query(`insert into exams(title, created_by) values ('Đề lớp', $1) returning id`, [T])).rows[0] as any;
for (const [ex, n] of [[pub.id, 3], [priv.id, 2]] as const) for (let i = 0; i < n; i++) {
  const q = (await db.query(`insert into questions(part, content_latex, correct_answer, created_by) values (1, 'c', '{"choice":"A"}', $1) returning id`, [T])).rows[0] as any;
  await db.query(`insert into exam_questions(exam_id, question_id, order_index, part) values ($1,$2,$3,1)`, [ex, q.id, i]);
}
await expectError(db.query(`update exams set is_public = true, public_slug = 'Có Dấu' where id = $1`, [priv.id]), "exams_public_slug_format", "Slug sai định dạng bị chặn");
await expectError(db.query(`update exams set is_public = true where id = $1`, [priv.id]), "exams_public_needs_slug", "Bật công khai mà thiếu slug bị chặn");

console.log("== Chưa đăng nhập (landing)");
await as(db, null);
const info = (await db.query(`select get_public_exam('giua-ky-1-toan-12') as e`)).rows[0] as any;
ok(info.e?.title === "Giữa kỳ 1" && info.e.part_counts["1"] === 3 && info.e.duration_minutes === 90, "get_public_exam trả thông tin đề công khai");
ok(((await db.query(`select get_public_exam('khong-ton-tai') as e`)).rows[0] as any).e === null, "Slug không tồn tại -> null");
ok(((await db.query(`select list_public_exams() as l`)).rows[0] as any).l.length === 1, "list_public_exams chỉ có đề công khai");
ok((await db.query(`select id from questions`)).rows.length === 0, "Không đọc được câu hỏi");

console.log("== Khách ẩn danh");
await as(db, G, { is_anonymous: true });
await expectError(db.query(`insert into profiles(id, full_name, role, is_guest) values ($1, 'Khách', 'student', false)`, [G]), "row-level security", "Khách phải có is_guest = true");
await expectError(db.query(`insert into profiles(id, full_name, role, is_guest) values ($1, 'Khách', 'teacher', true)`, [G]), "row-level security", "Khách không tạo được hồ sơ giáo viên");
await db.query(`insert into profiles(id, full_name, role, is_guest, signup_source) values ($1, 'Khách', 'student', true, 'fb')`, [G]);
await expectError(db.query(`insert into exam_attempts(exam_id, student_id, attempt_number) values ($1,$2,1)`, [priv.id, G]), "exam_not_public", "Khách không làm được đề không công khai");
const att = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number, entry_source) values ($1,$2,1,'fb') returning id`, [pub.id, G])).rows[0] as any;
const paper = (await db.query(`select get_exam_paper($1) as p`, [pub.id])).rows[0] as any;
ok(paper.p.length === 3 && paper.p[0].question.correct_answer === null, "Khách lấy được đề không đáp án");
const qids = paper.p.map((x: any) => x.question_id);
await db.query(`insert into answer_events(attempt_id, question_id, event_type, answer_value) values ($1,$2,'select','{"choice":"A"}'),($1,$3,'select','{"choice":"B"}')`, [att.id, qids[0], qids[1]]);
const sc = (await db.query(`select submit_attempt($1) as s`, [att.id])).rows[0] as any;
ok(Number(sc.s.total_score) === 0.25, `Khách nộp bài, máy chủ chấm 0.25 (được ${sc.s.total_score})`);
await db.query(`update profiles set full_name='Nguyễn Văn A', school_name='THPT X', province='Cần Thơ', class_label='12A1', contact_email='a@b.c', consent_at=now(), info_completed_at=now() where id=$1`, [G]);
ok(((await db.query(`select class_label from profiles where id=$1`, [G])).rows[0] as any).class_label === "12A1", "Khách cập nhật thông tin cơ bản");
await expectError(db.query(`update profiles set is_guest=false where id=$1`, [G]), "guest_flag_change_not_allowed", "Còn ẩn danh thì không tự bỏ cờ khách");
ok((await db.query(`select id from questions`)).rows.length === 3, "Sau khi nộp: khách đọc được 3 câu của đề đã làm");
const dist = (await db.query(`select get_exam_score_distribution($1) as d`, [pub.id])).rows[0] as any;
ok(dist.d.n === 1 && dist.d.scores === null, "Phân bố điểm: n=1, chưa đủ 20 nên ẩn danh sách điểm");

console.log("== Khách tạo tài khoản (Supabase giữ nguyên id, JWT hết ẩn danh)");
await as(db, G, { is_anonymous: false });
await db.query(`update profiles set is_guest=false where id=$1`, [G]);
ok(((await db.query(`select is_guest from profiles where id=$1`, [G])).rows[0] as any).is_guest === false, "Bỏ cờ khách sau khi đăng ký");
await expectError(db.query(`update profiles set is_guest=true where id=$1`, [G]), "guest_flag_change_not_allowed", "Không bật lại cờ khách");
ok(((await db.query(`select count(*)::int as n from exam_attempts where student_id=$1`, [G])).rows[0] as any).n === 1, "Lượt làm cũ vẫn thuộc tài khoản");

console.log("== Học sinh thường vẫn làm đề lớp");
await as(db, S);
const a2 = (await db.query(`insert into exam_attempts(exam_id, student_id, attempt_number) values ($1,$2,1) returning id`, [priv.id, S])).rows[0] as any;
ok(!!a2.id, "Học sinh có tài khoản tạo lượt làm đề không công khai");
await as(db, T);
const leads = (await db.query(`select p.full_name, p.school_name, p.class_label, a.entry_source from exam_attempts a join profiles p on p.id=a.student_id where a.exam_id=$1`, [pub.id])).rows as any[];
ok(leads.length === 1 && leads[0].class_label === "12A1" && leads[0].entry_source === "fb", "Giáo viên xem được thông tin lượt làm từ link công khai");
console.log(fails ? `\nTHẤT BẠI: ${fails}` : "\nTẤT CẢ ĐẠT");
process.exit(fails ? 1 : 0);
