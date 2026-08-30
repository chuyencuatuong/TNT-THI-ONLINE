-- ============================================================================
-- Tính năng mới: xóa hẳn 1 kết quả thi (1 lượt làm bài), kèm toàn bộ lịch sử
-- thi gắn với lượt đó (29/08/2026). Chạy 1 LẦN trong Supabase Dashboard >
-- SQL Editor > New query. An toàn chạy lại nhiều lần.
--
-- Bối cảnh: bảng exam_attempts (schema gốc) chưa từng có chính sách RLS nào
-- cho lệnh DELETE — kể cả cho giáo viên. Nếu chỉ thêm nút "Xóa" ở giao diện
-- mà không thêm chính sách này, lệnh xoá sẽ CHẠY "THÀNH CÔNG" NHƯNG XOÁ 0
-- DÒNG (đúng lỗi đã gặp trước đây với bảng profiles, xem migration_014) —
-- giao diện tưởng đã xoá nhưng dữ liệu vẫn còn nguyên trong CSDL.
--
-- Không cần thêm gì cho các bảng con (answer_events, question_view_events,
-- question_responses, attempt_scores, proctoring_events) — cả 5 bảng đó đã
-- khai báo "references exam_attempts(id) on delete cascade" ngay từ
-- schema.sql gốc, nên khi 1 dòng exam_attempts bị xoá, mọi dữ liệu con của
-- lượt làm đó (câu trả lời, thời gian xem từng câu, giám sát nghiêm túc,
-- điểm số) tự động bị xoá theo — đúng yêu cầu "xóa kết quả thi thì xóa luôn
-- lịch sử thi của học sinh".
-- ============================================================================

drop policy if exists "attempts_delete_teacher" on exam_attempts;
create policy "attempts_delete_teacher" on exam_attempts
  for delete using (is_teacher());
