-- ============================================================================
-- Schema cho website luyện tập & thi trực tuyến TNT
-- Chạy TOÀN BỘ file này 1 lần trong Supabase Dashboard > SQL Editor > New query
-- ============================================================================

-- 1. HỒ SƠ NGƯỜI DÙNG (mở rộng từ bảng auth.users có sẵn của Supabase)
-- --------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  full_name text not null,
  student_class text, -- lớp học, chỉ áp dụng cho role='student'
  created_at timestamptz not null default now()
);

-- 2. KHUNG KIẾN THỨC & DẠNG BÀI (giáo viên định nghĩa trước, AI chỉ gán nhãn theo đây)
-- --------------------------------------------------------------------------
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  name text not null,       -- ví dụ: "Phương trình mũ và logarit"
  chapter text,             -- ví dụ: "Chương 2 - Giải tích 12"
  grade smallint not null check (grade in (10, 11, 12)),
  created_at timestamptz not null default now()
);

create table if not exists question_types (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  name text not null,        -- ví dụ: "Đặt ẩn phụ giải phương trình mũ"
  description text,
  created_at timestamptz not null default now()
);

-- 3. NGÂN HÀNG CÂU HỎI
-- --------------------------------------------------------------------------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  part smallint not null check (part in (1, 2, 3)),
  question_type_id uuid references question_types(id) on delete set null,
  difficulty text check (difficulty in ('nhan_biet', 'thong_hieu', 'van_dung', 'van_dung_cao')),
  content_latex text not null,       -- nội dung câu hỏi, viết bằng LaTeX
  image_url text,                    -- hình vẽ/đồ thị nếu có
  -- Phần 1: {"choices": {"A": "...", "B": "...", "C": "...", "D": "..."}}
  -- Phần 2: {"items": {"a": "...", "b": "...", "c": "...", "d": "..."}}
  -- Phần 3: {} (không cần lựa chọn)
  options jsonb not null default '{}'::jsonb,
  -- Phần 1: {"choice": "A"}
  -- Phần 2: {"a": true, "b": false, "c": true, "d": false}
  -- Phần 3: {"value": "12.5"}
  correct_answer jsonb not null,
  default_points numeric(4,2), -- dùng cho Phần 3 (Phần 1/2 tính theo barem cố định)
  ai_suggested_type_id uuid references question_types(id), -- gợi ý của AI, chờ GV duyệt
  ai_suggestion_confirmed boolean not null default false,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- 4. ĐỀ THI
-- --------------------------------------------------------------------------
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists exam_questions (
  exam_id uuid not null references exams(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  order_index smallint not null,
  part smallint not null check (part in (1, 2, 3)),
  primary key (exam_id, question_id)
);

-- 5. LƯỢT LÀM BÀI
-- --------------------------------------------------------------------------
create table if not exists exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  attempt_number smallint not null default 1, -- lần 1, 2, 3... của HS với đề này
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (exam_id, student_id, attempt_number)
);

-- Log từng lần chọn/đổi đáp án -> dùng để tính thời gian & lịch sử thay đổi
create table if not exists answer_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  event_type text not null check (event_type in ('select', 'change', 'clear')),
  answer_value jsonb,
  created_at timestamptz not null default now()
);

-- Đáp án cuối cùng + điểm từng câu (được tính sau khi nộp bài)
create table if not exists question_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  final_answer jsonb,
  score numeric(4,2) not null default 0,
  sub_correct_count smallint, -- chỉ dùng cho Phần 2 (0-4 ý đúng)
  time_spent_seconds int not null default 0,
  change_count int not null default 0, -- số lần đổi đáp án
  first_response_at timestamptz,
  last_response_at timestamptz,
  unique (attempt_id, question_id)
);

create table if not exists attempt_scores (
  attempt_id uuid primary key references exam_attempts(id) on delete cascade,
  part1_score numeric(4,2) not null default 0,
  part2_score numeric(4,2) not null default 0,
  part3_score numeric(4,2) not null default 0,
  total_score numeric(4,2) not null default 0,
  computed_at timestamptz not null default now()
);

-- 6. BÁO CÁO ĐỊNH KỲ (xem qua link riêng, phụ huynh không cần tài khoản)
-- --------------------------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary_text text,        -- nhận xét do AI tổng hợp, GV có thể sửa lại
  chart_data jsonb,          -- dữ liệu biểu đồ đã tính sẵn để hiển thị nhanh
  share_token uuid not null default gen_random_uuid() unique, -- dùng trong link cho phụ huynh
  generated_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY: học sinh chỉ thấy dữ liệu của chính mình,
-- giáo viên (role='teacher') thấy toàn bộ, phụ huynh xem qua share_token riêng
-- (report công khai theo token, không cần đăng nhập, xử lý qua Supabase RPC/view).
-- ============================================================================

alter table profiles enable row level security;
alter table topics enable row level security;
alter table question_types enable row level security;
alter table questions enable row level security;
alter table exams enable row level security;
alter table exam_questions enable row level security;
alter table exam_attempts enable row level security;
alter table answer_events enable row level security;
alter table question_responses enable row level security;
alter table attempt_scores enable row level security;
alter table reports enable row level security;

-- Hàm helper: kiểm tra người dùng hiện tại có phải giáo viên không
create or replace function is_teacher()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'teacher'
  );
$$;

-- profiles: ai cũng xem được hồ sơ chính mình; GV xem được tất cả
create policy "profiles_select_own_or_teacher" on profiles
  for select using (id = auth.uid() or is_teacher());
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid());
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid());

-- topics, question_types, questions, exams, exam_questions:
-- học sinh CHỈ ĐỌC (để làm bài), giáo viên toàn quyền
create policy "topics_read_all" on topics for select using (true);
create policy "topics_write_teacher" on topics for all using (is_teacher()) with check (is_teacher());

create policy "qtypes_read_all" on question_types for select using (true);
create policy "qtypes_write_teacher" on question_types for all using (is_teacher()) with check (is_teacher());

create policy "questions_read_all" on questions for select using (true);
create policy "questions_write_teacher" on questions for all using (is_teacher()) with check (is_teacher());

create policy "exams_read_all" on exams for select using (true);
create policy "exams_write_teacher" on exams for all using (is_teacher()) with check (is_teacher());

create policy "exam_questions_read_all" on exam_questions for select using (true);
create policy "exam_questions_write_teacher" on exam_questions for all using (is_teacher()) with check (is_teacher());

-- exam_attempts: học sinh chỉ thấy/tạo lượt làm bài của chính mình; GV thấy tất cả
create policy "attempts_select_own_or_teacher" on exam_attempts
  for select using (student_id = auth.uid() or is_teacher());
create policy "attempts_insert_own" on exam_attempts
  for insert with check (student_id = auth.uid());
create policy "attempts_update_own" on exam_attempts
  for update using (student_id = auth.uid() or is_teacher());

-- answer_events: chỉ chủ lượt làm bài được ghi/đọc, GV đọc được hết
create policy "answer_events_select" on answer_events
  for select using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = answer_events.attempt_id and a.student_id = auth.uid()
    )
  );
create policy "answer_events_insert" on answer_events
  for insert with check (
    exists (
      select 1 from exam_attempts a
      where a.id = answer_events.attempt_id and a.student_id = auth.uid()
    )
  );

-- question_responses, attempt_scores: tương tự answer_events
create policy "responses_select" on question_responses
  for select using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = question_responses.attempt_id and a.student_id = auth.uid()
    )
  );
create policy "responses_write" on question_responses
  for all using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = question_responses.attempt_id and a.student_id = auth.uid()
    )
  );

create policy "scores_select" on attempt_scores
  for select using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = attempt_scores.attempt_id and a.student_id = auth.uid()
    )
  );
create policy "scores_write_teacher_or_system" on attempt_scores
  for all using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = attempt_scores.attempt_id and a.student_id = auth.uid()
    )
  );

-- reports: học sinh xem báo cáo của mình, GV xem/tạo tất cả.
-- Phụ huynh xem qua share_token bằng 1 RPC riêng (định nghĩa bên dưới), KHÔNG
-- select trực tiếp bảng reports khi chưa đăng nhập.
create policy "reports_select_own_or_teacher" on reports
  for select using (student_id = auth.uid() or is_teacher());
create policy "reports_write_teacher" on reports
  for all using (is_teacher()) with check (is_teacher());

-- RPC công khai cho phụ huynh xem báo cáo qua link riêng (không cần đăng nhập).
-- Chỉ trả về đúng 1 báo cáo khớp token, không lộ dữ liệu học sinh khác.
create or replace function get_report_by_token(token uuid)
returns table (
  student_name text,
  period_start date,
  period_end date,
  summary_text text,
  chart_data jsonb,
  generated_at timestamptz
)
language sql
security definer
stable
as $$
  select p.full_name, r.period_start, r.period_end, r.summary_text, r.chart_data, r.generated_at
  from reports r
  join profiles p on p.id = r.student_id
  where r.share_token = token;
$$;

-- Cho phép gọi RPC này mà không cần đăng nhập
grant execute on function get_report_by_token(uuid) to anon;
