# Kết luận & Đề xuất nâng cấp tiếp theo — TNT Learning Lab

**Dựa trên:** đối chiếu "Learning Lab Proposal v2.0" với repo thực tế, sau khi đã kiểm tra lại 1 claim khoa học được trích dẫn trong tài liệu.
**Ngày:** 24/08/2026

---

## Kết luận

**Duyệt hướng đi của v2.0** (GO WITH MODIFICATIONS → GO SMALL, thu hẹp theo lớp ≤10 học sinh). Đây là bản refine hợp lý, đúng những gì audit lần trước phát hiện, không có mâu thuẫn kỹ thuật với repo hiện tại.

**Trạng thái: ĐÃ CHỐT.** 5 điểm chỉnh, câu hỏi thời gian giáo viên, cách tận dụng tài liệu sẵn có để gán dạng bài, chương thí điểm, và việc mở rộng thêm chế độ "luyện tập" — tất cả đã thống nhất, xem chi tiết bên dưới. Chỉ còn thiếu file mẫu từ bạn để bắt đầu code (mục cuối).

---

## Việc đã kiểm chứng lại

Tài liệu trích 2 nguồn khoa học nhưng để dạng mã trích dẫn bị lỗi (`citeturn0search1turn0search4`, không phải link thật) — tôi tự tra lại độc lập:

- Carpenter & Pan, "The science of effective learning with spacing and retrieval practice", *Nature Reviews Psychology*, 2022 — có thật.
- "A Meta-analytic Review of the Effectiveness of Spacing and Retrieval Practice for Mathematics Learning", *Educational Psychology Review*, 09/2025 — có thật, đúng là nghiên cứu riêng cho môn Toán.

**Kết luận:** nội dung khoa học trong tài liệu là thật, không bịa. Chỉ cần thay 2 mã trích dẫn lỗi bằng link thật (đã đính ở cuối) nếu tài liệu này được lưu lại làm căn cứ chính thức.

---

## 5 điểm cần chỉnh

**1. Retention cũng cần hiển thị sample_count, không chỉ mastery.**
Tài liệu đúng khi bắt mastery phải đi kèm "Based on 18 responses" để tránh ảo giác chính xác (mục 11), nhưng công thức Retention = Correct_delayed / Correct_baseline (mục 26) lại không được áp cùng quy tắc — mỗi retention check chỉ 3–5 câu/skill, tỉ lệ kiểu 2/3 hay 1/1 dao động rất mạnh. Áp đúng logic mà chính tài liệu đã đề ra: hiện luôn số câu làm nền cho mọi số Retention.

**2. Đổi tên "Controlled Micro-Intervention" (mục 33).**
Thiết kế thực tế là pre/post trên CÙNG một học sinh, không có nhóm đối chứng — không phải "controlled" theo đúng nghĩa khoa học. Bản thân tài liệu ở mục 34 đã tự nhắc "không biến case study nhỏ thành kết luận nhân quả tổng quát" — vậy nên đổi tên mục 33 thành "Uncontrolled within-subject pre/post" hoặc tương tự, để không tự mâu thuẫn với nguyên tắc mình vừa đặt ra 1 mục sau đó.

**3. Bảng `error_annotations` thiếu `attempt_id`.**
Tài liệu đề xuất `question_id, student_id, self_reported_error, teacher_error_label, created_at`. Học sinh có thể làm lại 1 câu ở nhiều `attempt_id` khác nhau (đề cho phép làm lại nhiều lần — xem `exam_attempts.attempt_number`) — thiếu `attempt_id` sẽ không biết lần tự-báo-cáo lỗi này thuộc lượt làm bài nào. Thêm cột này, khớp đúng pattern khoá đang dùng ở `question_responses`.

**4. Chi tiết kỹ thuật cần làm rõ ở Task 4 (Phase 1).**
"Bắt buộc gán skill + difficulty cho câu thuộc pilot" — cần chốt CƠ CHẾ bắt buộc cụ thể: chặn không cho xuất bản đề nếu câu thuộc chương pilot chưa có `question_type_id`/`difficulty` (chặn ở code), hay chỉ nhắc/checklist cho giáo viên (chặn ở quy trình)? Đây chính là chỗ đã thất bại 1 lần trước (chỉ có field, không có ràng buộc) — audit lần trước đã chỉ rõ. Đề xuất: chặn ở code cho riêng chương pilot (dễ làm, exam import đã biết topic_id của câu).

**5. Danh sách 10 skill mẫu (mục 8) có 1 mục lệch chương trình phổ thông.**
"Parameterized integrals" (tích phân có tham số) thường là dạng nâng cao/chuyên, không thuộc khung GDPT 2018 chuẩn mà ngân hàng câu hỏi hiện dùng. Không phải lỗi nghiêm trọng — tài liệu tự nói danh sách này "phải do giáo viên xác nhận" — chỉ nhắc để bạn để ý khi duyệt danh sách skill thật.

---

## Câu hỏi quan trọng nhất — chỉ bạn trả lời được

Thiết kế "human-in-the-loop" của v2.0 giải quyết đúng vấn đề audit lần trước nêu (không đủ dữ liệu để tự động phân loại lỗi) — nhưng đổi lại bằng cách tạo ra **khối lượng công việc thủ công đều đặn hàng tuần cho giáo viên**, không phải một lần làm xong:

- Gán skill + difficulty cho ~100–200 câu hỏi (một lần, lúc bắt đầu).
- Xác nhận top 2–3 lỗi tự-báo-cáo / học sinh / tuần → với 10 học sinh là tới ~20–30 lượt duyệt/tuần.
- Ghi intervention log mỗi lần can thiệp (skill, thời lượng, ghi chú) — đều đặn nếu muốn có đủ dữ liệu pre/post/retention có ý nghĩa.

Đây chính là kiểu việc mà lần trước đã "chết" (question_type_id bỏ trống vì không ai điền) — chỉ khác là lần này việc lặp lại hàng tuần thay vì một lần. Nếu bạn không có thời gian duy trì đều trong 6–8 tuần, dữ liệu sẽ thưa và toàn bộ phần "longitudinal case" (giá trị cốt lõi của Learning Lab) sẽ yếu đi đúng như đã từng xảy ra.

**Đã chốt:** bạn chỉ cam kết duy trì đều **intervention log** hàng tuần. Việc **giáo viên xác nhận lỗi tự-báo-cáo của học sinh chuyển thành tuỳ chọn** — làm khi rảnh, không phải deadline hàng tuần. Học sinh vẫn tự-báo-cáo lỗi bình thường (không đổi trải nghiệm của các em), chỉ là bước giáo viên gắn `teacher_error_label` không còn bắt buộc theo lịch — RQ3 (student self-report vs teacher diagnosis) vẫn làm được, chỉ là dữ liệu sẽ thưa hơn phần intervention/retention, và không tạo áp lực deadline hàng tuần cho bạn.

---

## Bổ sung đã chốt: dùng tài liệu sẵn có của giáo viên để tự động gán dạng bài

**Đính chính so với bản trước:** ban đầu tôi giả định tài liệu bạn có = chính các đề thi, đã ghi sẵn dạng bài trong đó. Bạn chỉnh lại đúng: đây là **2 loại tài liệu khác nhau, không trộn chung**:

- **Tài liệu dạng bài tập** (theo từng bài/chương) — CÓ phân dạng, dùng làm nguồn xây taxonomy.
- **Đề thi** (thứ thật sự upload vào hệ thống để tạo đề cho học sinh làm) — KHÔNG có phân dạng, chỉ là câu hỏi trần trụi.

Vậy không thể áp dụng cách "đọc dạng bài trực tiếp từ file đang import" như bản trước viết — đề thi không mang thông tin đó. Cần tách thành **2 bước riêng**:

**Bước A — Xây taxonomy (chạy 1 lần/chương, từ tài liệu dạng bài tập):**
Nạp các file "tài liệu dạng bài tập" của bạn qua AI (đi qua đúng cơ chế trích `topic_name` đang có, mở rộng thêm 1 bước đọc cấu trúc dạng bài trong CHÍNH các file này — vì các file này có phân dạng thật) → sinh ra danh sách `question_types` ứng viên cho từng chương (tên + mô tả ngắn, có thể kèm 1-2 câu ví dụ). Giáo viên duyệt lại danh sách này 1 lần. Kết quả: bảng `question_types` có nội dung THẬT, không rỗng như hiện tại.

**Bước B — Phân loại đề mới (mỗi lần upload 1 đề, dùng taxonomy đã có từ Bước A):**
Khi bạn upload 1 đề bình thường (không có phân dạng), hệ thống dùng `suggestQuestionType()` (đã viết sẵn trong `ai.ts`, hiện chưa được gọi ở luồng nhập đề) — so từng câu với danh sách `question_types` đã xây ở Bước A, chọn ra dạng gần nhất, ghi vào `ai_suggested_type_id`. Giáo viên xác nhận/sửa từng câu, y hệt cơ chế đang chạy cho chương. Độ chính xác của bước này phụ thuộc trực tiếp vào chất lượng Bước A — taxonomy càng có mô tả/ví dụ rõ, AI càng đoán chuẩn.

- Có sẵn skill `tong-hop-de-toan` trong hệ thống làm đúng việc "gộp nhiều tài liệu nguồn + tự phân loại theo dạng bài/mức độ tư duy" — có thể dùng để chuẩn hoá các file "tài liệu dạng bài tập" trước khi tôi xử lý ở Bước A, nếu chúng đang rải rác nhiều định dạng khác nhau.

**Quyết định phạm vi:** Bước A (xây taxonomy) làm rộng cho TẤT CẢ chương luôn vì rẻ và không đụng tới đề thi thật. Bước B (phân loại đề upload) áp dụng ngay khi bạn upload bất kỳ đề nào, không giới hạn chương. Nhưng phần THEO DÕI CHỦ ĐỘNG của Learning Lab (mastery_snapshots, retention check, dashboard "student case") vẫn **giữ nguyên phạm vi chương pilot** như đã chốt (xem mục chương pilot bên dưới) — có taxonomy đầy đủ hơn không có nghĩa nên mở rộng luôn phạm vi theo dõi, tránh quay lại rủi ro ôm quá rộng đã bị audit lần đầu cảnh báo.

---

## Bổ sung đã chốt: chương thí điểm đổi sang Chương 1 + Chương 2 (lớp 12, học kỳ 1)

Lý do bạn đưa ra hợp lý: đang là học kỳ 1, 2 chương đang dạy thật là chương 1 và chương 2 — pilot nên bám theo tiến độ dạy thật thay vì chọn chương đã xong (Nguyên hàm & Tích phân, chương 4, thường học kỳ 2). Đã xác nhận: đây là 2 chương **lớp 12 đã có sẵn** trong bảng `topics` (migration_005), không cần tạo dữ liệu mới:

- **Chương 1:** "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số".
- **Chương 2:** "Véc tơ và hệ trục toạ độ trong không gian".

**1 lưu ý kỹ thuật, không phải chặn:** pilot lần này rộng hơn 1 chương (2 chương cùng lúc) trong khi audit lần trước khuyến nghị bắt đầu hẹp. Đề xuất triển khai **so le**: bật đầy đủ theo dõi (mastery_snapshots, intervention log, dashboard) cho Chương 1 trước, Chương 2 nối vào ngay sau khi Bước 1-2 tuần quy trình intervention log đã thành thói quen — vẫn tính là "1 phạm vi pilot" theo đúng học kỳ, chỉ lệch thời điểm bắt đầu vài tuần để không bị quá tải cùng lúc lúc mới làm quen quy trình. Nếu bạn thấy không cần so le, làm song song cả 2 luôn cũng được — đây chỉ là gợi ý giảm rủi ro, quyết định vẫn ở bạn.

---

## Bổ sung đã chốt: mở rộng thêm chế độ "luyện tập" (song song với "thi")

Đã chốt: luyện tập = **ngân hàng câu hỏi theo dạng bài**, không phải đọc lại nguyên file tài liệu gốc. Học sinh chọn chương + dạng bài, hệ thống lấy ngẫu nhiên câu hỏi đã tách sẵn (text/LaTeX) từ ngân hàng, chấm ngay từng câu — không giới hạn giờ, không giám sát (proctoring), khác hẳn "thi" (`exams`/`exam_attempts`).

**Vì sao chọn được nhanh:** cách này tái dùng gần như toàn bộ hạ tầng đang có — logic chọn ngẫu nhiên đã có sẵn ở `leitner.ts` (`pickRandomForSession`), UI hiển thị câu hỏi/chấm đáp án đã có ở `ExamTakingPage.tsx`/`StudentReviewPage.tsx`, không cần lưu thêm file gốc lên storage. Việc cần làm mới chỉ là 1 trang "luyện tập tự do" lọc theo `topic_id` + `question_type_id` (thay vì chỉ lấy từ `wrong_answer_journal` như ôn tập kiểu Leitner hiện tại), cộng thêm có thể 1 bảng log nhẹ nếu muốn tính hành vi luyện tập vào phân tích sau này (không bắt buộc ngay).

**Điểm cộng bất ngờ:** vì Bước A (xây taxonomy) đã đọc "tài liệu dạng bài tập" của bạn để tách dạng bài, các câu hỏi TRONG chính tài liệu đó (đã có sẵn nhãn dạng bài do chính cấu trúc file, không cần AI đoán) có thể nạp thẳng vào ngân hàng câu hỏi làm nội dung luyện tập ban đầu — không cần đợi giáo viên gán tay. Vậy Bước A giờ phục vụ 2 việc cùng lúc: xây taxonomy CHO Bước B, và cung cấp luôn kho câu hỏi luyện tập ban đầu. Đây là lý do nên xếp việc này **sau khi Bước A/B ổn định** (Phase 2), không làm trước — làm trước sẽ phải tách lại nội dung 2 lần.

---

## Bổ sung đã chốt: dung lượng lưu trữ (storage)

Đã kiểm tra code thực tế: hiện **không có file gốc nào (Word/PDF) được lưu lên server**. Khi bạn upload đề hoặc tài liệu, file được đọc trực tiếp trên trình duyệt rồi gửi AI tách câu hỏi — xong bỏ file gốc, chỉ giữ text/LaTeX đã tách trong database. Bucket lưu trữ duy nhất đang dùng (`question-images`) chỉ chứa ảnh minh hoạ từng câu hỏi.

Vì chế độ luyện tập chọn theo hướng "ngân hàng câu hỏi" (không đọc lại file gốc), nhu cầu lưu trữ **không tăng đáng kể** so với hiện tại — vẫn chỉ là text/LaTeX + ảnh minh hoạ, không phải file PDF/Word nguyên bản.

Giá Supabase hiện tại (nguồn: trang giá chính thức supabase.com/pricing): gói Free = 1GB storage kèm theo, gói Pro ($25/tháng) = 100GB kèm theo, vượt thì $0.0213/GB. Với khối lượng bạn mô tả (nhiều tài liệu dạng bài tập, tách ra thành text), 100GB của gói Pro dư sức dùng nhiều năm. Cần kiểm tra 1 việc: **nếu hiện đang ở gói Free (1GB), nên nâng lên Pro trước khi mở rộng** — 1GB rất dễ hết nếu sau này có nhu cầu lưu ảnh minh hoạ nhiều hơn. Nếu đã ở Pro rồi thì không cần làm gì thêm.

---

## Nếu duyệt: phạm vi Phase 1 chốt lại (khớp đúng tên bảng/cột thật trong repo)

1. Chuẩn hoá event còn thiếu trong `answer_events`/`question_view_events` (vd. đánh dấu rõ QUESTION_SUBMITTED nếu cần) — việc nhỏ.
2. Chương pilot cho phần THEO DÕI CHỦ ĐỘNG (mastery/retention/dashboard): **Chương 1 "Ứng dụng đạo hàm..."** và **Chương 2 "Véc tơ và hệ trục toạ độ trong không gian"** (lớp 12, đã có sẵn trong `topics`, migration_005, không cần tạo mới) — đổi từ "Nguyên hàm & Tích phân" theo tiến độ học kỳ 1 thật. Khuyến nghị bật Chương 1 trước, Chương 2 nối sau 1-2 tuần (xem mục "chương thí điểm" ở trên).
3. **Bước A:** viết luồng đọc riêng cho "tài liệu dạng bài tập" (khác luồng nhập đề thi) — trích tên + mô tả dạng bài theo từng chương, tạo `question_types` ứng viên, giáo viên duyệt 1 lần. Áp dụng cho tất cả chương ngay khi có file mẫu.
4. **Bước B:** nối `suggestQuestionType()` (đã có sẵn, chưa được gọi) vào luồng `TeacherExamImport.tsx` — mỗi câu trong đề mới upload được AI gợi ý `ai_suggested_type_id` dựa trên taxonomy từ Bước A. Riêng chương pilot: bắt buộc giáo viên xác nhận `question_type_id` + `difficulty` trước khi xuất bản đề (chương khác thì có gợi ý, không bắt buộc xác nhận ngay).
5. Bảng mới `mastery_snapshots` (student_id, skill_id, computed_at, mastery, sample_count, confidence) — tái dùng công thức đã có trong `diagnosis.ts`, không viết công thức mới.
6. Cột mới `review_sessions.purpose` ('remediation' | 'retention_check') + logic chọn câu retention (ưu tiên cùng skill, khác dạng bề mặt, không lấy nguyên câu cũ).
7. Bảng mới `intervention_events` (student_id, skill_id, created_at, intervention_type, duration, teacher_note) — **bắt buộc**, đây là việc bạn đã cam kết duy trì hàng tuần.
8. Bảng mới `error_annotations` (student_id, question_id, **attempt_id**, self_reported_error, teacher_error_label, created_at) — học sinh tự-báo-cáo vẫn ghi bình thường (`self_reported_error`), nhưng `teacher_error_label` là **tuỳ chọn**, không có deadline hàng tuần — UI không nhắc/ép giáo viên phải xử lý theo lịch.
9. Dashboard giáo viên dạng "student case" (mastery theo skill + sample_count + confidence + trend + retention 7d) thay vì chỉ "class average" — UI mới, không đổi kiến trúc.

Không động tới: Component "Error taxonomy tự động", BKT/IRT, Learning Velocity, mọi ML — giữ nguyên quyết định hoãn.

**Phase 2 (sau khi Bước A/B ổn định):** trang "luyện tập tự do" — lọc câu hỏi theo `topic_id` + `question_type_id`, lấy ngẫu nhiên (tái dùng logic `pickRandomForSession` của `leitner.ts`), chấm ngay từng câu, không giới hạn giờ/không giám sát. Không làm trước Phase 1 vì phụ thuộc trực tiếp vào taxonomy từ Bước A.

---

## Việc cần từ bạn để bắt đầu code

Cần 2 loại file mẫu, cùng 1 chương để tôi test được cả pipeline đầu-cuối:

1. **1 file "tài liệu dạng bài tập"** (đã phân dạng) — để tôi xem cách bạn trình bày dạng bài trong đó (tiêu đề rõ "Dạng 1:..." hay chỉ ngầm hiểu, có mô tả/ví dụ đi kèm mỗi dạng không) — dùng để viết Bước A.
2. **1 file đề thi bình thường** (chưa phân dạng, đúng loại bạn hay upload) — dùng để test Bước B: xem AI gợi ý dạng bài cho từng câu trong đề này có khớp với taxonomy xây từ file (1) không.

Gửi khi bạn sẵn sàng, tôi bắt đầu chỉnh `ai.ts` ngay.

---

## Nguồn đã kiểm chứng

- [The science of effective learning with spacing and retrieval practice — Nature Reviews Psychology](https://www.nature.com/articles/s44159-022-00089-1)
- [A Meta-analytic Review of the Effectiveness of Spacing and Retrieval Practice for Mathematics Learning — Educational Psychology Review (2025)](https://link.springer.com/article/10.1007/s10648-025-10035-1)
