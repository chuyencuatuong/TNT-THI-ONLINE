-- ============================================================================
-- Phân bố điểm ẩn danh của 1 đề (trang kết quả học sinh, chương "Vị trí") — 01/10/2026
--
-- Chạy 1 LẦN trong Supabase Dashboard > SQL Editor > New query. An toàn chạy
-- lại nhiều lần (create or replace).
--
-- Vì sao cần hàm riêng: RLS của attempt_scores chỉ cho học sinh đọc điểm CỦA
-- MÌNH, nên trình duyệt không tự tính được "em đứng trên bao nhiêu % số lượt
-- làm đề". Hàm này chạy với quyền của chủ hàm (security definer) nhưng chỉ trả
-- về CON SỐ, không bao giờ trả tên / mã học sinh / mã lượt làm.
--
-- Quy tắc riêng tư (đã chốt 01/10/2026):
--   - Chỉ tính lượt làm LẦN ĐẦU (attempt_number = 1), đã nộp, không bị huỷ.
--   - Chỉ trả danh sách điểm khi đề có từ 20 lượt như vậy trở lên. Dưới ngưỡng
--     chỉ trả số lượt (n) — lớp tối đa 5 em, trả điểm khi n nhỏ thì học sinh có
--     thể đoán ra điểm của bạn cùng lớp.
--   - Người gọi phải là giáo viên, hoặc học sinh ĐÃ NỘP bài đề này.
-- ============================================================================

create or replace function get_exam_score_distribution(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_n int;
  v_scores jsonb;
begin
  if not (
    is_teacher()
    or exists (
      select 1 from exam_attempts me
      where me.exam_id = p_exam_id
        and me.student_id = auth.uid()
        and me.submitted_at is not null
    )
  ) then
    return jsonb_build_object('n', 0, 'scores', null);
  end if;

  select count(*) into v_n
  from exam_attempts a
  join attempt_scores s on s.attempt_id = a.id
  where a.exam_id = p_exam_id
    and a.attempt_number = 1
    and a.submitted_at is not null
    and coalesce(a.invalidated, false) = false;

  if v_n < 20 then
    return jsonb_build_object('n', v_n, 'scores', null);
  end if;

  select jsonb_agg(s.total_score order by s.total_score) into v_scores
  from exam_attempts a
  join attempt_scores s on s.attempt_id = a.id
  where a.exam_id = p_exam_id
    and a.attempt_number = 1
    and a.submitted_at is not null
    and coalesce(a.invalidated, false) = false;

  return jsonb_build_object('n', v_n, 'scores', v_scores);
end;
$$;

revoke all on function get_exam_score_distribution(uuid) from public;
grant execute on function get_exam_score_distribution(uuid) to authenticated;
