-- ============================================================================
-- Error Intelligence — Đợt 1 (22/09/2026): nhãn lỗi cho phương án nhiễu +
-- bảng ghi Error DNA thật của học sinh. Pilot: Chương 1 "Ứng dụng đạo hàm để
-- khảo sát và vẽ đồ thị hàm số" (Lớp 12) -- xem đầy đủ bối cảnh & thiết kế
-- trong tài liệu dự án "Website thi Online" (Claude Project), file
-- kien-truc-learning-intelligence-platform-v2.md.
--
-- Chạy 1 LẦN trong Supabase Dashboard > SQL Editor > New query. An toàn chạy
-- lại nhiều lần (mọi lệnh đều "if not exists"/"drop policy if exists" trước
-- "create policy" -- đúng bài học đã rút ra từ lỗi migration_008/009, xem
-- giai-doan-1-hoan-thanh-v1.md).
--
-- CHƯA nối vào submitAttempt() ở đợt này (student_error_instances tạo bảng
-- trước, ghi dữ liệu thật ở Đợt 2) -- xem lộ trình 5 đợt trong tài liệu kiến
-- trúc v2.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Nhãn lỗi cho từng phương án nhiễu -- gắn 1 lần lúc giáo viên duyệt bản
--    nháp AI (suggestOptionRationale() trong ai.ts), KHÔNG suy luận lúc học
--    sinh làm bài.
-- ----------------------------------------------------------------------------
create table if not exists question_option_rationale (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  -- Phần 1: 'A'|'B'|'C'|'D'. Phần 2: 'a'|'b'|'c'|'d'. Phần 3: null (không áp dụng, xem mục 2.5 tài liệu kiến trúc).
  option_key text,
  is_correct boolean not null default false,
  error_type text not null check (error_type in ('procedural', 'conceptual', 'calculation', 'careless', 'n_a')),
  -- Nhãn NGẮN, tái sử dụng qua nhiều câu hỏi cùng bản chất lỗi (vd "Quên đổi cận")
  -- -- khác rationale_text (mô tả đầy đủ). Cột này là điều kiện để làm được
  -- Progress Story (đợt 5): đếm "lỗi X giảm từ N xuống M lần" theo đúng 1 pattern,
  -- không phải gộp theo error_type (quá rộng).
  pattern_label text,
  rationale_text text,
  ai_suggested boolean not null default false,
  verified_by_teacher boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, option_key)
);

comment on table question_option_rationale is
  'Nhãn lỗi cho phương án nhiễu, AI soạn nháp từ solution_latex (suggestOptionRationale
   trong ai.ts), giáo viên xác nhận (verified_by_teacher) trước khi dùng để chấm Error DNA
   thật (student_error_instances). Đúng pattern "AI gợi ý, giáo viên duyệt" đã dùng cho
   lesson_id/topic_id (migration_016/007). Đợt 1, pilot Chương 1 lớp 12.';

alter table question_option_rationale enable row level security;

drop policy if exists "rationale_read_all" on question_option_rationale;
create policy "rationale_read_all" on question_option_rationale
  for select using (true);

drop policy if exists "rationale_write_teacher" on question_option_rationale;
create policy "rationale_write_teacher" on question_option_rationale
  for all using (is_teacher()) with check (is_teacher());

create index if not exists idx_rationale_pattern_label
  on question_option_rationale (pattern_label)
  where pattern_label is not null;

create index if not exists idx_rationale_question_id
  on question_option_rationale (question_id);

-- ----------------------------------------------------------------------------
-- 2) Error DNA thật của học sinh -- ghi 1 lần lúc chấm bài (Đợt 2 sẽ nối vào
--    submitAttempt() trong api.ts; bảng tạo trước ở Đợt 1 để errorIntelligence.ts
--    có đủ kiểu dữ liệu viết/test ngay).
-- ----------------------------------------------------------------------------
create table if not exists student_error_instances (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  -- denormalized từ questions.lesson_id tại thời điểm chấm -- tránh join lại
  -- questions mỗi lần đọc trend/recurring pattern.
  lesson_id uuid references lessons(id) on delete set null,
  error_type text not null check (error_type in ('procedural', 'conceptual', 'calculation', 'careless', 'unclassified')),
  -- denormalized từ question_option_rationale.pattern_label, chỉ khi confidence='high'.
  pattern_label text,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  -- vd {"time_ratio":0.4,"mastery_at_time":"vung","chosen_option":"B"} -- xem
  -- ErrorClassificationInput trong errorIntelligence.ts.
  signals jsonb not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

comment on table student_error_instances is
  'Kết quả 1 LẦN của classifyError() (errorIntelligence.ts) cho mỗi câu sai --
   ghi lúc nộp bài, không tính lại on-demand (input không đổi sau khi đã nộp).
   Đợt 1: bảng tạo, chưa ghi dữ liệu. Đợt 2 nối submitAttempt().';

alter table student_error_instances enable row level security;

drop policy if exists "error_instances_select" on student_error_instances;
create policy "error_instances_select" on student_error_instances
  for select using (is_teacher() or student_id = auth.uid());

drop policy if exists "error_instances_write" on student_error_instances;
create policy "error_instances_write" on student_error_instances
  for all using (is_teacher() or student_id = auth.uid());

create index if not exists idx_error_instances_student_pattern
  on student_error_instances (student_id, pattern_label, created_at)
  where pattern_label is not null;

create index if not exists idx_error_instances_attempt_id
  on student_error_instances (attempt_id);
