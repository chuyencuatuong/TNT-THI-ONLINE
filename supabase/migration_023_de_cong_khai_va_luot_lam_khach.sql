-- ============================================================================
-- migration_023 — ĐỀ CÔNG KHAI + LƯỢT LÀM CỦA KHÁCH (không cần đăng ký trước)
-- (02/10/2026)
--
-- Chạy SAU migration_022 (bắt buộc: 022 đã khoá đáp án và chuyển chấm điểm
-- lên máy chủ — mở đề cho khách khi chưa chạy 022 là lộ toàn bộ đáp án).
--
-- Luồng: Facebook -> /thi/?de=<slug> -> bấm "Làm bài miễn phí" -> trình duyệt
-- đăng nhập ẨN DANH (Supabase Anonymous Sign-ins) -> tạo hồ sơ khách ->
-- làm bài -> nộp -> điền họ tên/trường/tỉnh/lớp (email tuỳ chọn) -> xem kết
-- quả. Khi khách tạo tài khoản, Supabase giữ nguyên user id nên mọi bài đã
-- làm tự thuộc về tài khoản mới, không phải chép dữ liệu.
--
-- TRƯỚC KHI DÙNG, trong Supabase Dashboard:
--   Authentication > Sign In / Providers > bật "Allow anonymous sign-ins".
--   Authentication > Rate Limits > nâng "anonymous sign-ins" (mặc định khoảng
--   30 lượt/giờ/IP — học sinh dùng 4G hay chung IP nên dễ chạm trần).
-- ============================================================================

create or replace function is_anonymous_user()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;


-- ---------------------------------------------------------------------------
-- ĐỀ CÔNG KHAI
-- ---------------------------------------------------------------------------
alter table exams add column if not exists is_public boolean not null default false;
alter table exams add column if not exists public_slug text;
alter table exams add column if not exists public_intro text;

create unique index if not exists exams_public_slug_key on exams(public_slug) where public_slug is not null;

alter table exams drop constraint if exists exams_public_slug_format;
alter table exams add constraint exams_public_slug_format check (
  public_slug is null
  or (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(public_slug) between 3 and 80)
);
alter table exams drop constraint if exists exams_public_needs_slug;
alter table exams add constraint exams_public_needs_slug check (not is_public or public_slug is not null);

comment on column exams.is_public is
  'true = ai có link /thi/?de=<public_slug> cũng làm được, không cần tài khoản (đăng nhập ẩn danh).';
comment on column exams.public_slug is
  'Phần cuối link công khai, chỉ chữ thường không dấu, số và gạch ngang. Ví dụ: giua-ky-1-toan-12.';
comment on column exams.public_intro is
  'Đoạn giới thiệu ngắn hiện ở trang landing của đề. Bỏ trống thì dùng description.';


-- ---------------------------------------------------------------------------
-- HỒ SƠ KHÁCH
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists is_guest boolean not null default false;
alter table profiles add column if not exists class_label text;
alter table profiles add column if not exists contact_email text;
alter table profiles add column if not exists consent_at timestamptz;
alter table profiles add column if not exists info_completed_at timestamptz;
alter table profiles add column if not exists signup_source text;

alter table profiles drop constraint if exists profiles_guest_field_lengths;
alter table profiles add constraint profiles_guest_field_lengths check (
  char_length(coalesce(class_label, '')) <= 40
  and char_length(coalesce(contact_email, '')) <= 200
  and char_length(coalesce(signup_source, '')) <= 60
);

comment on column profiles.is_guest is
  'true = tài khoản ẩn danh tạo từ link đề công khai (chưa đăng ký). Chuyển false khi khách tạo tài khoản bằng email.';
comment on column profiles.contact_email is
  'Email khách tự điền (không bắt buộc) ở bước nhập thông tin sau khi nộp — khác email đăng nhập.';

-- Hồ sơ tự tạo: luôn là học sinh; is_guest phải khớp với việc phiên đăng
-- nhập có ẩn danh hay không.
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (
    id = auth.uid()
    and role = 'student'
    and is_guest = is_anonymous_user()
  );

-- Mở rộng trigger của migration_022: ngoài khoá vai trò, còn khoá cờ khách
-- (chỉ được đổi true -> false, và chỉ khi phiên đã thôi ẩn danh).
create or replace function guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role_change_not_allowed';
  end if;
  if new.is_guest is distinct from old.is_guest then
    if new.is_guest or is_anonymous_user() or new.id <> auth.uid() then
      raise exception 'guest_flag_change_not_allowed';
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- KHÁCH CHỈ LÀM ĐƯỢC ĐỀ CÔNG KHAI
-- ---------------------------------------------------------------------------
alter table exam_attempts add column if not exists entry_source text;
alter table exam_attempts drop constraint if exists exam_attempts_entry_source_len;
alter table exam_attempts add constraint exam_attempts_entry_source_len check (char_length(coalesce(entry_source, '')) <= 60);
comment on column exam_attempts.entry_source is
  'Nguồn vào làm bài (vd "fb", "zalo", "chia-se") lấy từ tham số ?src= của link công khai — để đo kênh nào mang học sinh tới.';

create or replace function guard_guest_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_anonymous_user() and not exists (
    select 1 from exams where id = new.exam_id and is_public
  ) then
    raise exception 'exam_not_public';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_guest_attempt on exam_attempts;
create trigger trg_guard_guest_attempt
  before insert on exam_attempts
  for each row execute function guard_guest_attempt();


-- ---------------------------------------------------------------------------
-- THÔNG TIN ĐỀ CHO TRANG LANDING (đọc được khi chưa đăng nhập)
-- ---------------------------------------------------------------------------
create or replace function public_exam_json(e exams)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id,
    'slug', e.public_slug,
    'title', e.title,
    'intro', coalesce(nullif(e.public_intro, ''), e.description),
    'duration_minutes', e.duration_minutes,
    'grade', e.grade,
    'mode', e.mode,
    'assigned_unlock_at', e.assigned_unlock_at,
    'assigned_lock_at', e.assigned_lock_at,
    'part_counts', coalesce((
      select jsonb_object_agg(part::text, n)
      from (select part, count(*) as n from exam_questions where exam_id = e.id group by part) x
    ), '{}'::jsonb),
    'submitted_count', (
      select count(*) from exam_attempts a where a.exam_id = e.id and a.submitted_at is not null
    )
  );
$$;

create or replace function get_public_exam(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public_exam_json(e) from exams e where e.public_slug = p_slug and e.is_public;
$$;

create or replace function list_public_exams()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(public_exam_json(e) order by e.created_at desc), '[]'::jsonb)
  from exams e where e.is_public;
$$;

revoke all on function public_exam_json(exams) from public, anon, authenticated;
revoke all on function get_public_exam(text) from public;
grant execute on function get_public_exam(text) to anon, authenticated;
revoke all on function list_public_exams() from public;
grant execute on function list_public_exams() to anon, authenticated;
