-- ============================================================================
-- Sửa lỗi: giáo viên gán học sinh vào lớp / ghi đè tầng KHÔNG LƯU LẠI được
-- (29/08/2026). Chạy 1 LẦN trong Supabase Dashboard > SQL Editor > New query.
-- An toàn chạy lại nhiều lần ("drop policy if exists" trước "create policy").
--
-- Bối cảnh lỗi: migration_013 thêm classes/class_sessions/attendance và các
-- cột profiles.class_id / profiles.manual_tier, nhưng KHÔNG thêm chính sách
-- RLS cho phép giáo viên UPDATE hồ sơ của HỌC SINH KHÁC. Chính sách duy nhất
-- đang có trên bảng profiles ("profiles_update_own", từ schema.sql gốc) chỉ
-- cho phép mỗi người tự sửa hồ sơ CHÍNH MÌNH (using (id = auth.uid())).
--
-- Hậu quả thực tế: api.setStudentClass() / api.setManualTier() (trang "Quản
-- lý lớp", TeacherClassList.tsx) gọi UPDATE profiles ... WHERE id = <học
-- sinh> — Postgres RLS lọc bỏ dòng đó (không khớp "id = auth.uid()" vì
-- auth.uid() lúc này là GIÁO VIÊN) nên câu UPDATE chạy "thành công" nhưng
-- SỬA 0 DÒNG, không báo lỗi gì cho client. Giao diện vẫn cập nhật ngay lập
-- tức vì đó là state cục bộ trong React — chỉ khi tải lại trang (đọc lại từ
-- CSDL) mới lộ ra dữ liệu chưa từng được ghi thật.
--
-- Cách sửa: thêm 1 chính sách UPDATE riêng cho giáo viên, đúng nguyên tắc
-- "GV toàn quyền" đã dùng nhất quán ở mọi bảng khác trong hệ thống (classes,
-- class_sessions, attendance, exams...). RLS cho phép NHIỀU policy cùng lệnh
-- (OR với nhau), nên chính sách mới này cộng thêm vào "profiles_update_own"
-- chứ không thay thế — học sinh vẫn tự sửa được hồ sơ mình như cũ.
-- ============================================================================

drop policy if exists "profiles_update_teacher" on profiles;
create policy "profiles_update_teacher" on profiles
  for update using (is_teacher())
  with check (is_teacher());
