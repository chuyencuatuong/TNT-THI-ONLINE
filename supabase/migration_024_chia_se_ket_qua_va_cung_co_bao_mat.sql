-- ============================================================================
-- migration_024 — CHIA SẺ KẾT QUẢ, ĐO LAN TRUYỀN, DỌN KHÁCH BỎ DỞ,
--                  CỦNG CỐ BẢO MẬT (02/10/2026)
--
-- Chạy SAU migration_022 và migration_023.
--
-- 1. Học sinh tạo link chia sẻ kết quả của một đề công khai:
--    /thi/?de=<slug>&ref=<token>&src=chia-se. Người nhận thấy lời mời "Bạn X
--    vừa làm đề này" (tên gọi + điểm nếu học sinh cho hiện), rồi làm thử.
--    Không lộ họ đầy đủ, trường, lớp, đáp án.
-- 2. Lượt làm bắt đầu từ link chia sẻ ghi lại token (exam_attempts.ref_share)
--    để thầy đo một lượt chia sẻ kéo về bao nhiêu lượt làm.
-- 3. Hàm dọn tài khoản ẩn danh bỏ dở (tạo > 30 ngày, chưa nộp bài nào) + lịch
--    chạy hằng đêm nếu đã bật pg_cron.
-- 4. Bảo mật:
--    - Khách (ẩn danh) và người chưa đăng nhập chỉ thấy đề công khai hoặc đề
--      chính mình đã làm; không còn liệt kê được toàn bộ đề, lớp, nhãn đề.
--    - Giới hạn độ dài các trường hồ sơ tự sửa được.
--    - Khách tối đa 3 lượt / đề và 20 lượt tổng.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. LINK CHIA SẺ KẾT QUẢ
-- ---------------------------------------------------------------------------
create table if not exists attempt_shares (
  token uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  show_score boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table attempt_shares is
  'Link chia sẻ kết quả đề công khai. Chỉ tạo/thu hồi qua RPC create_attempt_share / revoke_attempt_share; người ngoài đọc tóm lược qua get_shared_result.';

-- Mỗi lượt làm chỉ có 1 link đang hoạt động.
create unique index if not exists attempt_shares_active_key
  on attempt_shares(attempt_id) where revoked_at is null;
create index if not exists idx_attempt_shares_created_by on attempt_shares(created_by);

alter table attempt_shares enable row level security;

drop policy if exists "attempt_shares_read" on attempt_shares;
create policy "attempt_shares_read" on attempt_shares
  for select using (created_by = auth.uid() or is_teacher());
-- Không có policy insert/update/delete: chỉ ghi qua RPC bên dưới.

-- Tên gọi (chữ cuối của họ tên) — "Trần Thị Bích Ngọc" -> "Ngọc".
create or replace function tnt_given_name(p_full_name text)
returns text
language sql
immutable
as $$
  select case
    when p_full_name is null or btrim(p_full_name) = '' or btrim(p_full_name) = 'Khách' then 'Một bạn'
    else regexp_replace(btrim(p_full_name), '^.*\s', '')
  end;
$$;

create or replace function create_attempt_share(p_attempt_id uuid, p_show_score boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not exists (
    select 1
    from exam_attempts a
    join exams e on e.id = a.exam_id
    where a.id = p_attempt_id
      and a.student_id = auth.uid()
      and a.submitted_at is not null
      and e.is_public
      and e.public_slug is not null
  ) then
    raise exception 'share_not_allowed';
  end if;

  select token into v_token
  from attempt_shares
  where attempt_id = p_attempt_id and revoked_at is null;

  if v_token is not null then
    update attempt_shares set show_score = coalesce(p_show_score, true) where token = v_token;
    return v_token;
  end if;

  insert into attempt_shares (attempt_id, created_by, show_score)
  values (p_attempt_id, auth.uid(), coalesce(p_show_score, true))
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function revoke_attempt_share(p_attempt_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update attempt_shares
  set revoked_at = now()
  where attempt_id = p_attempt_id
    and created_by = auth.uid()
    and revoked_at is null;
$$;

-- Tóm lược công khai của 1 link chia sẻ. Trả null nếu link đã thu hồi hoặc đề
-- không còn công khai.
create or replace function get_shared_result(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'slug', e.public_slug,
    'exam_title', e.title,
    'given_name', tnt_given_name(p.full_name),
    'show_score', s.show_score and not coalesce(a.invalidated, false),
    'total_score', case when s.show_score and not coalesce(a.invalidated, false) then sc.total_score end,
    'submitted_on', (a.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date
  )
  from attempt_shares s
  join exam_attempts a on a.id = s.attempt_id
  join exams e on e.id = a.exam_id
  join profiles p on p.id = a.student_id
  left join attempt_scores sc on sc.attempt_id = a.id
  where s.token = p_token
    and s.revoked_at is null
    and e.is_public;
$$;

revoke all on function create_attempt_share(uuid, boolean) from public, anon;
grant execute on function create_attempt_share(uuid, boolean) to authenticated;
revoke all on function revoke_attempt_share(uuid) from public, anon;
grant execute on function revoke_attempt_share(uuid) to authenticated;
revoke all on function get_shared_result(uuid) from public;
grant execute on function get_shared_result(uuid) to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. ĐO LAN TRUYỀN: lượt làm bắt đầu từ link chia sẻ
-- ---------------------------------------------------------------------------
alter table exam_attempts add column if not exists ref_share uuid references attempt_shares(token) on delete set null;
create index if not exists idx_exam_attempts_ref_share on exam_attempts(ref_share) where ref_share is not null;
comment on column exam_attempts.ref_share is
  'Token link chia sẻ đã dẫn học sinh tới làm đề này (?ref= trên link). Máy chủ tự bỏ nếu token không khớp đề hoặc là link của chính mình.';

-- Ghép vào trigger chuẩn hoá lượt làm mới của migration_022.
create or replace function normalize_new_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_teacher() then
    new.started_at := now();
    new.submitted_at := null;
    new.invalidated := false;
    new.invalidated_reason := null;
  end if;
  if new.ref_share is not null and not exists (
    select 1
    from attempt_shares s
    join exam_attempts src on src.id = s.attempt_id
    where s.token = new.ref_share
      and s.revoked_at is null
      and src.exam_id = new.exam_id
      and s.created_by <> new.student_id
  ) then
    new.ref_share := null;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. DỌN TÀI KHOẢN ẨN DANH BỎ DỞ
-- ---------------------------------------------------------------------------
-- Xoá user ẩn danh tạo quá p_days ngày mà CHƯA nộp bài nào (bấm "Làm bài" rồi
-- bỏ). Khách đã nộp bài được giữ lại vì đó là dữ liệu học tập thật.
-- Xoá ở auth.users kéo theo profiles -> exam_attempts -> sự kiện (on delete cascade).
create or replace function cleanup_abandoned_guests(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select u.id
    from auth.users u
    where coalesce(u.is_anonymous, false)
      and u.created_at < now() - make_interval(days => greatest(p_days, 7))
      and not exists (
        select 1 from public.exam_attempts a
        where a.student_id = u.id and a.submitted_at is not null
      )
  loop
    begin
      delete from auth.users where id = r.id;
      n := n + 1;
    exception when others then
      raise notice 'Bỏ qua %: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function cleanup_abandoned_guests(int) from public, anon, authenticated;

-- Lịch chạy 02:23 sáng giờ Việt Nam (19:23 UTC). Cần bật pg_cron trước:
-- Database > Extensions > pg_cron. Chưa bật thì bỏ qua, chạy lại file sau.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tnt-don-khach-bo-do', '23 19 * * *', 'select public.cleanup_abandoned_guests(30)');
  else
    raise notice 'Chưa bật pg_cron: hàm cleanup_abandoned_guests đã tạo nhưng chưa có lịch chạy.';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. CỦNG CỐ BẢO MẬT
-- ---------------------------------------------------------------------------

-- Ai được thấy 1 đề: giáo viên; tài khoản thật (đã đăng ký) — để dùng Kho đề;
-- đề công khai; hoặc đề chính mình đã có lượt làm (khách xem lại kết quả kể cả
-- khi thầy đã tắt công khai).
create or replace function can_read_exam(p_exam_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_teacher()
    or (auth.uid() is not null and not is_anonymous_user())
    or exists (select 1 from exams e where e.id = p_exam_id and e.is_public)
    or (auth.uid() is not null and exists (
          select 1 from exam_attempts a where a.exam_id = p_exam_id and a.student_id = auth.uid()
        ));
$$;
revoke all on function can_read_exam(uuid) from public;
grant execute on function can_read_exam(uuid) to anon, authenticated;

-- Tài khoản thật (không ẩn danh) đã đăng nhập.
create or replace function is_registered_user()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and not is_anonymous_user();
$$;

drop policy if exists "exams_read_all" on exams;
drop policy if exists "exams_read" on exams;
create policy "exams_read" on exams for select using (can_read_exam(id));

drop policy if exists "exam_questions_read_all" on exam_questions;
drop policy if exists "exam_questions_read" on exam_questions;
create policy "exam_questions_read" on exam_questions for select using (can_read_exam(exam_id));

drop policy if exists "classes_read_all" on classes;
drop policy if exists "classes_read" on classes;
create policy "classes_read" on classes for select using (is_registered_user());

drop policy if exists "exam_tags_read_all" on exam_tags;
drop policy if exists "exam_tags_read" on exam_tags;
create policy "exam_tags_read" on exam_tags for select using (is_registered_user());

drop policy if exists "exam_topics_read_all" on exam_topics;
drop policy if exists "exam_topics_read" on exam_topics;
create policy "exam_topics_read" on exam_topics for select using (is_registered_user());

-- Độ dài các trường hồ sơ học sinh tự sửa được (chặn nhồi dữ liệu rác).
-- NOT VALID: chỉ kiểm tra dữ liệu ghi mới, không chặn dữ liệu cũ.
alter table profiles drop constraint if exists profiles_text_lengths;
alter table profiles add constraint profiles_text_lengths check (
  char_length(full_name) between 1 and 120
  and char_length(coalesce(school_name, '')) <= 160
  and char_length(coalesce(province, '')) <= 60
) not valid;

-- Khách: tối đa 3 lượt / đề, 20 lượt tổng (chặn bơm số liệu đề công khai).
create or replace function guard_guest_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_anonymous_user() then
    if not exists (select 1 from exams where id = new.exam_id and is_public) then
      raise exception 'exam_not_public';
    end if;
    if (select count(*) from exam_attempts where student_id = new.student_id and exam_id = new.exam_id) >= 3
       or (select count(*) from exam_attempts where student_id = new.student_id) >= 20 then
      raise exception 'guest_attempt_limit';
    end if;
  end if;
  return new;
end;
$$;
