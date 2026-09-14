-- ============================================================================
-- 14/09/2026 — "Quản lý & thúc đẩy xử lý câu sai"
--
-- KHÔNG có bảng/cột nào mới. Tính năng "còn bao nhiêu câu sai, tách theo Lần
-- 1/2/3" suy ra 100% từ dữ liệu đã có (wrong_answer_journal.correct_streak ở
-- migration_008): streak 0 -> Lần 1, streak 1 -> Lần 2, streak 2 -> Lần 3.
-- Xem src/lib/journalProgress.ts (hàm thuần, có unit test) cho quy ước này.
--
-- File này CHỈ thêm chỉ mục (index) cho 3 truy vấn mới, nên:
--   - Chạy lúc nào cũng được, chạy lại nhiều lần cũng được (if not exists).
--   - KHÔNG chạy thì app vẫn hoạt động đúng y hệt, chỉ chậm hơn khi nhật ký
--     và số buổi ôn tập lớn dần. Không phải migration bắt buộc trước khi deploy.
-- ============================================================================

-- 1) Trang chủ học sinh + trang ôn tập: "nhật ký đang cần ôn của HS này".
--    Chỉ mục MỘT PHẦN (partial, where retired_at is null) — các câu đã rút
--    khỏi nhật ký chỉ tăng dần theo thời gian và không bao giờ bị truy vấn
--    lại ở đây, để chúng ngoài chỉ mục giúp chỉ mục nhỏ và luôn "nóng".
create index if not exists wrong_answer_journal_active_by_student_idx
  on wrong_answer_journal (student_id)
  where retired_at is null;

-- 2) Giao diện giáo viên: quét TOÀN BỘ câu đang cần ôn của mọi học sinh trong
--    1 truy vấn (api.listActiveJournalProgressByStudent) — cùng chỉ mục ở (1)
--    phục vụ được, nhưng thêm correct_streak/last_wrong_at vào INCLUDE để
--    Postgres đọc thẳng từ chỉ mục, khỏi phải chạm bảng (index-only scan).
create index if not exists wrong_answer_journal_active_progress_idx
  on wrong_answer_journal (student_id)
  include (correct_streak, last_wrong_at)
  where retired_at is null;

-- 3) Mốc buổi ôn gần nhất của từng học sinh (dùng cho mức nhắc nhở
--    "đã N ngày chưa ôn") — cả hai truy vấn (1 học sinh / mọi học sinh) đều
--    sắp theo started_at giảm dần trong phạm vi từng học sinh.
create index if not exists review_sessions_student_started_idx
  on review_sessions (student_id, started_at desc);
