-- ============================================================================
-- 14/09/2026 — "Giáo viên sửa điểm sau khi học sinh nộp bài"
--
-- VÌ SAO CẦN: đôi khi có trục trặc khách quan (máy/mạng của học sinh) khiến
-- các em không điền được đáp án, hoặc đáp án ghi nhận không đúng thứ các em
-- thật sự chọn. Điểm khi đó không phản ánh đúng trình độ.
--
-- CÁCH LÀM (đã chốt với Thầy Tường): KHÔNG cộng/trừ thẳng vào tổng điểm, mà
-- GV sửa lại ĐÁP ÁN của đúng câu bị trục trặc rồi hệ thống CHẤM LẠI. Lý do:
-- nếu chỉ sửa tổng điểm thì "năng lực theo Chương/Bài", phần chẩn đoán và
-- nhật ký câu sai vẫn coi câu đó là sai — số liệu sẽ nói dối.
--
-- NGUYÊN TẮC QUAN TRỌNG: `answer_events` (log thô từng lần học sinh bấm chọn)
-- KHÔNG BAO GIỜ bị sửa. Đó là bằng chứng hành vi thật, dùng để tính thời gian
-- làm từng câu, số lần đổi đáp án và toàn bộ phần chẩn đoán. Đáp án do GV sửa
-- được ghi RIÊNG vào cột `teacher_answer` bên dưới; lúc chấm lại, hệ thống
-- dùng `teacher_answer` nếu có, không có thì dùng `final_answer` như cũ.
-- Nhờ vậy luôn đối chiếu được "HS điền gì" với "GV sửa thành gì".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Đáp án do giáo viên sửa, ghi riêng từng câu
-- ---------------------------------------------------------------------------
alter table question_responses
  add column if not exists teacher_answer jsonb,
  add column if not exists teacher_edited_at timestamptz,
  add column if not exists teacher_edited_by uuid references profiles(id);

comment on column question_responses.teacher_answer is
  'Đáp án do GIÁO VIÊN sửa lại sau khi học sinh nộp bài (null = chưa sửa, dùng final_answer). KHÔNG ghi đè final_answer/answer_events để luôn đối chiếu được đáp án gốc học sinh đã điền.';
comment on column question_responses.teacher_edited_at is
  'Thời điểm giáo viên sửa đáp án câu này lần gần nhất.';
comment on column question_responses.teacher_edited_by is
  'Giáo viên đã sửa đáp án câu này lần gần nhất.';

-- ---------------------------------------------------------------------------
-- 2) Dấu vết điều chỉnh ở cấp cả lượt làm bài
-- ---------------------------------------------------------------------------
alter table attempt_scores
  add column if not exists adjusted_at timestamptz,
  add column if not exists adjusted_by uuid references profiles(id),
  add column if not exists adjustment_reason text,
  add column if not exists original_total_score numeric(4,2);

comment on column attempt_scores.original_total_score is
  'Tổng điểm TRƯỚC lần điều chỉnh ĐẦU TIÊN — chỉ ghi 1 lần duy nhất, các lần sửa sau không ghi đè, để luôn so được "điểm máy chấm ban đầu" với "điểm sau điều chỉnh". null = chưa từng điều chỉnh.';
comment on column attempt_scores.adjustment_reason is
  'Lý do điều chỉnh do giáo viên nhập — HIỂN THỊ CHO HỌC SINH ở trang kết quả (đã chốt: minh bạch, tránh học sinh thắc mắc vì sao điểm tự nhiên khác).';

-- ---------------------------------------------------------------------------
-- 3) Nhật ký câu sai: nhớ câu đó vào nhật ký TỪ LƯỢT LÀM BÀI NÀO
--
-- Cần cho việc rút câu khỏi nhật ký một cách CHÍNH XÁC khi chấm lại. Ví dụ:
-- học sinh sai câu X ở lượt 1 (thứ Hai) và sai lại câu X ở lượt 2 (thứ Tư).
-- Nếu GV chấm lại lượt 1 thành đúng mà cứ thế rút câu X ra thì SAI — bằng
-- chứng mới nhất (lượt 2) vẫn nói em chưa nắm câu đó. Có cột này thì chỉ rút
-- khi dòng nhật ký đúng là do CHÍNH lượt đang chấm lại tạo ra.
--
-- Các dòng nhật ký có từ trước migration này để null (không biết nguồn) —
-- khi đó vẫn rút, vì đúng ý giáo viên đang thao tác trên lượt bài cụ thể.
-- ---------------------------------------------------------------------------
alter table wrong_answer_journal
  add column if not exists source_attempt_id uuid references exam_attempts(id) on delete set null;

comment on column wrong_answer_journal.source_attempt_id is
  'Lượt làm bài đã đưa câu này vào nhật ký lần gần nhất. null = dòng cũ có trước 14/09/2026, không rõ nguồn.';

-- ---------------------------------------------------------------------------
-- 4) RLS: cho giáo viên sửa nhật ký câu sai của học sinh
--
-- Chấm lại 1 câu thành ĐÚNG thì câu đó phải được rút khỏi nhật ký ôn tập —
-- trục trặc kỹ thuật không phải lỗ hổng kiến thức, bắt học sinh ôn lại 3 buổi
-- là phi lý. Ngược lại, sửa thành SAI thì phải thêm vào nhật ký.
--
-- Các policy ở migration_008 chỉ cho phép CHÍNH học sinh ghi
-- (student_id = auth.uid()) và KHÔNG có policy delete nào, nên giáo viên
-- không làm được 2 việc trên. Mở thêm đúng phần còn thiếu, KHÔNG nới quyền
-- của học sinh: các policy cũ giữ nguyên, chỉ bổ sung nhánh is_teacher().
-- ---------------------------------------------------------------------------
drop policy if exists "wrong_journal_insert" on wrong_answer_journal;
create policy "wrong_journal_insert" on wrong_answer_journal
  for insert with check (student_id = auth.uid() or is_teacher());

drop policy if exists "wrong_journal_update" on wrong_answer_journal;
create policy "wrong_journal_update" on wrong_answer_journal
  for update using (student_id = auth.uid() or is_teacher())
  with check (student_id = auth.uid() or is_teacher());

-- Trước đây KHÔNG có policy delete -> không ai xoá được dòng nào. Chỉ giáo
-- viên mới được xoá (khi chấm lại thành đúng và học sinh không còn lượt làm
-- bài nào khác sai câu đó) — học sinh vẫn không tự xoá câu khỏi nhật ký được.
drop policy if exists "wrong_journal_delete_teacher" on wrong_answer_journal;
create policy "wrong_journal_delete_teacher" on wrong_answer_journal
  for delete using (is_teacher());
