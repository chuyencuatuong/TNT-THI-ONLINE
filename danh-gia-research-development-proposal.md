# Đánh giá đề xuất "Research Development Proposal v1.0"

**Người đánh giá:** AI đang phát triển TNT-THI-ONLINE
**Ngày:** 24/08/2026
**Phương pháp:** Đọc trực tiếp schema.sql, 10 file migration, và toàn bộ code trong `src/lib` liên quan (diagnosis.ts, chapterStats.ts, leitner.ts, ai.ts, api.ts) — không suy đoán, mọi kết luận dưới đây trích dẫn đúng dòng code/comment thực tế.

---

## Kết luận nhanh

**Khuyến nghị: GO WITH MODIFICATIONS.**

Trả lời thẳng câu hỏi của bạn: **không nên triển khai cả 5 hạng mục cùng lúc.** Lý do nằm ở phần đối chiếu bên dưới — 3 trong 5 hạng mục phụ thuộc trực tiếp vào 1 hạng mục còn lại (Knowledge Map), mà hạng mục đó lại là cái duy nhất **đã từng thử và bị bỏ giữa chừng** trong lịch sử phát triển thực tế của chính dự án này. Làm cả 5 song song nghĩa là xây 3 tầng trên một nền chưa vững.

Thứ tự đề xuất: **1 → 2 (thu hẹp phạm vi) → 3 → 5 → 4 (thu hẹp mạnh, có thể lùi hẳn)**.

---

## 1. Đối chiếu 5 hạng mục với repo thực tế

| # | Hạng mục | Trạng thái | Bằng chứng |
|---|----------|-----------|------------|
| 1 | Research Data Layer | **EXISTS** (phần lớn) | Bảng `answer_events` (select/change/clear, answer_value, timestamp) + `question_view_events` (enter/leave) đã ghi đúng loại sự kiện đề xuất (QUESTION_OPEN, ANSWER_SELECTED/CHANGED, EXAM_SUBMITTED). Không cần bảng mới. |
| 2 | Knowledge Map | **PARTIAL — và đã từng bị bỏ dở 1 lần** | Xem mục 2 bên dưới, đây là phát hiện quan trọng nhất. |
| 3 | Student Learner Profile | **PARTIAL** | `diagnosis.ts` đã tính mastery per-topic theo công thức tương tự đề xuất (điểm + thời gian + số lần đổi đáp án), nhưng chỉ tính **tại thời điểm 1 lượt thi**, không lưu lại thành chuỗi thời gian — không có "M(t)" như Component 3/5 cần. |
| 4 | Error & Knowledge Gap Diagnosis | **PARTIAL, khác bản chất** | Đã có nhãn mức độ (`vung/chua_chac_chan/co_lo_hong/mat_goc`) dựa trên **tỉ lệ đúng**, chưa có phân loại **loại lỗi** (CONCEPTUAL/PROCEDURAL/ARITHMETIC...) như đề xuất — đây là 2 việc khác nhau, xem mục 4. |
| 5 | Longitudinal Progress & Retention | **Progress: derivable nhưng chưa lưu. Retention: MISSING, cơ chế khác hẳn cái đang có** | Xem mục 5. |

---

## 2. Knowledge Map — lý do đây là nút thắt, không phải bằng suy đoán

Đây là phát hiện quan trọng nhất của đợt review này, nên tôi trích nguyên văn 2 bằng chứng:

**Bằng chứng A** — comment trong `migration_007_chuong_thu_muc_drive.sql` (đã chạy trong production từ trước):

> "Tự nhận CHƯƠNG (không phải 'dạng bài') khi nhập đề — thêm cột topic_id [...] vì AI gợi ý CHƯƠNG ổn định hơn 'dạng bài' (chi tiết vẫn suy ra qua question_types.topic_id như cũ, không đổi)."

Nói cách khác: hệ thống ban đầu định phân loại câu hỏi theo `question_types` (đúng là "Skill" trong đề xuất), nhưng **việc đó không chạy được trong thực tế**, nên team đã thêm hẳn 1 cột `topic_id` trực tiếp trên bảng `questions` để phân loại thô hơn (Chương) làm phương án dự phòng.

**Bằng chứng B** — comment trong `chapterStats.ts`:

> "'dạng bài chi tiết' (question_types) chưa được giáo viên nhập/dùng thật [...] nếu gộp theo dạng bài [...] biểu đồ dashboard này nhiều khả năng sẽ trống trơn vì hầu hết câu hỏi chưa có question_type_id."

**Bằng chứng C** — tôi kiểm tra trực tiếp `TeacherExamImport.tsx` (nơi giáo viên nhập đề — luồng chính để đưa câu hỏi vào ngân hàng, qua AI đọc file Word/PDF): cả 3 nơi tạo câu hỏi mới đều set cứng:

```ts
question_type_id: null,
difficulty: null,
```

Và trong `ai.ts`, hàm `suggestQuestionType()` (gợi ý dạng bài bằng AI) **tồn tại nhưng không được gọi ở luồng nhập đề hàng loạt** — chỉ được gọi ở form sửa từng câu một (`QuestionEditorForm.tsx`), một luồng phụ ít dùng hơn nhiều so với nhập cả đề.

**Kết luận:** 2 trong 3 trường metadata mà Component 2 cần (`question_type_id` = Skill, `difficulty` = cognitive_level) đều **không được điền bởi con đường nhập liệu chính**. Đây không phải vấn đề kỹ thuật (schema đã có sẵn cả 2 cột) — đây là vấn đề **quy trình vận hành**: phải sửa luồng import để bắt buộc gán, hoặc chấp nhận một đợt gán tay tốn công của giáo viên. Nếu Component 2 làm y hệt lần trước (thêm field rồi hy vọng được điền), khả năng cao sẽ lặp lại kết quả cũ.

---

## 3. Student Learner Profile

Công thức mastery đề xuất (`M_s = Σ(w_i × correct_i) / Σw_i`) không có gì mới về mặt kỹ thuật — `diagnoseTopic()` trong `diagnosis.ts` đã làm gần giống vậy (trung bình có trọng số theo tỉ lệ đúng, cộng thêm tín hiệu thời gian/đổi đáp án). Cái thiếu là:

- Chưa có bảng lưu **snapshot theo thời gian** (đề xuất gọi là `knowledge_states`) — hiện tại mọi thứ tính lại từ đầu mỗi lần xem, không có "lịch sử mastery" để vẽ đường xu hướng M(t).
- Learning Velocity (`ΔM/Δt`) không tính được nếu không có snapshot.

Đây là phần **rẻ nhất trong 4 hạng mục còn lại** nếu Component 2 đã ổn định, vì công thức đã có, chỉ cần thêm 1 bảng lưu kết quả tính theo định kỳ.

---

## 4. Error & Knowledge Gap Diagnosis — cảnh báo cụ thể

Đề xuất muốn phân loại lỗi theo **loại** (CONCEPTUAL/PROCEDURAL/ARITHMETIC/READING/STRATEGY/CARELESS). Đây là bài toán khác hẳn với "mastery thấp ở dạng bài nào" mà `diagnosis.ts` đang làm. Để phân loại được loại lỗi, hệ thống cần biết **học sinh đã làm gì sai**, không chỉ **đúng/sai bao nhiêu điểm** — dữ liệu hiện tại (`final_answer`, `score`) không mang thông tin này.

Hai cách duy nhất để có dữ liệu đó:

1. AI đọc từng đáp án sai + so với lời giải (`solution_latex` đã có sẵn cho một số câu) để suy ra loại lỗi — tốn thêm 1 lệnh gọi AI mỗi câu sai, cần một đợt validate với giáo viên xem AI phân loại đúng không (proposal tự yêu cầu điều này ở Success Criteria 13.2), và **phụ thuộc vào có lời giải chi tiết hay không** — hiện `solution_latex` cũng không bắt buộc phải có.
2. Giáo viên tự gán loại lỗi thủ công — không khả thi với khối lượng câu hỏi thực tế.

Không có cách nào trong 2 cách này là "làm với disruption tối thiểu". Đây là hạng mục duy nhất trong 5 cái mà tôi nghĩ nên **lùi hẳn ra khỏi Pilot**, giữ nguyên hệ thống nhãn mastery hiện có (đã hoạt động, đã có test, đã hiển thị ở `ResultPage`) thay vì xây thêm taxonomy lỗi mới.

---

## 5. Longitudinal Progress & Retention

Progress (theo dõi mastery qua các đợt thi) — làm được, phụ thuộc Component 3.

Retention (test lại sau 3/7/14 ngày) — đây là tính năng **mới hoàn toàn**, không phải mở rộng cái đang có. Tôi kiểm tra kỹ `leitner.ts` và `StudentReviewPage.tsx`: cơ chế "ôn tập" hiện tại chỉ đưa **câu làm SAI** trở lại cho học sinh làm lại đến khi đúng 3 buổi liên tiếp — đây là cơ chế **khắc phục** (remediation), không phải cơ chế **kiểm tra suy giảm trí nhớ** (retention testing, đưa lại câu đã làm ĐÚNG sau một khoảng thời gian để xem còn nhớ không). Hai việc khác bản chất dù cùng dùng lại "buổi ôn tập".

Tin tốt: hạ tầng `review_sessions`/`review_session_answers` đã có sẵn và tái dùng được — chỉ cần thêm logic chọn câu (thay vì chỉ lấy từ nhật ký câu sai, thỉnh thoảng chèn thêm câu đã đúng quá N ngày) + 1 cột phân biệt mục đích buổi ôn ('remediation' vs 'retention_check'). Không cần bảng hoàn toàn mới.

---

## 6. Trả lời 10 câu hỏi trong tài liệu (mục 21)

1. **Đã có gì?** Research Data Layer gần như trọn vẹn. Khung phân loại 2 tầng Chương→Dạng bài. Learner mastery heuristic (tính tại chỗ, chưa lưu lịch sử). Leitner remediation. AI hỗ trợ gán chương lúc nhập đề (đã chạy), AI gán dạng bài (đã viết, chưa được gọi trong luồng chính).
2. **Cái gì partial?** Knowledge Map (2/3 field không được điền bởi luồng nhập liệu chính). Learner Profile (công thức có, lưu trữ theo thời gian chưa có). Error Diagnosis (có ở mức "dạng bài", chưa có ở mức "loại lỗi").
3. **Cái gì thiếu thật sự?** Bảng lưu snapshot mastery theo thời gian. Cơ chế retention-check (khác remediation). Taxonomy loại lỗi + dữ liệu để suy ra nó. Quy trình bắt buộc gán dạng bài/độ khó lúc nhập đề.
4. **Hạng mục nào disruption tối thiểu?** Component 1 (gần như xong), Component 5 phần retention (tái dùng review_sessions), Component 3 (thêm 1 bảng snapshot). Component 2 và 4 đều đòi thay đổi quy trình vận hành (nhập liệu/gán nhãn), không chỉ code.
5. **Cần đổi schema gì thật sự?** Xem bảng ở mục 7 — tối thiểu 1 bảng mới (`mastery_snapshots`), 1 cột thêm vào `review_sessions` (purpose), 0 bảng mới bắt buộc cho Component 1, 2, 4 nếu thu hẹp phạm vi như đề xuất.
6. **Metric nào đáng ngờ về mặt thống kê?** Learning Velocity và time-decay λ trong công thức mastery đòi hỏi đủ mẫu theo thời gian mới có ý nghĩa — với quy mô "nhóm nhỏ luyện thi" (không rõ đang có bao nhiêu học sinh hoạt động thật — cần bạn xác nhận), số lượt thi/học sinh/tuần có thể không đủ để con số này ổn định, dễ nhảy loạn nếu học sinh chỉ thi 1-2 lần/tuần. Nên hoãn tối ưu λ như chính tài liệu đã tự đề xuất (mục 7.3).
7. **Dữ liệu nào đang có hỗ trợ được?** `answer_events`, `question_view_events`, `question_responses` (time/change_count), `wrong_answer_journal`, `topics.grade/chapter` đã seed sẵn 6 chương Toán 12 — trùng khớp domain pilot đề xuất ("Nguyên hàm & Tích phân" = Chương 4 đã có sẵn trong DB).
8. **Dữ liệu nào đang thiếu?** Skill-level label ổn định cho phần lớn ngân hàng câu hỏi, độ khó (difficulty) cho phần lớn câu hỏi, dữ liệu loại lỗi, lịch sử mastery theo thời gian.
9. **Pilot có khả thi về mặt khoa học/kỹ thuật không?** Khả thi **nếu thu hẹp phạm vi đúng như đề xuất** (1 chương, không ML, không BKT/IRT) VÀ giải quyết được nút thắt Component 2 bằng thay đổi quy trình (không chỉ thêm field). Nếu giữ nguyên cả 5 hạng mục ở độ rộng như mô tả, rủi ro lặp lại kết quả "field có nhưng rỗng" như lần trước là có thật, có bằng chứng.
10. **Nên tiếp tục không?** Có — GO WITH MODIFICATIONS, theo thứ tự ở mục 8 dưới, không làm đồng thời cả 5.

---

## 7. Schema thay đổi thực sự cần thiết (nếu đi theo lộ trình thu hẹp)

| Bảng/cột | Mức độ | Ghi chú |
|---|---|---|
| `mastery_snapshots` (mới) | Cần | student_id, topic_id hoặc question_type_id, computed_at, mastery_ratio, sample_count, model_version — đúng như `knowledge_states` đề xuất, đặt tên theo quy ước hiện có. |
| `review_sessions.purpose` (cột mới) | Cần | Phân biệt 'remediation' (đang có) vs 'retention_check' (mới) — tái dùng bảng, không tạo bảng riêng. |
| `questions.question_type_id`, `questions.difficulty` | **Không cần thêm cột** — đã tồn tại | Vấn đề là QUY TRÌNH điền, không phải schema. |
| Error-type taxonomy | Hoãn | Không thêm bảng cho tới khi quyết định cách lấy dữ liệu loại lỗi (mục 4). |
| Prerequisite skill graph | Hoãn | Đúng như tài liệu tự đề xuất (mục 6.5), không cần cho Pilot. |

RLS: mọi bảng mới đi theo đúng pattern `is_teacher()` / học sinh chỉ thấy dữ liệu của mình đã dùng nhất quán trong toàn bộ 10 migration hiện có — rủi ro thấp, không cần thiết kế mới.

Performance: các bảng đề xuất ghi ở tần suất "sau mỗi buổi ôn tập" hoặc "định kỳ tính snapshot" (không phải mỗi thao tác UI) — rủi ro thấp, nhưng đây là giả định dựa trên quy mô nhỏ; nếu số học sinh hoạt động thực tế lớn hơn tôi nghĩ, cần xem lại.

---

## 8. Một giả định của tài liệu cần bạn xác nhận, không phải điều tôi có thể tự quyết

Tài liệu đề xuất pilot 20–50 học sinh, 150–300 câu hỏi, 4–6 tuần. Tôi không có dữ liệu về số học sinh đang hoạt động thật của bạn trong hệ thống này, nên không thể tự đánh giá con số đó có khớp thực tế không — nếu số học sinh hoạt động thực tế nhỏ hơn nhiều, các chỉ số như Learning Velocity sẽ càng khó ổn định (đã nêu ở mục 6, câu 6).

Ngoài ra, phần lớn khung "khoa học hoá" của tài liệu (model_version, confidence score, model_predictions để đánh giá khoa học) phù hợp cho một đội ngũ nghiên cứu, có thể hơi nặng quy trình cho quy mô 1 giáo viên + AI hỗ trợ. Tôi nghĩ **giữ đúng định hướng** (tách observed/inferred, ghi rõ "estimated" không khẳng định tuyệt đối — nguyên tắc này `diagnosis.ts` hiện tại đã làm đúng) nhưng **không cần làm đủ nghi thức** (model_version formal, bảng model_predictions riêng) ngay từ Pilot — có thể thêm khi thực sự cần so sánh nhiều phiên bản thuật toán.

---

## 9. Đề xuất Phase 1 cụ thể (nếu bạn đồng ý hướng GO WITH MODIFICATIONS)

1. **Component 1** — thêm event `QUESTION_SUBMITTED`/đánh dấu rõ nộp bài nếu cần, còn lại giữ nguyên. Rẻ, gần như không rủi ro.
2. **Component 2, thu hẹp** — chỉ áp dụng cho 1 chương thí điểm (đề xuất "Nguyên hàm và tích phân" — đã có sẵn trong bảng `topics` từ migration_005, không cần tạo mới). Việc quan trọng nhất: **quyết định cách bắt buộc gán `question_type_id`/`difficulty`** — nối `suggestQuestionType()` (đã viết, chưa dùng) vào luồng nhập đề PDF/Word, hoặc dành 1 đợt giáo viên gán tay riêng cho chương thí điểm.
3. **Component 3** — thêm bảng `mastery_snapshots`, 1 job tính định kỳ (hoặc tính khi giáo viên mở trang thống kê), chỉ cho chương thí điểm.
4. **Component 5 (retention)** — thêm cột `purpose` vào `review_sessions`, mở rộng logic chọn câu ôn tập để thỉnh thoảng chèn câu đã đúng quá N ngày.
5. **Component 4** — không làm trong Phase 1. Giữ nguyên nhãn mastery hiện có.

---

*Tài liệu này chỉ là đánh giá — chưa có thay đổi nào được thực hiện trên code hoặc schema.*
