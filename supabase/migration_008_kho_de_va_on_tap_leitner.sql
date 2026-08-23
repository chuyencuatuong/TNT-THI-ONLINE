-- ============================================================================
-- Đợt 2 (đã chốt ở mục 19.3 tài liệu đề xuất) + nâng cấp "Kho đề":
--
-- 1) KHO ĐỀ có phân cấp: mỗi đề thêm "Khối" (10/11/12, cột đơn giản) + có thể
--    thuộc NHIỀU "Chương" (bảng exam_topics, m:n với topics — TÁCH RIÊNG khỏi
--    questions.topic_id đã có ở migration_007, vì đó là chương của TỪNG CÂU,
--    còn đây là (các) chương mà CẢ ĐỀ bao phủ, giáo viên tự chọn lúc nhập đề).
--
-- 2) "Thư mục" (trước là cột text tự do ở migration_007) và "Chương trình"
--    (kỳ thi: GK1/CK1/GK2/CK2/Luyện đề tổng ôn...) đều là danh sách do giáo
--    viên tự quản lý (thêm/sửa tên), KHÔNG còn gõ tự do trực tiếp vào từng đề
--    nữa (tránh tạo nhiều thư mục na ná nhau do gõ sai chính tả) — gộp chung
--    vào 1 bảng exam_tags với cột `kind` phân biệt 'folder' (thư mục/tuyển
--    tập) và 'term' (chương trình/kỳ thi), vì 2 khái niệm này có cấu trúc y
--    hệt nhau (chỉ có tên + mô tả), tránh phải viết 2 bảng + 2 bộ API riêng.
--    Cột `exams.folder` (text) cũ được backfill sang exam_tags(kind='folder')
--    rồi đổi tên các đề đang tham chiếu, cuối cùng xoá cột text cũ.
--
-- 3) Nhật ký câu sai kiểu Leitner: sau khi nộp bài, câu làm sai/chưa trọn
--    điểm tự động vào "nhật ký" (wrong_answer_journal) của học sinh đó. Có
--    "buổi ôn tập" (review_sessions) riêng — mỗi lần học sinh mở màn hình ôn
--    tập là 1 buổi mới. Câu chỉ rút khỏi nhật ký (retired_at khác null) khi
--    làm đúng ĐỦ 3 buổi ôn tập RIÊNG BIỆT liên tiếp (không phải 3 lần trong
--    cùng 1 buổi) — logic đếm streak này nằm ở tầng code thuần (xem
--    src/lib/leitner.ts, có unit test), bảng ở đây chỉ lưu trạng thái đã tính
--    sẵn (correct_streak, last_reviewed_session_id, retired_at).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Khối cho từng đề + Chương mà cả đề bao phủ (m:n)
-- ---------------------------------------------------------------------------
alter table exams add column if not exists grade smallint check (grade in (10, 11, 12));

create table if not exists exam_topics (
  exam_id uuid not null references exams(id) on delete cascade,
  topic_id uuid not null references topics(id) on delete cascade,
  primary key (exam_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- 2) Thư mục/Chương trình dùng chung 1 bảng, phân biệt bằng `kind`
-- ---------------------------------------------------------------------------
create table if not exists exam_tags (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('folder', 'term')),
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (kind, name)
);

alter table exams add column if not exists folder_id uuid references exam_tags(id) on delete set null;
alter table exams add column if not exists term_id uuid references exam_tags(id) on delete set null;

-- Backfill: mỗi tên thư mục text khác nhau (đang có trong exams.folder) ->
-- 1 dòng exam_tags(kind='folder'), rồi trỏ folder_id tương ứng. An toàn chạy
-- nhiều lần (on conflict do nothing / update lại folder_id nếu null).
insert into exam_tags (kind, name)
select distinct 'folder', trim(folder)
from exams
where folder is not null and trim(folder) <> ''
on conflict (kind, name) do nothing;

update exams e
set folder_id = t.id
from exam_tags t
where t.kind = 'folder'
  and t.name = trim(e.folder)
  and e.folder is not null and trim(e.folder) <> ''
  and e.folder_id is null;

alter table exams drop column if exists folder;

-- ---------------------------------------------------------------------------
-- 3) Nhật ký câu sai + buổi ôn tập kiểu Leitner
-- ---------------------------------------------------------------------------
create table if not exists wrong_answer_journal (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  first_wrong_at timestamptz not null default now(),
  last_wrong_at timestamptz not null default now(),
  correct_streak smallint not null default 0,
  last_reviewed_session_id uuid,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, question_id)
);

create table if not exists review_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists review_session_answers (
  id bigint generated always as identity primary key,
  session_id uuid not null references review_sessions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  is_correct boolean not null,
  answered_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table exam_tags enable row level security;
alter table exam_topics enable row level security;
alter table wrong_answer_journal enable row level security;
alter table review_sessions enable row level security;
alter table review_session_answers enable row level security;

create policy "exam_tags_read_all" on exam_tags for select using (true);
create policy "exam_tags_write_teacher" on exam_tags for all using (is_teacher()) with check (is_teacher());

create policy "exam_topics_read_all" on exam_topics for select using (true);
create policy "exam_topics_write_teacher" on exam_topics for all using (is_teacher()) with check (is_teacher());

-- wrong_answer_journal: học sinh chỉ thấy/ghi nhật ký của chính mình, GV đọc được hết
-- (để dành cho dashboard giáo viên ở Đợt 3, mục 19.4 — chưa làm ở lần này)
create policy "wrong_journal_select" on wrong_answer_journal
  for select using (student_id = auth.uid() or is_teacher());
create policy "wrong_journal_insert" on wrong_answer_journal
  for insert with check (student_id = auth.uid());
create policy "wrong_journal_update" on wrong_answer_journal
  for update using (student_id = auth.uid());

create policy "review_sessions_select" on review_sessions
  for select using (student_id = auth.uid() or is_teacher());
create policy "review_sessions_insert" on review_sessions
  for insert with check (student_id = auth.uid());
create policy "review_sessions_update" on review_sessions
  for update using (student_id = auth.uid());

create policy "review_session_answers_select" on review_session_answers
  for select using (
    is_teacher() or exists (
      select 1 from review_sessions s
      where s.id = review_session_answers.session_id and s.student_id = auth.uid()
    )
  );
create policy "review_session_answers_insert" on review_session_answers
  for insert with check (
    exists (
      select 1 from review_sessions s
      where s.id = review_session_answers.session_id and s.student_id = auth.uid()
    )
  );
