-- ============================================================================
-- Quản lý lớp học, phân tầng học sinh, lịch học & điểm danh (28/08/2026).
-- Chạy 1 LẦN trong Supabase Dashboard > SQL Editor > New query. An toàn chạy
-- lại nhiều lần (mọi lệnh đều "if not exists"/"if exists").
--
-- Bối cảnh: trước migration này, hệ thống KHÔNG có khái niệm "lớp" nào hoạt
-- động được — cột profiles.student_class tồn tại từ schema gốc nhưng chưa
-- từng có giao diện nhập, không nơi nào dùng để lọc/nhóm học sinh. Dashboard
-- giáo viên gộp chung TẤT CẢ học sinh của 4 lớp thực tế vào 1 "cả lớp" vô
-- nghĩa. Xem đầy đủ bối cảnh + phương án đã duyệt ở tài liệu dự án
-- "de-xuat-quan-ly-lop-hoc-v1".
-- ============================================================================

-- 1. LỚP HỌC
-- --------------------------------------------------------------------------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,                          -- vd. "Lớp 12 – Ca tối"
  grade smallint check (grade in (10, 11, 12)), -- nullable: lớp ôn ghép nhiều khối
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table profiles add column if not exists class_id uuid references classes(id) on delete set null;
comment on column profiles.class_id is
  'Lớp học sinh thuộc về (migration_013) — thay thế hoàn toàn cột student_class cũ (đã xoá, chưa từng có giao diện nhập nên không có dữ liệu thật để mất).';

-- Cột student_class cũ (schema gốc) chưa từng được dùng ở đâu trong code
-- (không có form nhập, chỉ 1 chỗ hiển thị nếu tình cờ có giá trị) — xoá an
-- toàn, không có dữ liệu thật nào bị mất.
alter table profiles drop column if exists student_class;

-- 2. PHÂN TẦNG HỌC SINH (mục 2 trong đề xuất) — kết hợp: hệ thống tự tính
-- theo điểm trung bình (xem src/lib/studentTier.ts), GV ghi đè tay khi cần.
-- --------------------------------------------------------------------------
alter table profiles add column if not exists manual_tier text
  check (manual_tier is null or manual_tier in ('gioi', 'kha', 'tb', 'yeu'));
comment on column profiles.manual_tier is
  'Tầng GIÁO VIÊN ghi đè tay (null = dùng tầng hệ thống tự tính theo điểm TB, xem src/lib/studentTier.ts). Chỉ hiển thị phía giáo viên, không lộ ra giao diện học sinh.';

-- 3. LỊCH HỌC — tạo tay từng buổi (quyết định đã chốt: không dùng lịch cố
-- định hàng tuần tự sinh, vì lớp học thêm thực tế hay đổi giờ/nghỉ lễ/dạy
-- bù). Giao diện có công cụ "tạo nhiều buổi cùng lúc theo thứ lặp lại" để
-- tiện, nhưng vẫn ghi ra N bản ghi RIÊNG, sửa/xoá độc lập từng buổi được.
-- --------------------------------------------------------------------------
create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  -- Chuẩn bị hạ tầng cho việc đồng bộ Google Calendar SAU NÀY (Thầy Tường
  -- quyết định để đợt sau, 28/08/2026) — KHÔNG xây đồng bộ thật ở migration
  -- này, chỉ thêm sẵn 2 cột để việc nối API Google Calendar sau này không
  -- cần thêm migration mới: "buổi học này đến từ đâu" + "id sự kiện gốc bên
  -- nguồn đó" để tránh tạo trùng khi đồng bộ lại. Unique constraint bên dưới
  -- cho phép nhiều dòng cùng null (hành vi mặc định của Postgres) nên không
  -- ảnh hưởng gì tới các buổi tạo tay như hiện tại.
  external_source text,      -- vd. 'google_calendar' — null = tạo tay trong hệ thống (mặc định hiện tại)
  external_event_id text     -- id sự kiện bên nguồn ngoài, dùng để không đồng bộ trùng lặp
);
comment on column class_sessions.external_source is
  'Nguồn tạo ra buổi học này — null = giáo viên tạo tay (mặc định). Dự trù cho đồng bộ Google Calendar sau này, chưa có logic đồng bộ thật ở migration này.';
comment on column class_sessions.external_event_id is
  'Id sự kiện gốc bên nguồn ngoài (vd. Google Calendar event id) — dùng để lần đồng bộ sau nhận ra buổi đã tạo, tránh tạo trùng. Null với mọi buổi tạo tay.';

create unique index if not exists class_sessions_external_unique
  on class_sessions (external_source, external_event_id)
  where external_source is not null and external_event_id is not null;

create index if not exists class_sessions_class_id_idx on class_sessions (class_id);
create index if not exists class_sessions_starts_at_idx on class_sessions (starts_at);

-- 4. ĐIỂM DANH
-- --------------------------------------------------------------------------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('co_mat', 'tre', 'phep', 'vang')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id)
);
create index if not exists attendance_student_id_idx on attendance (student_id);

-- ============================================================================
-- ROW LEVEL SECURITY — cùng nguyên tắc với schema gốc: học sinh chỉ đọc dữ
-- liệu liên quan tới chính mình, giáo viên toàn quyền.
-- ============================================================================

alter table classes enable row level security;
alter table class_sessions enable row level security;
alter table attendance enable row level security;

-- classes: học sinh đọc được (để biết lớp mình thuộc, hiện tên lớp...), GV toàn quyền
drop policy if exists "classes_read_all" on classes;
create policy "classes_read_all" on classes for select using (true);
drop policy if exists "classes_write_teacher" on classes;
create policy "classes_write_teacher" on classes for all using (is_teacher()) with check (is_teacher());

-- class_sessions: học sinh chỉ đọc buổi học của LỚP MÌNH; GV toàn quyền mọi lớp
drop policy if exists "class_sessions_select" on class_sessions;
create policy "class_sessions_select" on class_sessions for select using (
  is_teacher() or class_id in (select class_id from profiles where id = auth.uid())
);
drop policy if exists "class_sessions_write_teacher" on class_sessions;
create policy "class_sessions_write_teacher" on class_sessions for all using (is_teacher()) with check (is_teacher());

-- attendance: học sinh chỉ đọc điểm danh của CHÍNH MÌNH (không tự điểm danh
-- được — chỉ giáo viên ghi); GV toàn quyền
drop policy if exists "attendance_select" on attendance;
create policy "attendance_select" on attendance for select using (
  is_teacher() or student_id = auth.uid()
);
drop policy if exists "attendance_write_teacher" on attendance;
create policy "attendance_write_teacher" on attendance for all using (is_teacher()) with check (is_teacher());
