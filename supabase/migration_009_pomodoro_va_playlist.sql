-- ============================================================================
-- (Vá 31/08/2026: thêm "drop policy if exists" trước mọi "create policy"
-- trong file này -- bản gốc thiếu, nên chạy lại file đã chạy trước đó sẽ báo
-- lỗi "policy ... already exists". Không đổi hành vi/ý nghĩa policy nào.)
--
-- Đợt 4 (đề xuất giao diện + tính năng "học mỗi ngày" cho học sinh):
--
-- 1) ĐỒNG HỒ TẬP TRUNG POMODORO kiểu "vườn cây": mỗi phiên tập trung hoàn
--    thành (không bấm huỷ giữa chừng) ghi 1 dòng vào pomodoro_sessions. Cấp
--    độ + số cây hôm nay/tháng này đều TÍNH TỪ các dòng này ở tầng code
--    thuần (xem src/lib/pomodoro.ts, có unit test) — bảng chỉ lưu sự kiện
--    thô, không lưu số đã tính sẵn, để không bao giờ bị lệch dữ liệu.
--
-- 2) GÓC ÂM NHẠC: mỗi học sinh lưu tối đa 3 playlist YouTube yêu thích
--    (student_playlists), vị trí 0/1/2 cố định để hiển thị đúng thứ tự đã
--    sắp trên giao diện. Chỉ lưu URL học sinh dán vào — KHÔNG gọi API
--    YouTube nào (khỏi cần API key), việc trích ID playlist để nhúng iframe
--    làm hoàn toàn ở tầng code (xem src/lib/youtube.ts).
-- ============================================================================

create table if not exists pomodoro_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  focus_minutes smallint not null default 25,
  completed_at timestamptz not null default now()
);

create index if not exists pomodoro_sessions_student_completed_idx
  on pomodoro_sessions (student_id, completed_at);

create table if not exists student_playlists (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  -- 0, 1, 2 -- đúng 3 chỗ cố định trên giao diện, không cho vượt quá
  position smallint not null check (position in (0, 1, 2)),
  label text not null,
  url text not null,
  created_at timestamptz not null default now(),
  unique (student_id, position)
);

-- ---------------------------------------------------------------------------
-- RLS: học sinh chỉ đọc/ghi dữ liệu của chính mình, giáo viên chỉ cần đọc
-- (dành cho việc mở rộng dashboard GV sau này, chưa dùng ở đợt này).
-- ---------------------------------------------------------------------------
alter table pomodoro_sessions enable row level security;
alter table student_playlists enable row level security;

drop policy if exists "pomodoro_sessions_select" on pomodoro_sessions;
create policy "pomodoro_sessions_select" on pomodoro_sessions
  for select using (student_id = auth.uid() or is_teacher());
drop policy if exists "pomodoro_sessions_insert" on pomodoro_sessions;
create policy "pomodoro_sessions_insert" on pomodoro_sessions
  for insert with check (student_id = auth.uid());

drop policy if exists "student_playlists_select" on student_playlists;
create policy "student_playlists_select" on student_playlists
  for select using (student_id = auth.uid() or is_teacher());
drop policy if exists "student_playlists_write" on student_playlists;
create policy "student_playlists_write" on student_playlists
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());
