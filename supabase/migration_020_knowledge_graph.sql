-- ============================================================================
-- Knowledge Graph & Candidate Root-Cause (Module 3) — 27/09/2026
--
-- Chạy 1 LẦN trong Supabase Dashboard > SQL Editor > New query, SAU
-- migration_019_error_intelligence_core.sql. An toàn chạy lại nhiều lần
-- (if not exists / drop policy if exists / on conflict do nothing).
--
-- Bảng skill_prerequisites: cạnh "Bài B là nền tảng cho Bài A" CHỈ giữa các
-- lessons (không có thực thể "Skill" riêng — đúng quyết định đã chốt). Đồ thị
-- cố tình thưa, hiển thị dạng cây phân nhánh.
-- ============================================================================

create table if not exists skill_prerequisites (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  prerequisite_lesson_id uuid not null references lessons(id) on delete cascade,
  weight numeric(3,2) not null default 0.5 check (weight between 0 and 1),
  -- 'curated'   : giáo viên xác nhận (hoặc gợi ý ban đầu bên dưới, giáo viên sửa/xoá được
  --               ở trang "Bản đồ kiến thức").
  -- 'ppct_order': Bài N phụ thuộc YẾU (0.3) vào Bài N-1 cùng Chương, suy tự động theo PPCT.
  source text not null default 'curated' check (source in ('curated', 'ppct_order')),
  created_at timestamptz not null default now(),
  check (lesson_id <> prerequisite_lesson_id),
  unique (lesson_id, prerequisite_lesson_id)
);

comment on table skill_prerequisites is
  'Cạnh tiên quyết giữa các lessons (Module 3). Chỉ dùng để đề xuất ỨNG VIÊN gốc
   rễ kèm bằng chứng (knowledgeGraph.ts) — không bao giờ khẳng định nguyên nhân.';

alter table skill_prerequisites enable row level security;

drop policy if exists "prereq_read_all" on skill_prerequisites;
create policy "prereq_read_all" on skill_prerequisites for select using (true);

drop policy if exists "prereq_write_teacher" on skill_prerequisites;
create policy "prereq_write_teacher" on skill_prerequisites for all
  using (is_teacher()) with check (is_teacher());

create index if not exists idx_prereq_lesson on skill_prerequisites (lesson_id);

-- ----------------------------------------------------------------------------
-- Gợi ý ban đầu cho CHƯƠNG THÍ ĐIỂM (Chương 1 Lớp 12) + nền Lớp 11.
-- Khớp theo (khối, thứ tự Chương, thứ tự Bài) theo PPCT đã seed ở
-- migration_016 — không khớp theo tên để tránh lệch dấu tiếng Việt.
--   12-1-1 Tính đơn điệu và cực trị      12-1-2 GTLN, GTNN
--   12-1-3 Đường tiệm cận                12-1-4 Khảo sát, vẽ đồ thị
--   12-1-5 Ứng dụng thực tiễn
--   11-9-1 Định nghĩa, ý nghĩa đạo hàm   11-9-2 Quy tắc tính đạo hàm
--   11-9-3 Đạo hàm cấp hai               11-5-2 Giới hạn của hàm số
-- ----------------------------------------------------------------------------
-- CHỈ seed khi bảng còn TRỐNG (lần chạy đầu tiên) — chạy lại migration sẽ
-- KHÔNG khôi phục các cạnh thầy đã xoá ở trang Bản đồ kiến thức.
do $$
begin
  if exists (select 1 from skill_prerequisites) then
    raise notice 'skill_prerequisites đã có dữ liệu — bỏ qua bước seed.';
    return;
  end if;

  insert into skill_prerequisites (lesson_id, prerequisite_lesson_id, weight, source)
  select l.id, p.id, v.weight, 'curated'
  from (values
      (12, 1, 1, 11, 9, 2, 0.80),
      (12, 1, 1, 11, 9, 1, 0.50),
      (12, 1, 1, 11, 9, 3, 0.40),
      (12, 1, 2, 12, 1, 1, 0.70),
      (12, 1, 2, 11, 9, 2, 0.60),
      (12, 1, 3, 11, 5, 2, 0.80),
      (12, 1, 4, 12, 1, 1, 0.80),
      (12, 1, 4, 12, 1, 3, 0.70),
      (12, 1, 5, 12, 1, 2, 0.80),
      (11, 9, 2, 11, 9, 1, 0.60),
      (11, 9, 3, 11, 9, 2, 0.70)
  ) as v(grade, topic_order, lesson_order, pre_grade, pre_topic_order, pre_lesson_order, weight)
  join topics t on t.grade = v.grade and t.order_index = v.topic_order
  join lessons l on l.topic_id = t.id and l.order_index = v.lesson_order
  join topics pt on pt.grade = v.pre_grade and pt.order_index = v.pre_topic_order
  join lessons p on p.topic_id = pt.id and p.order_index = v.pre_lesson_order
  on conflict (lesson_id, prerequisite_lesson_id) do nothing;

  -- Cạnh yếu theo thứ tự PPCT trong cùng Chương (bỏ qua "Bài tập cuối chương").
  insert into skill_prerequisites (lesson_id, prerequisite_lesson_id, weight, source)
  select l2.id, l1.id, 0.30, 'ppct_order'
  from lessons l1
  join lessons l2 on l2.topic_id = l1.topic_id and l2.order_index = l1.order_index + 1
  where l1.name not ilike 'Bài tập cuối chương%'
    and l2.name not ilike 'Bài tập cuối chương%'
  on conflict (lesson_id, prerequisite_lesson_id) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- Ghi chú thay đổi thiết kế (27/09/2026): Error DNA được TÍNH LẠI mỗi lần đọc
-- (errorIntelligence.ts buildErrorInstances) thay vì ghi lúc nộp bài — để nhãn
-- lỗi giáo viên xác nhận SAU khi học sinh đã thi vẫn áp dụng ngược cho bài cũ.
-- Bảng student_error_instances (migration_019) vì vậy không được dùng.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'student_error_instances') then
    comment on table student_error_instances is
      'KHÔNG DÙNG (27/09/2026): Error DNA tính on-demand từ question_responses +
       question_option_rationale (errorIntelligence.ts). Giữ bảng để không phá dữ liệu cũ.';
  end if;
end $$;
