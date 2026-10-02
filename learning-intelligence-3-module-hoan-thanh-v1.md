# Learning Intelligence — củng cố toàn diện 3 module (27/09/2026)

Trạng thái: **code xong, đã kiểm chứng** — `tsc -b` sạch, `vitest run` 418/418 test pass (thêm 36 test mới cho các hàm thuần), `vite build` thành công (build ra thư mục tạm ngoài repo, không đụng `dist/`). Đã chạy 1 vòng rà soát độc lập, tìm ra 10 lỗi logic và đã sửa hết (xem mục 4).

**Chưa kiểm thử được trên dữ liệu thật** (không có quyền đăng nhập Supabase của hệ thống) — lần đầu mở các trang mới, thầy để ý giúp các con số có hợp lý không.

## 1. Việc thầy cần làm (theo thứ tự)

1. Supabase Dashboard → SQL Editor: chạy `supabase/migration_019_error_intelligence_core.sql` (nếu chưa chạy).
2. Chạy tiếp `supabase/migration_020_knowledge_graph.sql` (bảng Bài nền tảng + gợi ý sẵn cho Chương 1 Lớp 12). An toàn chạy lại; lần chạy lại không khôi phục cạnh thầy đã xoá.
3. Đưa code lên như mọi lần (zip/GitHub).
4. Quy trình gắn nhãn nhanh — khoảng 15 phút/ngày:
   - Vào **Gắn nhãn lỗi** (menu giáo viên). Chương 1 Lớp 12 được chọn sẵn.
   - Bấm "Soạn nháp 10 câu tiếp theo (2 lượt AI)". AI soạn theo lô 5 câu/lượt, nên 20 lượt/ngày của gói miễn phí đủ cho khoảng 100 câu.
   - Lướt từng câu: sửa nếu cần, bấm "Xác nhận". Nếu đã xem hết các nháp trên màn hình thì bấm "Xác nhận N nháp đang hiện".
   - Theo dõi thanh **Độ phủ lỗi thực tế**: câu được xếp theo số lượt học sinh chọn sai, nên 15-20 câu đầu thường đã phủ phần lớn lỗi thực tế.

## 2. Đã làm gì

### Module 1 — Exam Autopsy & Error Intelligence

- **Error DNA tính lại mỗi lần xem** (`errorIntelligence.ts`: `buildErrorInstances`, `summarizeErrorDna`, `buildExamAutopsy`).
  - Nhãn thầy xác nhận hôm nay áp dụng ngược cho mọi bài làm cũ.
  - Không đụng vào luồng nộp bài.
  - Thầy sửa điểm/chấm lại thì kết quả tự đúng theo, vì hệ thống dùng `teacher_answer`.
- **Chỉ nhãn đã xác nhận mới ảnh hưởng chẩn đoán học sinh.** Nháp AI được lưu với `verified_by_teacher=false` để chờ duyệt.
- **Trang Gắn nhãn lỗi nhanh** `/giao-vien/gan-nhan-loi` (`TeacherRationaleQueue.tsx`):
  - Xếp câu theo số lượt chọn sai, có thanh độ phủ.
  - AI soạn nháp theo lô; xác nhận từng câu hoặc hàng loạt; có "Gợi ý nhanh".
  - Hiện số học sinh chọn từng phương án và nút xem lời giải.
- **Tab "Mổ xẻ bài thi"** trên trang kết quả của học sinh, và trong phần chẩn đoán từng lượt ở trang chi tiết học sinh của giáo viên (`ExamAutopsyPanel.tsx`). Tab này hiện:
  - điểm mất theo Bài;
  - cụm loại lỗi;
  - từng câu sai kèm mức tin cậy;
  - cảnh báo lỗi lặp lại qua nhiều đề.
- **Ngân hàng câu hỏi:**
  - Có 3 trạng thái: Đã xác nhận / Nháp AI / Chưa gắn nhãn.
  - Phần soạn nhãn dùng chung component `RationaleRowsEditor` với trang Gắn nhãn lỗi. Bố cục dạng lưới rõ ràng, thay cho bố cục cũ bị dồn hàng ngang.

### Module 2 — Hồ sơ năng lực giải trình được

- `learningState.ts` (hàm thuần) gồm:
  - độ chính xác theo 4 mức Bloom;
  - nhận định tự động theo quy tắc cố định, trả null nếu không đủ căn cứ;
  - Progress Story theo **tỉ lệ** mắc lỗi cụ thể;
  - Mastery Delta theo tuần/tháng (giờ Việt Nam);
  - hồ sơ Chương → Bài có dùng `summarizeMasteryTrend`.
- Component `LearningProfile.tsx`:
  - Học sinh xem ở trang mới **Hồ sơ năng lực** (`/hoc-sinh/ho-so-nang-luc`).
  - Giáo viên xem ở mục mới trong trang chi tiết học sinh.
  - Bấm vào Chương/Bài để xem phần giải trình.
- **Không có điểm tổng hợp kiểu 78/100**, vì một con số tổng hợp không giải trình được.

### Module 3 — Knowledge Graph & Candidate Root-Cause

- Bảng `skill_prerequisites` (migration_020) chỉ chứa cạnh giữa các Bài. Có 2 nguồn seed:
  - 11 cạnh gợi ý cho Chương 1 Lớp 12 và phần nền Lớp 11 (Đạo hàm, Giới hạn);
  - cạnh nhẹ theo thứ tự PPCT.
- `knowledgeGraph.ts`: dựng cây có hướng (chống vòng lặp, sâu tối đa 2 tầng) và tính ứng viên gốc rễ kèm bằng chứng. Câu giải thích được sinh cứng theo đúng khuôn: *"TNT nhận thấy khó khăn ở [A] có thể liên quan đến [B] — Dựa trên: X câu B (đúng p%), Y câu A (đúng q%), kèm N lỗi tương đồng đã ghi nhận…"*.
  - Luôn kèm disclaimer.
  - Không có chỗ nào in câu khẳng định tuyệt đối (có test kiểm tra điều này).
- Giao diện cây phân nhánh (`RootCauseTree.tsx`) nằm trong phần drill-down từng Bài của Hồ sơ năng lực.
- Trang **Bản đồ kiến thức** `/giao-vien/ban-do-kien-thuc`: thầy thêm/xoá Bài nền tảng và tô màu cây theo số liệu cả lớp. Ở cấp lớp chỉ vẽ cây, không đưa ứng viên gốc rễ, vì chưa có dữ liệu loại lỗi gộp theo lớp.

## 3. Quyết định thiết kế khác với tài liệu kiến trúc v2

| v2 định làm | Đã làm | Lý do |
|---|---|---|
| Ghi `student_error_instances` lúc nộp bài | Tính on-demand, bảng không dùng | Nhãn gắn sau áp dụng ngược, cho phép gắn nhãn dần theo mức ưu tiên. Không rủi ro cho luồng nộp bài. Đúng tinh thần quyết định 31/08 (không dùng snapshot). |
| `learning_health_score` ở cuối payload | Bỏ hẳn | Chỉ đạo "không đóng vai trò trung tâm"; một con số không giải trình được. |
| Progress Story so số lần thô | So **tỉ lệ** trên số câu cùng dạng đã làm | So số lần thô thì làm ít đi cũng thành "giảm lỗi" — sai. |
| Mặc định loại lỗi "Lỗi khái niệm" | Mặc định **chưa chọn**, bắt buộc chọn trước khi xác nhận | Tránh nhãn được "xác nhận" mà thầy chưa từng chọn. |

## 4. Lỗi đã phát hiện và sửa

- **AI gợi ý nhãn "không làm được":**
  - Nguyên nhân: ngoài hạn mức, lệnh gọi cũ chỉ cho 500 token đầu ra. Model có chế độ suy nghĩ dùng gần hết số token đó nên JSON bị cắt cụt.
  - Đã nâng lên 4096 token (8192 khi soạn theo lô) và báo đúng lý do lỗi.
- **Kết quả rà soát độc lập (10 lỗi, đã sửa hết):**
  - chưa dùng đáp án thầy sửa (`teacher_answer`);
  - điểm Phần 2 ở đề tính điểm tuỳ chỉnh bị lệch thang;
  - lô AI có thể ghi đè nhãn vừa xác nhận — nay dùng ON CONFLICT DO NOTHING và khoá câu đang trong lô;
  - loại lỗi mặc định bị lưu thành nhãn "đã xác nhận";
  - Progress Story so số lần thô;
  - thiếu dữ liệu thời gian bị hiểu thành "bất cẩn";
  - nhận định "phần lớn lỗi là…" dựa trên quá ít câu đã phân loại;
  - câu so sánh tuần/tháng ghi sai kỳ so sánh;
  - chạy lại migration khôi phục cạnh đã xoá;
  - phân trang có thể dừng sớm.

## 5. Giới hạn còn lại (nói rõ, không che giấu)

- Phần 2/3 không có phương án nhiễu nên chỉ nhận diện được lỗi bất cẩn qua thời gian làm; các câu còn lại hiện "Chưa xác định".
- Progress Story cần lỗi đã gắn nhãn xuất hiện ít nhất 2 lần ở 3 tuần trước và vẫn có câu cùng dạng ở 3 tuần gần đây. Giai đoạn đầu mục này sẽ trống — đó là đúng, không phải lỗi.
- Bản đồ kiến thức mới có gợi ý sẵn cho Chương 1 Lớp 12; các chương khác chỉ có cạnh nhẹ theo PPCT, thầy tự bổ sung khi cần.
- Menu giáo viên có thêm 2 mục nên trên màn hình hẹp có thể xuống 2 dòng (header tự giãn, không đè nội dung).

## 6. File

- **Mới:**
  - `supabase/migration_020_knowledge_graph.sql`
  - `src/lib/learningState.ts`, `src/lib/knowledgeGraph.ts`, `src/lib/learningIntelligence.test.ts`
  - `src/components/RationaleRowsEditor.tsx`, `ExamAutopsyPanel.tsx`, `LearningProfile.tsx`, `RootCauseTree.tsx`
  - `src/pages/TeacherRationaleQueue.tsx`, `TeacherKnowledgeMap.tsx`, `StudentLearningProfile.tsx`
- **Sửa:**
  - `src/lib/errorIntelligence.ts`, `api.ts`, `ai.ts`
  - `src/components/DistractorRationaleEditor.tsx`, `Layout.tsx`
  - `src/pages/TeacherQuestionBank.tsx`, `ResultPage.tsx`, `TeacherStudentDetail.tsx`
  - `src/App.tsx`, `src/styles.css` (khối `.li-*` chỉ dùng token màu có sẵn, không Tailwind)
