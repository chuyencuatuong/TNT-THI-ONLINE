# Đợt 1 — Error Rationale & Engine — đã hoàn thành (22/09/2026)

Trạng thái: **code xong, đã xác minh sạch** (`npm install` xong, `npx tsc -b` sạch, `npx vitest run` 382/382 pass — trong đó 12 test mới cho `errorIntelligence.ts`, `npx vite build` build thành công). Còn đúng 1 việc Thầy Tường cần làm thủ công: chạy 1 file SQL migration trên Supabase Dashboard (xem cuối file).

Đây là Đợt 1 trong lộ trình 5 đợt đã chốt ở `kien-truc-learning-intelligence-platform-v2.md`. Pilot: **Chương 1 "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số" (Lớp 12)**.

## Đã làm gì

1. **`supabase/migration_019_error_intelligence_core.sql`** (mới) — 2 bảng:
   - `question_option_rationale`: nhãn lỗi (`error_type` 4 loại + `n_a`, `pattern_label` ngắn tái dùng được, `rationale_text` mô tả đầy đủ) cho từng phương án của câu Phần 1, cờ `verified_by_teacher`.
   - `student_error_instances`: nơi ghi Error DNA thật lúc chấm bài — **tạo bảng ở Đợt 1, CHƯA ghi dữ liệu** (Đợt 2 mới nối vào `submitAttempt()`).
   - Cả 2 bảng đúng pattern RLS `is_teacher()` + `drop policy if exists` trước `create policy` (đúng bài học rút ra từ lỗi migration_008/009).

2. **`src/lib/errorIntelligence.ts`** (mới, hàm thuần, có test) — `classifyError()` (tra cứu Error DNA: rationale đã duyệt → tin cậy cao; tín hiệu careless dựa vào `RUSHED_TIME_RATIO` đã có sẵn trong `diagnosis.ts` (vừa export thêm để tái dùng) → tin cậy trung bình; còn lại → `unclassified`) và `summarizePatternRecurrence()` (gom mẫu lỗi lặp lại theo `pattern_label` cụ thể, khác `summarizeClassRecurringGroups()` gom theo Chương/Bài). 12 test mới (`errorIntelligence.test.ts`).

3. **`src/lib/ai.ts`** — hàm mới `suggestOptionRationale()`, cùng pattern `suggestQuestionLesson()`/`suggestQuestionTopic()` đã có: đọc `content_latex` + `options` + `correct_answer` + `solution_latex` (nếu có) + danh sách `pattern_label` đã dùng cho Bài đó, gọi Gemini, trả về nháp JSON cho từng phương án sai. `is_correct` luôn suy từ `correct_answer` thật, không tin theo lời AI tự nhận (đúng nguyên tắc đã áp dụng cho `matchTopicByName`/`matchLessonByName`).

4. **`src/lib/api.ts`** — 3 hàm mới: `listOptionRationale()`, `upsertOptionRationale()` (chỉ gọi khi giáo viên đã bấm Xác nhận, luôn set `verified_by_teacher=true`), `listPatternLabelsForLesson()` (đưa vào prompt AI để ưu tiên tái dùng nhãn cũ).

5. **`src/components/DistractorRationaleEditor.tsx`** (mới) — panel gắn nhãn lỗi: nút "Gợi ý bằng AI" → hiện nháp có thể sửa (loại lỗi/nhãn ngắn/mô tả) cho từng phương án sai → "Xác nhận" để lưu. Chỉ hiện cho câu Phần 1 (Phần 2/3 không có phương án nhiễu rời rạc, đúng giới hạn đã nêu trong tài liệu kiến trúc). Dùng toàn bộ class CSS có sẵn (`.option-row`, `.tag`, `.ai-hint`, `.btn-*`...) — **không thêm CSS mới, không dùng Tailwind**.

6. **`src/pages/TeacherQuestionBank.tsx`** — nối `DistractorRationaleEditor` vào từng câu Phần 1 trong danh sách Ngân hàng câu hỏi.

## Một quyết định kỹ thuật cần Thầy Tường biết

Màn hình gắn nhãn lỗi **không bị khoá cứng chỉ cho Chương 1** — giáo viên có thể mở cho bất kỳ câu Phần 1 nào trong ngân hàng. Pilot Chương 1 là phạm vi **vận hành** (nơi nên ưu tiên gắn nhãn trước để có dữ liệu cho Đợt 2-3), không phải khoá kỹ thuật — khác với quyết định "chặn xuất bản đề" đã từng làm cho chương pilot ở Learning Lab trước đây (tính năng đó là một cổng chặn bắt buộc; đây là công cụ tự nguyện, khoá cứng không cần thiết và làm phức tạp thêm code). Nếu Thầy Tường muốn khoá cứng theo chương sau này, báo lại để thêm.

## Việc cần làm (1 lần, thủ công)

Supabase Dashboard → SQL Editor → New query → dán nguyên file `supabase/migration_019_error_intelligence_core.sql` → Run. An toàn chạy lại nhiều lần nếu cần.

## Còn thiếu để dùng được thật (không phải lỗi — đúng như kế hoạch)

- **`classifyError()` CHƯA được gọi lúc nộp bài** — bảng `student_error_instances` sẽ trống cho tới Đợt 2 (nối vào `submitAttempt()` + tab "Mổ xẻ bài thi").
- **Chưa kiểm tra % câu Phần 1 thuộc Chương 1 đang có `solution_latex`** — quyết định độ hiệu quả của bản nháp AI (câu chưa có lời giải vẫn ra nháp nhưng `ai_confidence: "low"`). Nên kiểm tra trước khi giáo viên bắt đầu gắn nhãn hàng loạt.
- **`skill_prerequisites`, drill-down, Progress Story** — Đợt 3-5, chưa làm.

## Việc Thầy Tường có thể làm ngay sau khi chạy migration

Mở Ngân hàng câu hỏi → lọc Chương "Ứng dụng đạo hàm..." → với mỗi câu Phần 1, bấm "Gắn nhãn lỗi cho phương án nhiễu" → "Gợi ý bằng AI" → sửa/xác nhận. Càng nhiều câu được gắn nhãn trước khi học sinh làm bài, Đợt 2 (Exam Autopsy) càng có nhiều dữ liệu tin cậy cao ngay từ đầu.
