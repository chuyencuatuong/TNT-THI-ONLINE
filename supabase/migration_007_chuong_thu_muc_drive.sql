-- ============================================================================
-- 3 bổ sung độc lập, chạy chung 1 lần trong Supabase Dashboard > SQL Editor:
--
-- 1) Tự nhận CHƯƠNG (không phải "dạng bài") khi nhập đề — thêm cột topic_id
--    trực tiếp vào questions, TÁCH RIÊNG khỏi question_type_id (dạng bài chi
--    tiết vẫn suy ra qua question_types.topic_id như cũ, không đổi). Lý do
--    tách riêng: khung "dạng bài" chưa được định nghĩa đầy đủ cho từng chương,
--    nên nếu chỉ dựa vào question_type_id thì rất nhiều câu sẽ không suy ra
--    được chương nào cả. topic_id cho phép phân loại ở mức chương ngay cả khi
--    chưa có dạng bài chi tiết, đúng yêu cầu "bước đầu chỉ cần chương, dạng
--    bài chi tiết làm sau". ai_suggested_topic_id đi kèm để giữ đúng nguyên
--    tắc "AI gợi ý, giáo viên xác nhận" đã áp dụng cho ai_suggested_type_id.
--
-- 2) Thư mục đề tự do — 1 đề thuộc đúng 1 thư mục do giáo viên tự đặt tên
--    (không bắt buộc, không phải bảng riêng — cột text đơn giản, nhóm theo
--    tên ở giao diện). Để trống = "Chưa phân loại".
--
-- 3) Link Google Drive cho mỗi đề — để học sinh tải file đề gốc về máy, không
--    lưu file trong hệ thống (giáo viên tự tải lên Drive rồi dán link).
-- ============================================================================

alter table questions add column if not exists topic_id uuid references topics(id) on delete set null;
alter table questions add column if not exists ai_suggested_topic_id uuid references topics(id);

alter table exams add column if not exists folder text;
alter table exams add column if not exists drive_link text;
