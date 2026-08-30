-- ============================================================================
-- Đợt 3 (cải tiến sau audit thực tế — mục 2): tính điểm LINH HOẠT cho các đề
-- không theo cấu trúc chuẩn THPT (kiểm tra 15 phút, kiểm tra thường xuyên...).
--
-- Mặc định MỌI đề (kể cả đề đã tạo trước migration này) vẫn dùng
-- scoring_mode = 'chuan_thpt' -> hành vi chấm điểm GIỮ NGUYÊN Y HỆT như
-- trước, không ảnh hưởng gì tới đề/điểm số cũ. Chỉ khi giáo viên chủ động
-- chọn 'tuy_chinh' ở giao diện soạn đề, luồng tính điểm mới (xem
-- src/lib/scoring.ts, hàm resolveExamScoring) mới được áp dụng.
--
-- 2 chế độ con khi 'tuy_chinh':
--   - 'tu_dong': chia đều 10 điểm cho tổng số câu trong đề, không cần nhập gì.
--   - 'thu_cong': giáo viên tự nhập điểm từng câu (custom_points) — riêng
--     Phần 2 (đúng/sai 4 ý) có thể nhập RIÊNG điểm từng ý (custom_part2_points,
--     dạng {"a":.., "b":.., "c":.., "d":..}) thay vì 1 điểm chung cho cả câu.
-- ============================================================================

alter table exams
  add column if not exists scoring_mode text not null default 'chuan_thpt'
    check (scoring_mode in ('chuan_thpt', 'tuy_chinh'));

alter table exams
  add column if not exists custom_scoring_method text
    check (custom_scoring_method in ('tu_dong', 'thu_cong'));

alter table exam_questions
  add column if not exists custom_points numeric;

alter table exam_questions
  add column if not exists custom_part2_points jsonb;

comment on column exams.scoring_mode is
  'chuan_thpt (mặc định) = giữ nguyên barem chính thức THPT hiện có; tuy_chinh = dùng custom_scoring_method + exam_questions.custom_points/custom_part2_points (xem src/lib/scoring.ts resolveExamScoring).';
comment on column exams.custom_scoring_method is
  'Chỉ có ý nghĩa khi scoring_mode = tuy_chinh. tu_dong = chia đều 10đ theo số câu; thu_cong = giáo viên tự nhập điểm từng câu/từng ý.';
comment on column exam_questions.custom_points is
  'Điểm tối đa tuỳ chỉnh cho câu này trong đề — chỉ dùng ở chế độ tuy_chinh/thu_cong. Với Phần 2, chỉ dùng khi custom_part2_points là null.';
comment on column exam_questions.custom_part2_points is
  'Điểm riêng từng ý a/b/c/d của câu Phần 2 (đúng/sai) — chỉ dùng ở chế độ tuy_chinh/thu_cong, ưu tiên hơn custom_points khi cả 2 cùng có giá trị.';
