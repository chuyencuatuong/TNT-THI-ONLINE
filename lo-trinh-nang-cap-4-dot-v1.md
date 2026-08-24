# Lộ trình nâng cấp TNT Thi Online — 4 đợt

**Trạng thái: TẠM HOÃN (24/08/2026)** — bạn quyết định dừng lại, chưa rõ thời điểm quay lại. Không phải do kế hoạch có vấn đề — lý do gần nhất là gặp lỗi quota AI (đã sửa xong, xem mục "Tình trạng Đợt 1" bên dưới). Khi nào muốn tiếp tục, đọc lại mục đó là đủ, không cần làm lại từ đầu.
**Ngày:** 24/08/2026

## Tình trạng Đợt 1 (đã code, đã dừng ở đây)

- Backend (`ai.ts`): hàm trích taxonomy dạng bài từ PDF/Word — đã xong, build + test sạch (182/182).
- Trang "Nạp dạng bài" (giáo viên) — đã xong, đã nối route + menu.
- Đã thử với 2 file mẫu thật, gặp lỗi quota Gemini free-tier (`gemini-3.7-flash` chỉ 20 lượt/ngày) — đã sửa: đổi model mặc định sang `gemini-2.5-flash` (hạn mức cao hơn hẳn).
- **Chưa xác nhận được:** bản đổi model mới đã chạy thử thành công trên tài liệu mẫu thật hay chưa (dừng lại đúng lúc chuẩn bị thử lại).
- Đợt 2, 3, 4: chưa code gì.

Muốn tiếp tục: chỉ cần thử lại trang "Nạp dạng bài" với model mới, báo kết quả, rồi làm tiếp Đợt 2.

Tổng hợp lại toàn bộ quyết định đã chốt trong các trao đổi trước (chi tiết lý do/căn cứ kỹ thuật xem file `quyet-dinh-nang-cap-learning-lab-v1.md`). File này chỉ tập trung vào: **làm gì, đợt nào, giao diện đổi ra sao, nghiệm thu bằng cách nào.**

Nguyên tắc xuyên suốt: mỗi đợt chạy được độc lập, nghiệm thu xong mới sang đợt sau — không gộp chung rồi mới thử một lần.

---

## Tóm tắt 4 đợt

| Đợt | Tên | Phụ thuộc | Vì sao xếp thứ tự này |
|---|---|---|---|
| 1 | Xây taxonomy dạng bài (Bước A) | Không | Nền tảng cho đợt 2 và đợt 4 |
| 2 | AI gợi ý dạng bài khi nhập đề (Bước B) | Đợt 1 | Cần taxonomy thật để AI so khớp |
| 3 | Theo dõi chủ động — Chương 1 & 2 | Đợt 2 (riêng chương pilot) | Cần câu hỏi đã gán dạng bài mới tính mastery đúng |
| 4 | Luyện tập tự do | Đợt 1 | Chỉ cần taxonomy + ngân hàng câu hỏi, không phụ thuộc đợt 2, 3 |

---

## Đợt 1 — Xây taxonomy dạng bài (Bước A)

**Bước chuẩn bị tuỳ chọn (thủ công, không đụng code) — tận dụng gói Gemini Pro (chat) trong 2 tháng còn hạn:**
Với tài liệu dài/trình bày lộn xộn/file scan chất lượng kém, dán nội dung vào Gemini Pro (chat) trước để có bản mô tả dạng bài rõ ràng, sạch sẽ hơn — đầu vào tốt thì Đợt 1 (chạy tự động bằng Gemini API free-tier trong web) trích taxonomy chính xác hơn. Prompt gợi ý:

> Bạn là trợ lý biên tập tài liệu Toán học. Tôi sẽ dán nội dung 1 tài liệu "dạng bài tập" của chương [tên chương]. Hãy giúp tôi:
> 1. Liệt kê rõ từng dạng bài xuất hiện trong tài liệu, đặt tên ngắn gọn như cách giáo viên hay gọi trong lớp.
> 2. Với mỗi dạng, viết 1-2 câu mô tả đặc điểm nhận diện (làm sao biết 1 bài toán thuộc dạng này).
> 3. Với mỗi dạng, ghi lại số thứ tự/trang các bài ví dụ thuộc dạng đó trong tài liệu gốc (nếu có đánh số).
> 4. Giữ nguyên công thức toán ở dạng LaTeX nếu có, không diễn giải lại bằng lời.
> 5. Nếu tài liệu không có tiêu đề "Dạng..." rõ ràng, tự suy luận và gộp nhóm các bài có cách giải giống nhau thành 1 dạng rồi đặt tên.
> Xuất kết quả dạng danh sách: Dạng 1: [tên] — [mô tả] — [ví dụ: bài số...].

Việc này hoàn toàn tuỳ chọn, làm khi rảnh trong 2 tháng còn hạn gói — hết hạn cũng không ảnh hưởng gì đến Đợt 1, vì pipeline chính (bên dưới) không phụ thuộc vào nó, chỉ là bước làm sạch đầu vào thủ công trước khi đưa vào hệ thống.

**Việc làm (backend/logic):**
Đọc từng file "tài liệu dạng bài tập" của bạn qua AI, trích ra danh sách dạng bài theo chương (tên + mô tả ngắn + ví dụ nếu có), ghi vào bảng `question_types` (hiện đang rỗng).

**Giao diện Giáo viên (mới):**
Một màn hình "Nạp tài liệu dạng bài tập" — upload file, xem danh sách dạng bài AI trích ra, duyệt từng dạng (xác nhận / sửa tên / xoá) trước khi lưu chính thức. Có thể đặt như 1 tab trong trang Ngân hàng câu hỏi hiện có.

**Giao diện Học sinh:** Không đổi — đây là bước xử lý nội bộ.

**Nghiệm thu:**
- Upload 1 file tài liệu dạng bài tập mẫu → danh sách dạng bài AI trích ra khớp với nội dung thật trong file.
- Duyệt/sửa/xoá từng dạng hoạt động đúng.
- Sau khi duyệt, `question_types` có dữ liệu thật theo đúng chương của file đã nạp.

---

## Đợt 2 — AI gợi ý dạng bài khi nhập đề (Bước B)

**Việc làm (backend/logic):**
Nối `suggestQuestionType()` (đã viết sẵn, chưa được gọi) vào luồng nhập đề (`TeacherExamImport.tsx`) — mỗi câu trong đề mới upload được so với taxonomy từ Đợt 1, ghi gợi ý vào `ai_suggested_type_id`. Riêng Chương 1 và Chương 2 (chương pilot): chặn xuất bản đề nếu còn câu thiếu dạng bài/mức độ.

**Giao diện Giáo viên:**
- Màn hình duyệt đề sau khi nhập: mỗi câu hiển thị gợi ý dạng bài kèm nút "Xác nhận" / "Bỏ qua" — giống hệt cách gợi ý chương đang hiển thị hiện tại.
- Ngân hàng câu hỏi: thêm cột + nút xác nhận dạng bài AI gợi ý (song song cột chương đã có), thêm nút "Phân loại lại dạng bài bằng AI" cho các câu cũ chưa có dạng.
- Riêng Chương 1, 2: banner cảnh báo + chặn nút "Xuất bản đề" nếu còn câu thiếu dạng bài/mức độ.

**Giao diện Học sinh:** Không đổi.

**Nghiệm thu:**
- Upload 1 đề thường (chưa phân dạng) → mỗi câu có gợi ý dạng bài hợp lý so với taxonomy Đợt 1.
- Xác nhận/sửa gợi ý hoạt động đúng.
- Thử xuất bản 1 đề thuộc Chương 1 hoặc 2 còn thiếu dạng bài → bị chặn đúng như thiết kế; đề chương khác thì không bị chặn.

---

## Đợt 3 — Theo dõi chủ động (Chương 1 & Chương 2)

**Việc làm (backend/logic):**
- Bảng `mastery_snapshots` (mastery theo skill/học sinh, có `sample_count` + độ tin cậy).
- Cột `review_sessions.purpose` + logic chọn câu cho retention check.
- Bảng `intervention_events` (bắt buộc ghi — việc bạn cam kết duy trì hàng tuần).
- Bảng `error_annotations` (có `attempt_id`; `teacher_error_label` là tuỳ chọn, không deadline).
- Chuẩn hoá vài event còn thiếu trong `answer_events`/`question_view_events`.

**Giao diện Giáo viên:**
- Dashboard "hồ sơ từng học sinh" mới (mở rộng `TeacherStudentDetail.tsx`): mastery theo từng skill kèm số câu làm nền + độ tin cậy + xu hướng + retention 7 ngày — thay vì chỉ điểm trung bình lớp như hiện tại.
- Form ghi intervention log — **cố tình làm gọn nhất có thể** vì đây là việc làm đều hàng tuần: chọn học sinh + skill + loại can thiệp + thời lượng + ghi chú ngắn, dạng popup ngay trong trang hồ sơ học sinh, không quá 1-2 phút/lần nhập.
- Khu vực xem lỗi học sinh tự báo cáo, gắn nhãn giáo viên nếu rảnh — không có badge nhắc/deadline.

**Giao diện Học sinh (mới):**
Hiện **chưa có** nơi nào để học sinh tự báo cáo lý do làm sai — cần thêm vào trang xem kết quả (`ResultPage.tsx`): mỗi câu sai, cho học sinh chọn nhanh 1 lý do trong danh sách có sẵn (vd. "hiểu sai đề", "sai công thức", "tính nhầm", "không kịp giờ"...) — dạng chọn nhanh (chip/radio), không bắt gõ chữ, để học sinh thực sự dùng thay vì bỏ qua.

**Nghiệm thu:**
- Chạy thật 1–2 tuần với vài học sinh ở Chương 1 (rồi Chương 2 sau, xem mục lưu ý so le ở file quyết định).
- Mastery/retention tính ra hợp lý, khớp cảm nhận thực tế của bạn về học sinh.
- Ghi intervention log không mất quá 1-2 phút/lần.
- Học sinh thực sự bấm chọn lý do sai (không bị bỏ qua vì rườm rà).
- Dashboard hồ sơ học sinh hiển thị đúng, dễ đọc hơn bảng điểm trung bình cũ.

---

## Đợt 4 — Luyện tập tự do

**Việc làm (backend/logic):**
Trang luyện tập mới: lọc câu hỏi theo chương + dạng bài, lấy ngẫu nhiên (tái dùng logic đã có ở `leitner.ts`), chấm ngay từng câu — không giới hạn giờ, không giám sát. Nạp thêm câu hỏi có sẵn nhãn dạng bài (trích từ tài liệu Đợt 1) vào ngân hàng làm nội dung luyện tập ban đầu.

**Giao diện Học sinh (mới):**
- Mục điều hướng mới "Luyện tập" (bên cạnh "Thi"/"Ôn tập" hiện có).
- Màn hình chọn chương + dạng bài muốn luyện.
- Màn hình làm bài kiểu chấm ngay từng câu — khác hẳn giao diện thi hiện tại (không đếm giờ, không cảnh báo giám sát, biết đúng/sai ngay sau mỗi câu).

**Giao diện Giáo viên:**
Không bắt buộc ở đợt này. Có thể để đợt sau nếu muốn xem tần suất học sinh luyện tập theo chương/dạng.

**Nghiệm thu:**
- Học sinh chọn 1 chương/dạng, làm vài câu, thấy chấm đúng/sai ngay từng câu.
- Đổi chương/dạng lấy được bộ câu khác.
- Không bị giới hạn giờ, không hiện cảnh báo giám sát trong luyện tập.

---

## Ghi chú chung (đã chốt ở các trao đổi trước, nhắc lại cho đủ)

- Chương pilot Đợt 3: Chương 1 ("Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số") + Chương 2 ("Véc tơ và hệ trục toạ độ trong không gian") — cả hai lớp 12, đã có sẵn trong hệ thống.
- Gói Supabase: đang ở Free, đã đánh giá đủ dùng trong ngắn-trung hạn với quy mô hiện tại — không cần thay đổi, chỉ cần bạn thỉnh thoảng kiểm tra dung lượng DB qua dashboard.
- Không xây cơ chế tự động xoá/dọn dữ liệu — dữ liệu chi tiết (answer_events, question_view_events) cần giữ nguyên để các tính năng chẩn đoán hoạt động đúng.
- Không động tới: error taxonomy tự động, BKT/IRT, Learning Velocity — giữ nguyên quyết định hoãn.

---

## Việc cần từ bạn

1. Duyệt lộ trình 4 đợt này (hoặc góp ý chỉnh thứ tự/nội dung).
2. Gửi 2 file mẫu để bắt đầu Đợt 1: (a) 1 file "tài liệu dạng bài tập" đã phân dạng, (b) 1 file đề thi thường chưa phân dạng — cùng 1 chương để test xuyên suốt Đợt 1 → Đợt 2.
