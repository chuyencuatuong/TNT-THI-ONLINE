-- ============================================================================
-- Cập nhật thêm: tăng giám sát khi học sinh làm bài (giảm việc thoát trang để
-- tra cứu). Chỉ cần chạy 1 LẦN file này trong Supabase Dashboard > SQL Editor
-- > New query. An toàn chạy lại nhiều lần.
--
-- Lưu ý quan trọng (đọc trước khi dùng): đây là công cụ GHI NHẬN hành vi khả
-- nghi (chuyển tab, thoát toàn màn hình) + CHẶN được việc sao chép/dán trong
-- lúc làm bài — không phải khoá máy học sinh. Một trang web thường (không
-- phải phần mềm thi cử chuyên dụng) không thể ngăn học sinh dùng điện thoại
-- khác hoặc mở cửa sổ trình duyệt khác hoàn toàn để tra cứu. Coi đây là công
-- cụ giảm bớt gian lận dễ dàng + cho giáo viên biết ai có dấu hiệu khả nghi
-- để hỏi lại, không phải bằng chứng chắc chắn 100%.
-- ============================================================================

create table if not exists proctoring_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  event_type text not null check (
    event_type in (
      'tab_hidden',      -- chuyển sang tab/ứng dụng khác (đổi trang, thu nhỏ...)
      'tab_visible',      -- quay lại tab làm bài
      'window_blur',       -- cửa sổ mất tiêu điểm (có thể do đổi sang cửa sổ khác)
      'window_focus',
      'fullscreen_exit',   -- thoát chế độ toàn màn hình giữa chừng
      'copy_attempt',      -- cố sao chép nội dung đề (đã bị chặn không cho copy)
      'paste_attempt'      -- cố dán nội dung vào bài làm (đã bị chặn)
    )
  ),
  created_at timestamptz not null default now()
);

alter table proctoring_events enable row level security;

drop policy if exists "proctoring_events_select" on proctoring_events;
create policy "proctoring_events_select" on proctoring_events
  for select using (
    is_teacher() or exists (
      select 1 from exam_attempts a
      where a.id = proctoring_events.attempt_id and a.student_id = auth.uid()
    )
  );

drop policy if exists "proctoring_events_insert" on proctoring_events;
create policy "proctoring_events_insert" on proctoring_events
  for insert with check (
    exists (
      select 1 from exam_attempts a
      where a.id = proctoring_events.attempt_id and a.student_id = auth.uid()
    )
  );
