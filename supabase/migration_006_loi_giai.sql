-- ============================================================================
-- Thêm cột lưu lời giải chi tiết cho từng câu hỏi.
-- Chạy trong Supabase Dashboard > SQL Editor > New query.
--
-- LƯU Ý VỀ CÁCH HIỂN THỊ: cột này được đọc cùng lúc với toàn bộ câu hỏi (giống
-- như correct_answer đã có từ trước), nên về mặt kỹ thuật dữ liệu vẫn có mặt
-- trong phản hồi mạng ngay cả lúc học sinh đang làm bài — ứng dụng chỉ chủ động
-- KHÔNG hiển thị cột này ra giao diện cho tới sau khi nộp bài (xem
-- src/components/QuestionReview.tsx). Đây là giới hạn tương tự đã có sẵn với
-- correct_answer, không phải lỗ hổng mới phát sinh từ thay đổi này.
-- ============================================================================

alter table questions add column if not exists solution_latex text;
