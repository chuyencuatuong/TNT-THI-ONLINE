-- ============================================================================
-- DỌN SẠCH DỮ LIỆU THỬ NGHIỆM TRƯỚC KHI ĐI VÀO VẬN HÀNH THẬT (25/08/2026)
-- Chạy TRONG Supabase Dashboard > SQL Editor. Claude KHÔNG có kết nối trực
-- tiếp tới database của Thầy nên KHÔNG tự chạy được — Thầy tự chạy theo từng
-- PHẦN bên dưới, xem kết quả PHẦN 0 trước khi chạy PHẦN xoá.
--
-- Phạm vi đã thống nhất: xoá SẠCH mọi tài khoản/lượt làm bài/đề thi/câu hỏi
-- thử nghiệm, CHỈ GIỮ LẠI đúng 1 tài khoản giáo viên của Thầy.
--
-- LƯU Ý QUAN TRỌNG: DELETE trong SQL là XOÁ VĨNH VIỄN, không có thùng rác để
-- khôi phục. Bắt buộc đọc kỹ PHẦN 0 (xem trước) trước khi chạy bất kỳ lệnh
-- DELETE nào bên dưới. Nếu chưa chắc, chụp lại kết quả PHẦN 0 rồi hỏi lại
-- trước khi tiếp tục.
--
-- LƯU Ý VỀ CÁCH CHẠY: mỗi PHẦN là 1 lượt bôi đen (select) + Run RIÊNG, KHÔNG
-- dán nguyên cả file rồi Run 1 lần. Supabase SQL Editor chạy nội dung 1 lần
-- Run như 1 transaction — nếu PHẦN sau bị lỗi (như PHẦN 5 dưới), toàn bộ
-- PHẦN trước đó trong CÙNG 1 lần Run sẽ bị cuộn ngược lại (rollback), coi
-- như chưa xoá gì cả, dù nhìn tưởng đã chạy xong. Chạy tách riêng từng PHẦN
-- vừa an toàn hơn, vừa dễ biết chính xác PHẦN nào đã thực sự xoá.
-- ============================================================================


-- ============================================================================
-- PHẦN 0 — XEM TRƯỚC (chỉ đọc, không xoá gì cả). Chạy phần này TRƯỚC TIÊN.
-- ============================================================================

-- 0a) Toàn bộ tài khoản hiện có kèm email — kiểm tra kỹ: phải có ĐÚNG 1 dòng
-- role = 'teacher', và đó chính là tài khoản của Thầy. Nếu thấy nhiều hơn 1
-- dòng teacher, hoặc dòng nào trông không đúng là của Thầy, DỪNG LẠI, không
-- chạy PHẦN 1 bên dưới, báo lại để điều chỉnh điều kiện WHERE cho đúng.
select
  p.id,
  p.role,
  p.full_name,
  u.email,
  p.created_at
from public.profiles p
join auth.users u on u.id = p.id
order by p.role, p.created_at;

-- 0b) Đếm số dòng sẽ bị ảnh hưởng ở từng bảng — chỉ để tham khảo quy mô dữ
-- liệu thử nghiệm đang có, không bắt buộc phải đọc kỹ từng số.
select 'profiles (không phải GV)' as bang, count(*) from public.profiles where role <> 'teacher'
union all select 'exams', count(*) from public.exams
union all select 'questions', count(*) from public.questions
union all select 'topics', count(*) from public.topics
union all select 'question_types', count(*) from public.question_types
union all select 'exam_attempts', count(*) from public.exam_attempts
union all select 'reports', count(*) from public.reports
union all select 'review_sessions', count(*) from public.review_sessions
union all select 'wrong_answer_journal', count(*) from public.wrong_answer_journal
union all select 'pomodoro_sessions', count(*) from public.pomodoro_sessions
union all select 'student_playlists', count(*) from public.student_playlists
union all select 'answer_events', count(*) from public.answer_events
union all select 'proctoring_events', count(*) from public.proctoring_events
union all select 'exam_tags', count(*) from public.exam_tags
union all select 'storage.objects (question-images)', count(*) from storage.objects where bucket_id = 'question-images';


-- ============================================================================
-- PHẦN 1 — XOÁ TÀI KHOẢN THỬ NGHIỆM (giữ lại đúng tài khoản role='teacher')
--
-- Xoá thẳng ở auth.users (không phải chỉ bảng profiles) để tài khoản test
-- KHÔNG còn đăng nhập được nữa, không chỉ mất hồ sơ. profiles.id tham chiếu
-- auth.users(id) on delete cascade, nên xoá auth.users sẽ tự kéo theo xoá:
-- profiles, exam_attempts (+ answer_events, question_view_events,
-- question_responses, attempt_scores, proctoring_events đi kèm), reports,
-- wrong_answer_journal, review_sessions (+ review_session_answers),
-- pomodoro_sessions, student_playlists — của TỪNG tài khoản bị xoá.
--
-- Đã kiểm tra kỹ PHẦN 0 rồi mới bỏ comment (xoá dấu -- ở 2 dòng dưới) và chạy.
-- ============================================================================

-- delete from auth.users
-- where id not in (select id from public.profiles where role = 'teacher');


-- ============================================================================
-- PHẦN 2 — XOÁ ĐỀ THI + NGÂN HÀNG CÂU HỎI THỬ NGHIỆM
--
-- exam_attempts.exam_id CŨNG có on delete cascade từ exams, nên xoá exams ở
-- đây sẽ tự kéo theo xoá nốt mọi exam_attempts còn sót (nếu có) — không báo
-- lỗi. Vẫn nên chạy SAU PHẦN 1 như thứ tự dưới đây, để hầu hết attempt đã
-- được dọn từ phía học sinh trước, phần này chỉ dọn nốt phần còn lại.
-- exam_questions + exam_topics cũng tự động biến mất theo (on delete cascade
-- từ exams). Bỏ comment 2 dòng dưới rồi chạy.
-- ============================================================================

-- delete from public.exams;
-- delete from public.questions;


-- ============================================================================
-- PHẦN 3 — KHUNG CHƯƠNG TRÌNH (topics/question_types) — MẶC ĐỊNH KHÔNG XOÁ
--
-- Lưu ý riêng: 6 dòng trong bảng `topics` hiện tại là 6 CHƯƠNG THẬT của
-- chương trình Toán 12 (gieo từ migration_005_chuong_toan12.sql: Ứng dụng
-- đạo hàm, Véc tơ..., Nguyên hàm và tích phân...) — đây là khung kiến thức
-- Thầy sẽ DÙNG LẠI khi tạo câu hỏi/đề thi thật, không phải dữ liệu thử
-- nghiệm để xoá. Vì vậy PHẦN này để mặc định KHÔNG chạy.
--
-- Chỉ bỏ comment nếu Thầy THỰC SỰ muốn xoá luôn cả khung chương này (ví dụ
-- muốn nhập lại chương trình khác từ đầu):
-- ============================================================================

-- delete from public.question_types;
-- delete from public.topics;


-- ============================================================================
-- PHẦN 4 — THƯ MỤC/CHƯƠNG TRÌNH THI (exam_tags: folder/term) — TUỲ CHỌN
--
-- Nếu PHẦN 2 đã xoá hết exams thì các thẻ folder/term này không còn đề nào
-- gắn vào nữa. Xoá nếu muốn dọn sạch luôn (an toàn, không ảnh hưởng gì khác):
-- ============================================================================

-- delete from public.exam_tags;


-- ============================================================================
-- PHẦN 5 — ẢNH MINH HOẠ CÂU HỎI ĐÃ UPLOAD LÚC TEST (Storage) — TUỲ CHỌN
--
-- Xoá bảng `questions` ở PHẦN 2 KHÔNG tự xoá file ảnh thật trong Storage
-- (question_images.image_url chỉ là link text).
--
-- KHÔNG xoá bằng SQL được — Supabase chặn thẳng lệnh DELETE trên
-- storage.objects (lỗi 42501 "Direct deletion from storage tables is not
-- allowed. Use the Storage API instead", đây là tính năng an toàn của
-- Supabase, không phải lỗi ở file này) để tránh còn file rác mồ côi ở tầng
-- lưu trữ thật khi xoá thẳng dòng trong bảng. Muốn dọn ảnh test, làm THỦ
-- CÔNG qua giao diện thay vì SQL:
--   Supabase Dashboard > Storage > bucket "question-images" > chọn hết ảnh
--   (hoặc từng ảnh nếu muốn xem lại trước) > Delete.
-- Việc này đi qua đúng Storage API nên không bị chặn. Có thể bỏ qua bước
-- này nếu ảnh test không đáng kể / không gấp.
-- ============================================================================


-- ============================================================================
-- PHẦN 6 — KIỂM TRA LẠI SAU KHI XOÁ (chạy sau khi đã chạy các PHẦN ở trên)
-- Kỳ vọng: đúng 1 dòng profiles (role=teacher), mọi bảng khác đều = 0 (trừ
-- topics/question_types nếu Thầy chủ động giữ lại ở PHẦN 3).
-- ============================================================================

select 'profiles' as bang, count(*) from public.profiles
union all select 'exams', count(*) from public.exams
union all select 'questions', count(*) from public.questions
union all select 'topics', count(*) from public.topics
union all select 'question_types', count(*) from public.question_types
union all select 'exam_attempts', count(*) from public.exam_attempts
union all select 'reports', count(*) from public.reports
union all select 'review_sessions', count(*) from public.review_sessions
union all select 'wrong_answer_journal', count(*) from public.wrong_answer_journal
union all select 'pomodoro_sessions', count(*) from public.pomodoro_sessions
union all select 'student_playlists', count(*) from public.student_playlists;
