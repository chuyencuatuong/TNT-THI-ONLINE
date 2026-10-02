-- ============================================================================
-- migration_022 — VÁ BẢO MẬT TRƯỚC KHI MỞ ĐỀ CÔNG KHAI + CHẤM ĐIỂM Ở MÁY CHỦ
-- (02/10/2026)
--
-- Chạy SAU migration_021. Chạy được nhiều lần (idempotent).
--
-- Vá 4 lỗ hổng đã phát hiện khi chuẩn bị luồng "thi khách từ Facebook":
--  (1) Ai cũng tự tạo / tự đổi tài khoản thành giáo viên (policy profiles
--      không giới hạn cột role).
--  (2) Bảng questions đọc tự do (kể cả chưa đăng nhập) -> lộ correct_answer
--      và solution_latex của TOÀN BỘ ngân hàng câu hỏi.
--  (3) question_option_rationale đọc tự do -> lộ gián tiếp đáp án.
--  (4) Điểm do trình duyệt tự chấm rồi tự ghi attempt_scores /
--      question_responses -> học sinh sửa được điểm của mình, làm sai phân
--      bố điểm (phân vị) của mọi người.
--
-- Sau migration này:
--  - Học sinh CHỈ đọc được câu hỏi (kèm đáp án, lời giải, lý giải phương án)
--    khi đã NỘP một đề chứa câu đó. Giáo viên đọc được tất cả như cũ.
--  - Lúc đang làm bài, đề được lấy qua RPC get_exam_paper() — KHÔNG có đáp
--    án, lời giải.
--  - Chấm điểm bằng RPC submit_attempt() chạy trên máy chủ, cùng luật với
--    src/lib/scoring.ts (đã kiểm thử đối chiếu tự động, xem
--    supabase/kiem-thu/parity.mts). Học sinh không còn quyền ghi trực
--    tiếp vào attempt_scores / question_responses / exam_attempts.
--  - Giáo viên sửa điểm (regradeAttempt) giữ nguyên như cũ.
--
-- LƯU Ý KHI ĐỔI LUẬT CHẤM: luật chấm giờ nằm ở 2 nơi — src/lib/scoring.ts
-- (giáo viên chấm lại, xem trước điểm) và hàm tnt_score_question() dưới đây
-- (chấm lúc học sinh nộp). Sửa barem thì PHẢI sửa cả hai, rồi chạy lại test
-- đối chiếu.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- (1) KHOÁ VAI TRÒ GIÁO VIÊN
-- ---------------------------------------------------------------------------
-- Tự đăng ký chỉ được tạo hồ sơ HỌC SINH. Muốn thêm giáo viên: chạy trong SQL
-- Editor (auth.uid() = null ở đó nên trigger bên dưới cho phép):
--   update profiles set role = 'teacher' where id = '<uuid tài khoản>';
drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own" on profiles
  for insert with check (id = auth.uid() and role = 'student');

create or replace function guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role không có auth.uid() -> được đổi vai trò.
  if auth.uid() is null then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role_change_not_allowed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  before update on profiles
  for each row execute function guard_profile_role();


-- ---------------------------------------------------------------------------
-- (2)(3) CHỈ ĐỌC ĐƯỢC ĐÁP ÁN SAU KHI ĐÃ NỘP
-- ---------------------------------------------------------------------------
create index if not exists idx_exam_questions_question on exam_questions(question_id);
create index if not exists idx_exam_attempts_student_exam on exam_attempts(student_id, exam_id);

-- security definer để tránh vòng lặp RLS giữa questions <-> exam_attempts.
create or replace function can_see_question_key(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from exam_questions eq
    join exam_attempts a on a.exam_id = eq.exam_id
    where eq.question_id = p_question_id
      and a.student_id = auth.uid()
      and a.submitted_at is not null
  );
$$;

drop policy if exists "questions_read_all" on questions;
drop policy if exists "questions_read_teacher_or_submitted" on questions;
create policy "questions_read_teacher_or_submitted" on questions
  for select using ((select is_teacher()) or can_see_question_key(id));

drop policy if exists "rationale_read_all" on question_option_rationale;
drop policy if exists "rationale_read_teacher_or_submitted" on question_option_rationale;
create policy "rationale_read_teacher_or_submitted" on question_option_rationale
  for select using ((select is_teacher()) or can_see_question_key(question_id));


-- ---------------------------------------------------------------------------
-- (4) HỌC SINH KHÔNG CÒN GHI ĐIỂM TRỰC TIẾP
-- ---------------------------------------------------------------------------
drop policy if exists "responses_write" on question_responses;
drop policy if exists "responses_write_teacher" on question_responses;
create policy "responses_write_teacher" on question_responses
  for all using (is_teacher()) with check (is_teacher());

drop policy if exists "scores_write_teacher_or_system" on attempt_scores;
drop policy if exists "scores_write_teacher" on attempt_scores;
create policy "scores_write_teacher" on attempt_scores
  for all using (is_teacher()) with check (is_teacher());

-- Đánh dấu đã nộp / huỷ bài chỉ đi qua submit_attempt() (hoặc giáo viên).
drop policy if exists "attempts_update_own" on exam_attempts;
drop policy if exists "attempts_update_teacher" on exam_attempts;
create policy "attempts_update_teacher" on exam_attempts
  for update using (is_teacher()) with check (is_teacher());

-- Nhật ký câu sai: submit_attempt() tự ghi; học sinh vẫn CẬP NHẬT được dòng
-- của mình khi ôn tập (wrong_journal_update giữ nguyên) nhưng không tự chèn
-- câu bất kỳ vào nhật ký nữa.
drop policy if exists "wrong_journal_insert" on wrong_answer_journal;
create policy "wrong_journal_insert" on wrong_answer_journal
  for insert with check (is_teacher());

-- Lượt làm mới do học sinh tạo: máy chủ tự đặt giờ bắt đầu, không cho tạo
-- sẵn lượt "đã nộp" hay lùi giờ bắt đầu.
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
  return new;
end;
$$;

drop trigger if exists trg_normalize_new_attempt on exam_attempts;
create trigger trg_normalize_new_attempt
  before insert on exam_attempts
  for each row execute function normalize_new_attempt();

-- Sự kiện làm bài: chỉ ghi được khi lượt CHƯA nộp, và giờ ghi do máy chủ đặt.
drop policy if exists "answer_events_insert" on answer_events;
create policy "answer_events_insert" on answer_events
  for insert with check (
    exists (
      select 1 from exam_attempts a
      where a.id = answer_events.attempt_id
        and a.student_id = auth.uid()
        and a.submitted_at is null
    )
  );

drop policy if exists "view_events_insert" on question_view_events;
create policy "view_events_insert" on question_view_events
  for insert with check (
    exists (
      select 1 from exam_attempts a
      where a.id = question_view_events.attempt_id
        and a.student_id = auth.uid()
        and a.submitted_at is null
    )
  );

create or replace function force_event_created_at()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists trg_answer_events_created_at on answer_events;
create trigger trg_answer_events_created_at
  before insert on answer_events
  for each row execute function force_event_created_at();

drop trigger if exists trg_view_events_created_at on question_view_events;
create trigger trg_view_events_created_at
  before insert on question_view_events
  for each row execute function force_event_created_at();


-- ---------------------------------------------------------------------------
-- ĐỀ ĐỂ LÀM BÀI (KHÔNG CÓ ĐÁP ÁN)
-- ---------------------------------------------------------------------------
-- Trả về đúng hình dạng mà getExamQuestions() trả trước đây (exam_questions +
-- question lồng bên trong) nhưng question CHỈ có các trường cần để hiển thị.
-- correct_answer, solution_latex luôn là null. Chỉ người đã bắt đầu 1 lượt
-- làm đề này (hoặc giáo viên) mới lấy được.
create or replace function get_exam_paper(p_exam_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if not is_teacher() and not exists (
    select 1 from exam_attempts where exam_id = p_exam_id and student_id = v_uid
  ) then
    raise exception 'no_attempt';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'exam_id', eq.exam_id,
        'question_id', eq.question_id,
        'order_index', eq.order_index,
        'part', eq.part,
        'question', jsonb_build_object(
          'id', q.id,
          'part', q.part,
          'content_latex', q.content_latex,
          'image_url', q.image_url,
          'options', q.options,
          'default_points', q.default_points,
          'correct_answer', null,
          'solution_latex', null
        )
      )
      order by eq.part, eq.order_index
    )
    from exam_questions eq
    join questions q on q.id = eq.question_id
    where eq.exam_id = p_exam_id
  ), '[]'::jsonb);
end;
$$;


-- ---------------------------------------------------------------------------
-- LUẬT CHẤM (bản SQL của src/lib/scoring.ts)
-- ---------------------------------------------------------------------------

-- Number(str) của JavaScript. Trả về null thay cho NaN.
create or replace function tnt_js_number(p text)
returns double precision
language plpgsql
immutable
as $$
declare
  s text := p;
  base int;
  digits text;
  ch text;
  d int;
  acc double precision := 0;
  i int;
begin
  if s is null then
    return null;
  end if;
  if s = '' then
    return 0;
  end if;
  -- 0x.. / 0o.. / 0b.. (JS không cho dấu +/- ở dạng này)
  if s ~* '^0[xob]' then
    base := case lower(substr(s, 2, 1)) when 'x' then 16 when 'o' then 8 else 2 end;
    digits := lower(substr(s, 3));
    if digits = '' then
      return null;
    end if;
    for i in 1..length(digits) loop
      ch := substr(digits, i, 1);
      d := strpos('0123456789abcdef', ch) - 1;
      if d < 0 or d >= base then
        return null;
      end if;
      acc := acc * base + d;
    end loop;
    return acc;
  end if;
  if s ~ '^[+-]?Infinity$' then
    return case when left(s, 1) = '-' then '-Infinity'::double precision else 'Infinity'::double precision end;
  end if;
  if s !~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$' then
    return null;
  end if;
  begin
    return s::double precision;
  exception when others then
    -- Ngoài miền double: JS cho ra ±Infinity (số mũ dương) hoặc 0 (số mũ âm).
    if s ~ '[eE]-' or s ~ '^[+-]?0*\.' then
      return 0;
    end if;
    return case when left(s, 1) = '-' then '-Infinity'::double precision else 'Infinity'::double precision end;
  end;
end;
$$;

-- Giá trị "falsy" của JS: null, false, 0, "".
create or replace function tnt_js_falsy(v jsonb)
returns boolean
language sql
immutable
as $$
  select v is null
    or jsonb_typeof(v) = 'null'
    or v = 'false'::jsonb
    or v = '""'::jsonb
    or (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = 0);
$$;

-- a === b của JS cho giá trị lấy từ JSON: chỉ bằng nhau khi cùng kiểu
-- nguyên thuỷ và cùng giá trị (object/array không bao giờ === nhau).
create or replace function tnt_js_strict_eq(a jsonb, b jsonb)
returns boolean
language sql
immutable
as $$
  select a is not null and b is not null
    and jsonb_typeof(a) = jsonb_typeof(b)
    and jsonb_typeof(a) in ('string', 'number', 'boolean', 'null')
    and a = b;
$$;

-- Bản SQL của scoreQuestionWithAnswer().
create or replace function tnt_score_question(
  p_part int,
  p_correct jsonb,
  p_answer jsonb,
  p_default_points numeric,
  p_use_custom boolean,
  p_max numeric,
  p_sub jsonb,
  out score numeric,
  out sub_correct int
)
language plpgsql
immutable
as $$
declare
  v jsonb;
  c jsonb;
  k text;
  cnt int := 0;
  acc numeric := 0;
  cs text;
  ss text;
  cn double precision;
  sn double precision;
  is_match boolean;
begin
  sub_correct := null;

  if p_part = 1 then
    v := p_answer -> 'choice';
    if tnt_js_falsy(v) then
      score := 0;
      return;
    end if;
    c := p_correct -> 'choice';
    if tnt_js_strict_eq(v, c) then
      score := case when p_use_custom then p_max else 0.25 end;
    else
      score := 0;
    end if;
    return;
  end if;

  if p_part = 2 then
    foreach k in array array['a', 'b', 'c', 'd'] loop
      v := p_answer -> k;
      c := p_correct -> k;
      if v is not null and jsonb_typeof(v) <> 'null' and tnt_js_strict_eq(v, c) then
        cnt := cnt + 1;
        if p_sub is not null then
          acc := acc + coalesce((p_sub ->> k)::numeric, 0);
        end if;
      end if;
    end loop;
    sub_correct := cnt;
    if p_use_custom and p_sub is not null then
      score := round(acc, 2);
    elsif p_use_custom then
      score := case when cnt = 4 then p_max else 0 end;
    else
      score := case cnt when 0 then 0 when 1 then 0.1 when 2 then 0.25 when 3 then 0.5 else 1 end;
    end if;
    return;
  end if;

  -- Phần 3: trả lời ngắn
  v := p_answer -> 'value';
  if tnt_js_falsy(v) or jsonb_typeof(v) <> 'string' or jsonb_typeof(p_correct -> 'value') is distinct from 'string' then
    score := 0;
    return;
  end if;
  -- normalizeShortAnswer: đổi dấu phẩy ĐẦU TIÊN thành dấu chấm, bỏ mọi khoảng trắng.
  cs := regexp_replace(regexp_replace(p_correct ->> 'value', ',', '.'), '\s', '', 'g');
  ss := regexp_replace(regexp_replace(v #>> '{}', ',', '.'), '\s', '', 'g');
  cn := tnt_js_number(cs);
  sn := tnt_js_number(ss);
  if cn is not null and sn is not null then
    is_match := abs(cn - sn) <= 1e-6;
  else
    is_match := lower(cs) = lower(ss);
  end if;
  score := case
    when not is_match then 0
    when p_use_custom then p_max
    else coalesce(p_default_points, 0.5)
  end;
end;
$$;

-- Thời gian tập trung 1 câu (bản SQL của computeActiveSeconds). null = câu
-- không có sự kiện xem nào (khi đó dùng khoảng chọn đáp án đầu -> cuối).
create or replace function tnt_active_seconds(p_attempt_id uuid, p_question_id uuid)
returns int
language plpgsql
stable
as $$
declare
  e record;
  total numeric := 0;
  enter_t timestamptz := null;
  any_event boolean := false;
begin
  for e in
    select event_type, date_trunc('milliseconds', created_at) as t
    from question_view_events
    where attempt_id = p_attempt_id and question_id = p_question_id
    order by created_at, id
  loop
    any_event := true;
    if e.event_type = 'enter' then
      if enter_t is null then
        enter_t := e.t;
      end if;
    elsif e.event_type = 'leave' and enter_t is not null then
      total := total + greatest(0, extract(epoch from (e.t - enter_t)));
      enter_t := null;
    end if;
  end loop;
  if not any_event then
    return null;
  end if;
  return round(total)::int;
end;
$$;


-- ---------------------------------------------------------------------------
-- NỘP BÀI + CHẤM ĐIỂM Ở MÁY CHỦ
-- ---------------------------------------------------------------------------
-- Bản SQL của api.submitAttempt() cũ. Gọi lại nhiều lần an toàn: lượt đã nộp
-- thì trả về điểm đã có, không chấm lại.
create or replace function submit_attempt(p_attempt_id uuid, p_invalidated_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  a exam_attempts%rowtype;
  v_mode text;
  v_method text;
  v_custom boolean;
  v_n int;
  v_per numeric;
  r record;
  v_max numeric;
  v_sub jsonb;
  v_score numeric;
  v_sub_correct int;
  v_final jsonb;
  v_cnt int;
  v_first timestamptz;
  v_last timestamptz;
  v_time int;
  p1 numeric := 0;
  p2 numeric := 0;
  p3 numeric := 0;
  v_wrong uuid[] := '{}';
  v_now timestamptz := now();
  v_result jsonb;
begin
  select * into a from exam_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt_not_found';
  end if;
  if v_uid is null or a.student_id <> v_uid then
    raise exception 'not_owner';
  end if;
  if a.submitted_at is not null then
    select to_jsonb(s) into v_result from attempt_scores s where s.attempt_id = p_attempt_id;
    return v_result;
  end if;

  select scoring_mode, custom_scoring_method into v_mode, v_method from exams where id = a.exam_id;
  v_custom := v_mode = 'tuy_chinh';
  select count(*) into v_n from exam_questions where exam_id = a.exam_id;
  v_per := case when v_n > 0 then round(10.0 / v_n, 2) else 0 end;

  delete from question_responses where attempt_id = p_attempt_id;

  for r in
    select eq.question_id, eq.part as eq_part, eq.custom_points, eq.custom_part2_points,
           q.part as q_part, q.correct_answer, q.default_points
    from exam_questions eq
    join questions q on q.id = eq.question_id
    where eq.exam_id = a.exam_id
    order by eq.part, eq.order_index
  loop
    -- resolveExamScoring
    v_sub := null;
    if not v_custom then
      v_max := case when r.eq_part = 1 then 0.25 when r.eq_part = 2 then 1 else coalesce(r.default_points, 0.5) end;
    elsif v_method = 'tu_dong' then
      v_max := v_per;
    elsif r.eq_part = 2 and r.custom_part2_points is not null and jsonb_typeof(r.custom_part2_points) = 'object' then
      v_sub := r.custom_part2_points;
      v_max := round(
        coalesce((v_sub ->> 'a')::numeric, 0) + coalesce((v_sub ->> 'b')::numeric, 0)
        + coalesce((v_sub ->> 'c')::numeric, 0) + coalesce((v_sub ->> 'd')::numeric, 0), 2);
    else
      v_max := coalesce(r.custom_points, 0);
    end if;

    -- đáp án cuối, số lần đổi, thời gian
    select count(*), min(created_at), max(created_at)
      into v_cnt, v_first, v_last
    from answer_events
    where attempt_id = p_attempt_id and question_id = r.question_id;

    v_final := (
      select answer_value from answer_events
      where attempt_id = p_attempt_id and question_id = r.question_id
      order by created_at desc, id desc
      limit 1
    );

    v_time := tnt_active_seconds(p_attempt_id, r.question_id);
    if v_time is null then
      v_time := case
        when v_first is null then 0
        else greatest(0, round(extract(epoch from (date_trunc('milliseconds', v_last) - date_trunc('milliseconds', v_first)))))::int
      end;
    end if;

    select s.score, s.sub_correct into v_score, v_sub_correct
    from tnt_score_question(r.q_part, r.correct_answer, v_final, r.default_points, v_custom, v_max, v_sub) s;

    if r.q_part = 1 then
      p1 := p1 + v_score;
    elsif r.q_part = 2 then
      p2 := p2 + v_score;
    else
      p3 := p3 + v_score;
    end if;

    if v_score < v_max then
      v_wrong := v_wrong || r.question_id;
    end if;

    insert into question_responses (
      attempt_id, question_id, final_answer, score, sub_correct_count,
      time_spent_seconds, change_count, first_response_at, last_response_at
    ) values (
      p_attempt_id, r.question_id, v_final, v_score, v_sub_correct,
      v_time, greatest(0, v_cnt - 1), v_first, v_last
    );
  end loop;

  p1 := round(p1, 2);
  p2 := round(p2, 2);
  p3 := round(p3, 2);

  insert into attempt_scores (attempt_id, part1_score, part2_score, part3_score, total_score)
  values (p_attempt_id, p1, p2, p3, round(p1 + p2 + p3, 2))
  on conflict (attempt_id) do update set
    part1_score = excluded.part1_score,
    part2_score = excluded.part2_score,
    part3_score = excluded.part3_score,
    total_score = excluded.total_score;

  update exam_attempts set
    submitted_at = v_now,
    invalidated = case when p_invalidated_reason is not null then true else invalidated end,
    invalidated_reason = coalesce(p_invalidated_reason, invalidated_reason)
  where id = p_attempt_id;

  if array_length(v_wrong, 1) > 0 then
    insert into wrong_answer_journal (
      student_id, question_id, last_wrong_at, correct_streak,
      last_reviewed_session_id, retired_at, source_attempt_id
    )
    select a.student_id, qid, v_now, 0, null, null, p_attempt_id
    from unnest(v_wrong) as qid
    on conflict (student_id, question_id) do update set
      last_wrong_at = excluded.last_wrong_at,
      correct_streak = 0,
      last_reviewed_session_id = null,
      retired_at = null,
      source_attempt_id = excluded.source_attempt_id;
  end if;

  select to_jsonb(s) into v_result from attempt_scores s where s.attempt_id = p_attempt_id;
  return v_result;
end;
$$;


-- ---------------------------------------------------------------------------
-- QUYỀN GỌI HÀM
-- ---------------------------------------------------------------------------
revoke all on function get_exam_paper(uuid) from public, anon;
grant execute on function get_exam_paper(uuid) to authenticated;
revoke all on function submit_attempt(uuid, text) from public, anon;
grant execute on function submit_attempt(uuid, text) to authenticated;
-- anon cũng cần quyền gọi (policy của questions gọi hàm này); với anon hàm
-- luôn trả false vì auth.uid() = null.
revoke all on function can_see_question_key(uuid) from public;
grant execute on function can_see_question_key(uuid) to anon, authenticated;
