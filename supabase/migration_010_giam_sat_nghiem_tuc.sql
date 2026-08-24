-- ============================================================================
-- Tăng cường giám sát khi làm bài: 2 chế độ phòng thi (thoải mái / nghiêm
-- túc), đề thi được chỉ định (mở khoá/khoá theo giờ), tự động huỷ bài nếu rời
-- trang quá số lần cho phép ở đề nghiêm túc. Chỉ cần chạy 1 LẦN file này trong
-- Supabase Dashboard > SQL Editor > New query. An toàn chạy lại nhiều lần.
--
-- Nguyên tắc đã thống nhất với thầy Tường: KHÔNG dùng hiệu ứng "hù doạ" (âm
-- thanh/hình ảnh giật gân) để tạo áp lực tâm lý cho học sinh — thay vào đó
-- dùng sự MINH BẠCH (học sinh biết rõ mình đang bị theo dõi, biết ngay lúc vi
-- phạm, biết chắc hậu quả) + hậu quả THẬT (bài bị huỷ, giáo viên thấy rõ chi
-- tiết) làm động lực răn đe, hiệu quả hơn và không gây lo âu quá mức.
-- ============================================================================

alter table exams add column if not exists mode text not null default 'thoai_mai'
  check (mode in ('thoai_mai', 'nghiem_tuc'));
comment on column exams.mode is
  'thoai_mai = luyện tập bình thường (mặc định, giữ hành vi cũ); nghiem_tuc = bắt buộc toàn màn hình, cảnh báo trước, tự huỷ bài nếu rời trang quá số lần cho phép.';

alter table exams add column if not exists assigned_unlock_at timestamptz;
alter table exams add column if not exists assigned_lock_at timestamptz;
comment on column exams.assigned_unlock_at is
  'Đề "được chỉ định" (giao đúng giờ) — null = đề mở tự do. Trước giờ này học sinh không bắt đầu làm bài được.';
comment on column exams.assigned_lock_at is
  'Sau giờ này (nếu có) học sinh không thể bắt đầu lượt làm MỚI nữa — không ảnh hưởng lượt đang làm dở trước đó.';

alter table exam_attempts add column if not exists invalidated boolean not null default false;
alter table exam_attempts add column if not exists invalidated_reason text;
comment on column exam_attempts.invalidated is
  'true = bài đã bị tự động huỷ do vi phạm giám sát (rời trang/thoát fullscreen quá số lần cho phép) — điểm vẫn được chấm và lưu để giáo viên xem lại, chỉ đánh dấu không hợp lệ.';

-- Chặn ở TẦNG SERVER (dùng đồng hồ của Postgres, không phải đồng hồ trình
-- duyệt học sinh — tránh việc học sinh chỉnh giờ máy để lách mở khoá sớm/làm
-- bù trễ giờ) việc tạo lượt làm bài mới ngoài khung giờ được chỉ định. Đây là
-- lớp bảo vệ THỨ HAI — giao diện học sinh cũng tự ẩn nút "Bắt đầu làm bài"
-- ngoài khung giờ, nhưng chặn ở DB mới là chốt chặn thật sự.
create or replace function check_exam_assignment_window()
returns trigger as $$
declare
  v_unlock timestamptz;
  v_lock timestamptz;
begin
  select assigned_unlock_at, assigned_lock_at into v_unlock, v_lock
  from exams where id = new.exam_id;

  if v_unlock is not null and now() < v_unlock then
    raise exception 'exam_not_unlocked_yet';
  end if;
  if v_lock is not null and now() > v_lock then
    raise exception 'exam_locked';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_exam_assignment_window on exam_attempts;
create trigger trg_check_exam_assignment_window
  before insert on exam_attempts
  for each row execute function check_exam_assignment_window();
