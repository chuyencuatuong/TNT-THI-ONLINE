-- ============================================================================
-- Cập nhật thêm cho DB đã tạo trước đó (chạy schema.sql lần đầu rồi).
-- Chỉ cần chạy 1 LẦN file này trong Supabase Dashboard > SQL Editor > New query.
-- An toàn chạy lại nhiều lần (dùng if not exists / drop-then-create cho policy).
-- ============================================================================

-- 1. Đề thi: thêm thời lượng làm bài (phút). null = không giới hạn thời gian.
alter table exams add column if not exists duration_minutes int;

-- 2. Câu hỏi: đánh dấu câu hỏi nhập tay hay lấy từ file Word do AI trích xuất.
alter table questions add column if not exists source text not null default 'manual';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'questions_source_check'
  ) then
    alter table questions add constraint questions_source_check
      check (source in ('manual', 'word_import'));
  end if;
end $$;

-- 3. Bảng mới: log thời điểm học sinh bắt đầu/rời khỏi việc xem 1 câu hỏi,
--    dùng để tính chính xác thời gian tập trung vào từng câu (cộng dồn nhiều
--    lượt quay lại xem), phục vụ chẩn đoán học lực.
create table if not exists question_view_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  event_type text not null check (event_type in ('enter', 'leave')),
  created_at timestamptz not null default now()
);

alter table question_view_events enable row level security;

drop policy if exists "view_events_select" on question_view_events;
create policy "view_events_select" on question_view_events
  for select using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = question_view_events.attempt_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "view_events_insert" on question_view_events;
create policy "view_events_insert" on question_view_events
  for insert with check (
    exists (
      select 1 from exam_attempts a
      where a.id = question_view_events.attempt_id and a.student_id = auth.uid()
    )
  );
