# Kiến trúc Learning Intelligence Platform — Student Learning State 2.0, Exam Autopsy & Error Intelligence, Knowledge Graph

**Ngày:** 22/09/2026
**Phạm vi:** thiết kế kỹ thuật cấp production cho 3 hệ thống lõi theo yêu cầu, dựa trên đối chiếu trực tiếp với `schema.sql` + 18 migration + toàn bộ `src/lib`/`src/pages` hiện tại của `TNT-THI-ONLINE`, không suy đoán.
**Lưu ý về số module:** đề bài ghi "6 module" nhưng chỉ liệt kê 5 (Module 1–5: Schema, Error Intelligence, Knowledge Graph, Learning State, UI/UX). Tài liệu này giữ đúng 5 module đó và thêm **Module 6 — Lộ trình thực thi & quyết định cần xác nhận**, vừa khớp đúng số 6 đã nêu, vừa đáp ứng phần "kế hoạch thực thi chi tiết" mà đề bài yêu cầu riêng.

---

## 0. Đối chiếu với lịch sử dự án — đọc phần này trước khi đọc 6 module

Đây là phần quan trọng nhất tài liệu, vì phần lớn nội dung được yêu cầu **không phải ý tưởng mới** — nó trùng lặp đáng kể với "Research & Development Proposal" và "Learning Lab Proposal" đã được đánh giá kỹ vào 24/08/2026 (`danh-gia-research-development-proposal-v1.md`, `quyet-dinh-nang-cap-learning-lab-v1.md`) rồi **tạm hoãn** (`lo-trinh-nang-cap-4-dot-v1.md`, trạng thái "TẠM HOÃN"), trước khi dự án rẽ sang một nhánh khác đã triển khai thật: khung Lớp → Chương → Bài (migration_016, 31/08/2026) và lỗi lặp lại theo Chương/Bài (`giai-doan-2-goc-loi-lap-lai-xu-huong-v1.md`, 31/08/2026). Nếu thiết kế lại từ đầu mà không đối chiếu, tài liệu này sẽ lặp lại đúng 2 sai lầm đã có bằng chứng thật trong lịch sử dự án:

1. **Thêm cột/bảng rồi hy vọng được điền** — đã xảy ra với `question_type_id`/`difficulty` (bỏ trống từ đầu vì luồng nhập đề không bắt buộc gán), phải sửa 2 lần mới xong.
2. **Xây tầng phân tích cao (Error DNA, Knowledge Graph) trên nền dữ liệu chưa vững** — đánh giá 24/08 đã cảnh báo đúng điều này và đề xuất hoãn Error taxonomy + prerequisite graph.

### Cái gì đã có, chỉ cần đổi tên/khai thác lại

| Yêu cầu trong đề bài | Đã có trong repo dưới tên khác | Ghi chú |
|---|---|---|
| "Hồ sơ năng lực động, giải thích được nguyên nhân" | `diagnoseTopic()` (`diagnosis.ts`) — 5 mức `vung/chua_chac_chan/co_lo_hong/mat_goc/chua_du_du_lieu`, tính từ điểm + thời gian + số lần đổi đáp án | Đã là "explainable, deterministic", đúng triết lý đề bài yêu cầu — không cần xây lại từ đầu. |
| "Phân tầng Xanh/Vàng/Đỏ/Xám" | `MASTERY_COLOR` — đã có 5 màu tương ứng 5 mức trên | Đề bài xin 4 tầng, hệ hiện có 5 (tách `co_lo_hong` và `mat_goc` thành 2 mức riêng thay vì gộp 1 "Đỏ") — xem quyết định cần xác nhận ở mục 7. |
| "Cấp độ nhận thức Bloom's Taxonomy" | `questions.difficulty` = `nhan_biet/thong_hieu/van_dung/van_dung_cao` + `diagnoseAllDifficulties()` | Đã đúng 4 mức NB/TH/VD/VDC, đã hiển thị dạng biểu đồ cột cho cả học sinh lẫn giáo viên (Giai đoạn 1, 31/08). |
| "Mẫu lỗi lặp lại qua nhiều đề" | `summarizeMasteryTrend()` + `summarizeClassRecurringGroups()` (Giai đoạn 2 gốc, 31/08) | Đã chạy thật, đã hiển thị ở `TeacherStudentDetail.tsx` + `TeacherDashboard.tsx`. **Nhưng ở mức Chương/Bài, chưa ở mức "loại lỗi"** — đây là phần thật sự cần làm mới, xem Module 2. |
| "Cây kiến trúc kỹ năng" | `topics` (Chương, có `order_index`) → `lessons` (Bài, có `order_index`) | 2 tầng, đã seed đủ PPCT 3 khối 10/11/12 (migration_016). Chưa có quan hệ tiên quyết (prerequisite) — đây là phần cần làm mới, xem Module 3. |
| "Dấu hiệu bất cẩn" | `TopicDiagnosis.possiblyRushed` (điểm thấp nhưng thời gian rất nhanh) + `classifyBlankQuestions()` (`chua_kip_doc` vs `doc_roi_bo_qua`) | Đã có tín hiệu thô cho đúng khái niệm "Lỗi bất cẩn" trong đề bài — Module 2 sẽ mở rộng, không viết lại. |

### Cái gì đã bị đánh giá là **chưa khả thi** trước đây, và vì sao

Đánh giá 24/08 kết luận **Error-type taxonomy (CONCEPTUAL/PROCEDURAL/ARITHMETIC/CARELESS) nên hoãn hẳn**, lý do: hệ thống chỉ ghi `final_answer` + `score`, không ghi **học sinh đã chọn nhiễu nào / sai ở bước nào** — nên không có dữ liệu để suy luận LOẠI lỗi, chỉ có ĐÚNG/SAI. Hai cách duy nhất từng xét khi đó (AI đọc từng câu sai lúc phân tích, hoặc giáo viên gán tay từng học sinh) đều bị bác vì tốn kém/không khả thi ở quy mô thật.

**Đây chính là nút thắt mà Module 2 bên dưới phải giải quyết trước khi làm bất cứ điều gì khác** — nếu không, Module 2 sẽ lặp lại đúng kết luận "hoãn" đã có. Thiết kế mới ở Module 2 dùng một cách tiếp cận **chưa từng được xét tới** trong 2 lần đánh giá trước: gắn nhãn lý do sai **1 lần cho mỗi phương án nhiễu lúc soạn câu hỏi** (chi phí O(số câu hỏi), không phải O(số lượt học sinh làm sai)) — xem chi tiết Module 2 mục 2.1. Đây là lý do tài liệu này có thể đề xuất Error Intelligence một cách khả thi, khác với 2 lần trước.

### Cái gì KHÔNG nên đảo ngược mà không có lý do mới

`giai-doan-2-goc-loi-lap-lai-xu-huong-v1.md` (31/08) **cố tình chọn không thêm bảng snapshot** (`mastery_snapshots`) mà tính lại on-demand mỗi lần mở trang, đúng triết lý "hàm thuần, không phụ thuộc DB" xuyên suốt `diagnosis.ts`/`chapterStats.ts`/`lessonStats.ts` — lý do: quy mô học sinh thực tế nhỏ, tính lại không tốn kém, và tránh rủi ro snapshot lệch với dữ liệu gốc. Module 4 bên dưới **giữ nguyên quyết định này làm mặc định**, chỉ nêu điều kiện cụ thể để chuyển sang snapshot khi thật sự cần (không làm trước khi cần).

### Khuyến nghị tổng thể

**Không triển khai cả 3 hệ thống ở độ rộng "toàn bộ ngân hàng câu hỏi" cùng lúc.** Lý do giống hệt lý do đánh giá 24/08 đã nêu và đã đúng trong thực tế (khung Lớp-Chương-Bài chỉ thật sự chạy được sau khi thu hẹp phạm vi, làm từng đợt, nghiệm thu riêng — xem `lo-trinh-nang-cap-4-dot-v1.md` và `giai-doan-1-hoan-thanh-v1.md`). Module 6 đề xuất lộ trình theo đúng nhịp độ đã chứng minh hiệu quả trong chính dự án này: pilot 1–2 chương đang dạy thật trước, mở rộng sau khi vòng dữ liệu khép kín chạy đúng trên phạm vi nhỏ.

---

## 1. Module 1 — Schema dữ liệu (PostgreSQL/Supabase)

Nguyên tắc bám theo đúng 18 migration hiện có: `snake_case`, `if not exists`/`drop policy if exists` để an toàn chạy lại, RLS theo pattern `is_teacher()`, comment giải thích lý do trong chính file SQL (không chỉ trong tài liệu), và **không tạo bảng `skills` mới** — `topics`(Chương)/`lessons`(Bài) đã là 2 tầng "skill" thật, tạo thêm bảng `skills` song song sẽ lặp lại đúng lỗi "2 hệ phân loại cùng tồn tại, 1 cái luôn rỗng" đã từng xảy ra với `question_types`.

### 1.1 `question_option_rationale` — lý do sai của từng phương án nhiễu (mới, cốt lõi của Module 2)

```sql
-- migration_019_error_intelligence_core.sql (ĐỀ XUẤT — chưa chạy, chờ duyệt)

create table if not exists question_option_rationale (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  -- Phần 1: 'A'|'B'|'C'|'D'. Phần 2: 'a'|'b'|'c'|'d'. Phần 3: null (không có phương án nhiễu rời rạc).
  option_key text,
  is_correct boolean not null default false,
  error_type text not null check (error_type in ('procedural','conceptual','calculation','careless','n_a')),
  rationale_text text, -- vd "Quên đổi cận khi đổi biến" — hiện cho GV lúc soạn, và cho HS ở Exam Autopsy
  ai_suggested boolean not null default false, -- true nếu AI gợi ý, GV chưa/đã xác nhận qua ai_suggestion_confirmed
  ai_suggestion_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (question_id, option_key)
);

comment on table question_option_rationale is
  'Gắn nhãn LOẠI LỖI cho từng phương án nhiễu, làm 1 LẦN lúc soạn/duyệt câu hỏi
   (không phải lúc học sinh làm bài) -- biến bài toán "suy luận loại lỗi từ
   final_answer" (không khả thi, đã đánh giá 24/08/2026) thành 1 phép tra cứu
   xác định lúc chấm: option học sinh chọn sai -> error_type đã gắn sẵn.
   Theo đúng pattern "AI gợi ý, giáo viên xác nhận" đã dùng cho topic_id/lesson_id.';

alter table question_option_rationale enable row level security;
drop policy if exists "rationale_read_all" on question_option_rationale;
create policy "rationale_read_all" on question_option_rationale for select using (true);
drop policy if exists "rationale_write_teacher" on question_option_rationale;
create policy "rationale_write_teacher" on question_option_rationale for all
  using (is_teacher()) with check (is_teacher());
```

### 1.2 `student_error_instances` — DNA lỗi ghi nhận theo từng câu sai

```sql
create table if not exists student_error_instances (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  error_type text not null check (error_type in ('procedural','conceptual','calculation','careless','unclassified')),
  confidence text not null check (confidence in ('high','medium','low')),
  -- 'high': tra được rationale_text trực tiếp từ question_option_rationale (Phần 1, có nhãn).
  -- 'medium': suy ra bằng tín hiệu hành vi (careless: mastery cao + time thấp) không qua rationale.
  -- 'low': không đủ dữ liệu để phân biệt procedural/conceptual/calculation, gắn 'unclassified'.
  signals jsonb not null, -- {"score_ratio":0,"time_ratio":0.4,"change_count":0,"mastery_at_time":0.85,"chosen_option":"B"}
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

comment on table student_error_instances is
  'Kết quả CHẠY 1 LẦN của Error Intelligence Engine (Module 2) cho mỗi câu sai,
   tính lúc chấm bài (submitAttempt) -- không tính lại on-demand mỗi lần xem vì
   input (rationale, mastery tại thời điểm đó) không đổi sau khi đã nộp bài,
   khác với diagnosis.ts (luôn tính lại vì mastery hiện tại thay đổi liên tục).';

alter table student_error_instances enable row level security;
drop policy if exists "error_instances_select" on student_error_instances;
create policy "error_instances_select" on student_error_instances
  for select using (is_teacher() or student_id = auth.uid());
drop policy if exists "error_instances_write" on student_error_instances;
create policy "error_instances_write" on student_error_instances
  for all using (is_teacher() or student_id = auth.uid());
```

**Vì sao KHÔNG cần bảng `error_taxonomies` riêng:** 4 loại lỗi là tập giá trị cố định, không phải danh mục giáo viên tự thêm/sửa như `topics`/`lessons` — dùng `check constraint` (như trên) đúng theo cách `questions.difficulty` đã làm, tránh 1 bảng chỉ có 4-5 dòng không bao giờ đổi.

### 1.3 `skill_prerequisites` — cạnh tiên quyết tối giản (Module 3)

```sql
create table if not exists skill_prerequisites (
  id uuid primary key default gen_random_uuid(),
  -- node có thể là topic_id (Chương) hoặc lesson_id (Bài) -- dùng chung 1 bảng, phân biệt bằng node_type
  node_type text not null check (node_type in ('topic','lesson')),
  node_id uuid not null,
  prerequisite_type text not null check (prerequisite_type in ('topic','lesson')),
  prerequisite_id uuid not null,
  weight numeric(3,2) not null default 0.5 check (weight between 0 and 1), -- mức độ phụ thuộc, GV tự đặt/chỉnh
  source text not null default 'curated' check (source in ('curated','ppct_order')),
  -- 'ppct_order': suy tự động từ order_index (Bài N phụ thuộc yếu vào Bài N-1 CÙNG chương) -- weight mặc định thấp (0.3), không cần GV nhập.
  -- 'curated': GV/AI-gợi ý-GV-duyệt nhập tay cho quan hệ XUYÊN chương quan trọng (vd Cực trị phụ thuộc Đạo hàm) -- weight cao hơn.
  created_at timestamptz not null default now(),
  unique (node_type, node_id, prerequisite_type, prerequisite_id)
);

comment on table skill_prerequisites is
  'DAG tối giản. KHÔNG suy luận tự động toàn bộ đồ thị bằng AI/thống kê tương
   quan -- rủi ro đã nêu ở đánh giá 24/08 (proposal cũ tự nhận nên hoãn
   prerequisite graph). Thay vào đó: cạnh "ppct_order" sinh tự động (rẻ, không
   rủi ro) làm nền, cạnh "curated" quan trọng do giáo viên xác nhận từng cái
   một (ít, có giá trị cao) -- đúng tinh thần deterministic/explainable đề
   bài yêu cầu, không phải đồ thị "học" từ dữ liệu.';

alter table skill_prerequisites enable row level security;
drop policy if exists "prereq_read_all" on skill_prerequisites;
create policy "prereq_read_all" on skill_prerequisites for select using (true);
drop policy if exists "prereq_write_teacher" on skill_prerequisites;
create policy "prereq_write_teacher" on skill_prerequisites for all
  using (is_teacher()) with check (is_teacher());
```

### 1.4 Không tạo mới: `student_skill_mastery`, `mastery_snapshots`

Đề bài (Module 1) xin bảng `student_skill_mastery` (điểm 0-100, stability, decay). **Đề xuất: không tạo bảng này trong Phase 1**, vì trùng chức năng với việc gọi `diagnoseTopic()` on-demand đã chạy thật và đã được cân nhắc kỹ (31/08) để KHÔNG lưu snapshot. Xem điều kiện cụ thể để đổi ý ở Module 4 mục 4.4 — không tạo trước khi có bằng chứng cần.

### Tổng hợp thay đổi schema

| Bảng/cột | Trạng thái | Rủi ro khi chạy |
|---|---|---|
| `question_option_rationale` | Mới | Thấp — bảng độc lập, không đụng bảng cũ. |
| `student_error_instances` | Mới | Thấp — ghi thêm lúc `submitAttempt`, không sửa luồng chấm điểm cũ. |
| `skill_prerequisites` | Mới | Thấp — đọc-only cho phần lớn tính năng, ghi tay bởi GV. |
| `student_skill_mastery`, `mastery_snapshots` | **Không làm** | — |
| `error_taxonomies` (bảng riêng) | **Không làm**, dùng `check constraint` | — |

---

## 2. Module 2 — Error Intelligence & Động cơ phân loại lỗi tự động

### 2.1 Giải quyết nút thắt dữ liệu trước khi viết thuật toán

4 loại lỗi cần phân biệt **theo học sinh đã chọn gì**, không chỉ đúng/sai. Với **Phần 1** (trắc nghiệm 4 phương án — khối lượng câu hỏi lớn nhất trong ngân hàng), điều này giải quyết được triệt để: mỗi phương án sai (nhiễu) được giáo viên gắn sẵn `error_type` + `rationale_text` **1 lần khi soạn câu** (bảng `question_option_rationale`, mục 1.1) — AI có thể đọc `solution_latex` (nếu có) để gợi ý trước, giáo viên xác nhận, đúng pattern đã chạy thật cho `topic_id`/`lesson_id`. Lúc học sinh làm sai, hệ thống chỉ cần tra `final_answer` khớp `option_key` nào → lấy `error_type` đã gắn sẵn — **không gọi AI lúc chấm bài, không suy đoán**.

Với **Phần 2** (4 ý đúng/sai) và **Phần 3** (tự luận ngắn), không có "phương án nhiễu" rời rạc để gắn nhãn trước — độ tin cậy phân loại thấp hơn hẳn, xem bảng độ tin cậy theo Phần ở mục 2.3. Đây là giới hạn thật, không che giấu bằng cách gắn nhãn tự tin giả.

### 2.2 Thuật toán quyết định (deterministic, không dùng AI lúc chấm bài)

```ts
// src/lib/errorIntelligence.ts (mới) — hàm thuần, có unit test, không phụ thuộc DB/mạng
// Cùng triết lý diagnosis.ts: mọi kết luận là HEURISTIC tường minh, không phải
// dự đoán mờ của mô hình.

import type { Difficulty } from "./types";

export type ErrorType = "procedural" | "conceptual" | "calculation" | "careless" | "unclassified";
export type ErrorConfidence = "high" | "medium" | "low";

export interface ErrorClassificationInput {
  scoreRatio: number;          // 0..1, đã biết là câu SAI (scoreRatio < 1) trước khi gọi hàm này
  timeSpentSeconds: number;
  expectedTimeSeconds: number; // DEFAULT_EXPECTED_TIME_SECONDS[part], tái dùng từ diagnosis.ts
  changeCount: number;
  masteryAtTimeOfAnswer: MasteryLabel; // từ diagnoseTopic() tính TRÊN dữ liệu TRƯỚC lượt thi này
  rationaleErrorType: ErrorType | null; // tra từ question_option_rationale, null nếu Phần 2/3 hoặc chưa gắn nhãn
}

export interface ErrorClassificationResult {
  errorType: ErrorType;
  confidence: ErrorConfidence;
  reason: string; // câu giải thích ngắn, hiển thị thẳng cho học sinh/giáo viên — KHÔNG có bước ẩn
}

const CARELESS_TIME_RATIO = 0.5;      // trùng RUSHED_TIME_RATIO đã có trong diagnosis.ts — tái dùng hằng số, không định nghĩa lại
const CARELESS_MIN_MASTERY: MasteryLabel[] = ["vung", "chua_chac_chan"];

export function classifyError(input: ErrorClassificationInput): ErrorClassificationResult {
  // Bậc 1 — có nhãn rationale trực tiếp (chỉ Phần 1, câu đã được GV gắn nhãn): tin cậy CAO nhất, ưu tiên tuyệt đối.
  if (input.rationaleErrorType && input.rationaleErrorType !== "n_a") {
    return {
      errorType: input.rationaleErrorType,
      confidence: "high",
      reason: "Xác định từ nhãn lỗi đã gắn sẵn cho phương án đã chọn.",
    };
  }

  // Bậc 2 — tín hiệu hành vi CARELESS: mastery đang tốt + làm rất nhanh + vẫn sai.
  // Đây chính là công thức "Lỗi bất cẩn" trong đề bài, dùng lại đúng possiblyRushed
  // logic đã có trong diagnosis.ts (mastery cao + thời gian rất nhanh).
  const timeRatio = input.timeSpentSeconds / input.expectedTimeSeconds;
  if (CARELESS_MIN_MASTERY.includes(input.masteryAtTimeOfAnswer) && timeRatio <= CARELESS_TIME_RATIO) {
    return {
      errorType: "careless",
      confidence: "medium",
      reason: `Kỹ năng này đang ở mức "${MASTERY_LABELS[input.masteryAtTimeOfAnswer]}" nhưng làm câu này chỉ mất ${Math.round(timeRatio * 100)}% thời gian kỳ vọng — nhiều khả năng đọc/chọn vội.`,
    };
  }

  // Bậc 3 — không có nhãn rationale (Phần 2/3, hoặc Phần 1 chưa gắn nhãn) và không khớp
  // tín hiệu careless: KHÔNG đoán bừa giữa procedural/conceptual/calculation — trung
  // thực gắn "unclassified" thay vì tạo ảo giác chính xác (đúng nguyên tắc
  // "không đoán" đã áp dụng nhất quán cho correct_answer/solution_latex).
  return {
    errorType: "unclassified",
    confidence: "low",
    reason: "Dữ liệu hiện tại chưa đủ để xác định loại lỗi cụ thể cho câu này.",
  };
}
```

**Vì sao không có nhánh "procedural vs conceptual vs calculation" suy từ tín hiệu hành vi:** không có tổ hợp (thời gian, số lần đổi đáp án) nào phân biệt được 3 loại này một cách đáng tin — phân biệt được cần nhìn vào **bước giải**, chỉ có ở rationale đã gắn nhãn. Nếu Thầy Tường muốn phủ cả Phần 2/3, hướng khả thi duy nhất là mở rộng `solution_latex` (đã có cột, hiện không bắt buộc) thành các bước có cấu trúc — đây là việc lớn hơn, để ngoài phạm vi Phase 1 (xem Module 6).

### 2.3 Độ tin cậy theo Phần — hiển thị trung thực, không che giấu giới hạn

| Phần | % câu có thể phân loại `high` | Điều kiện |
|---|---|---|
| Phần 1 (trắc nghiệm 4 phương án) | Tối đa 100% các câu đã có `question_option_rationale` đầy đủ 3 phương án sai | Phụ thuộc % câu đã được giáo viên gắn nhãn — bằng 0% cho tới khi bắt đầu gắn. |
| Phần 2 (đúng/sai 4 ý) | 0% `high`, còn lại `medium`(careless)/`low` | Không có "phương án nhiễu" rời rạc để gắn nhãn trước. |
| Phần 3 (trả lời ngắn) | 0% `high` | Tương tự Phần 2. |

### 2.4 Nâng cấp Repeated Error Pattern lên mức "loại lỗi" (không chỉ Chương/Bài)

`summarizeClassRecurringGroups()` đã có (Giai đoạn 2 gốc) nhận `RecurringGroupInput[]` theo Chương/Bài. Mở rộng bằng cách gọi lại **đúng hàm đó**, đổi input thành nhóm theo `(student_id, error_type)` thay vì `(student_id, topic_id)` — không viết hàm gộp mới:

```ts
// src/lib/api.ts — hàm mới, tái dùng summarizeClassRecurringGroups có sẵn
export async function getStudentErrorTypeTrend(studentId: string): Promise<RecurringGroupInput[]> {
  // query student_error_instances join exam_attempts (lấy started_at), gộp theo error_type,
  // KHÔNG gộp cùng diagnoseTopic (mastery theo chương) — đây là 1 trục khác: mastery theo KỸ NĂNG,
  // recurring theo LOẠI LỖI. 2 trục độc lập, không trộn logic.
}
```

Ví dụ diễn giải đúng format DNA lỗi trong đề bài: *"Em quên điều kiện xác định (lỗi khái niệm) ở 3 câu, trải trên 2 đề khác nhau trong 3 tuần qua → đánh dấu lỗ hổng cấu trúc."* — câu này giờ tra được thật (join `student_error_instances.error_type = 'conceptual'` + `rationale_text` cụ thể từng câu), không phải câu mẫu suông.

---

## 3. Module 3 — Knowledge Graph & Root-Cause Engine

### 3.1 Cấu trúc đồ thị

Node = `topics`(Chương) hoặc `lessons`(Bài) đã có sẵn trong DB (không tạo bảng `skills` mới, xem mục 1). Cạnh = `skill_prerequisites` (mục 1.3), 2 nguồn: `ppct_order` (tự động, yếu) và `curated` (giáo viên xác nhận, mạnh). Đây là DAG **thưa và nhỏ** có chủ đích — không phải đồ thị đầy đủ mọi cặp Chương/Bài, tránh chi phí bảo trì không cần thiết cho quan hệ không ai dùng tới khi chẩn đoán.

### 3.2 Công thức Attribution Score

Dùng đúng ví dụ trong đề bài, áp vào dữ liệu Toán 12 THẬT đã có trong `topics` (migration_016): *"yếu ở Bài thuộc Chương 1 (Ứng dụng đạo hàm — ví dụ Bài Cực trị của hàm số), tiên quyết trực tiếp là Bài Đạo hàm (Chương... lớp 11, đã seed trong `topics` grade=11)."*

```ts
// src/lib/knowledgeGraph.ts (mới) — hàm thuần
export interface AttributionInput {
  targetMastery: TopicDiagnosis;       // chẩn đoán của node đang yếu (vd Cực trị)
  prerequisites: Array<{
    lessonOrTopicName: string;
    mastery: TopicDiagnosis;           // chẩn đoán của node tiên quyết
    weight: number;                    // từ skill_prerequisites.weight
  }>;
}

export interface AttributionResult {
  prerequisiteName: string;
  attributionScore: number; // 0..1
  explanation: string;      // câu giải thích đúng format đề bài, sinh tự động từ số liệu thật
}

/**
 * attributionScore ưu tiên tiên quyết có: (a) weight cao (curated > ppct_order),
 * (b) mastery THẤP hơn target (nghĩa là nền còn yếu hơn cả cái đang xét — đáng
 * ngờ là gốc rễ), (c) đủ sampleCount để tin được (không quy trách nhiệm cho 1
 * node chỉ có 1-2 câu dữ liệu).
 */
export function computeAttribution(input: AttributionInput): AttributionResult[] {
  return input.prerequisites
    .filter((p) => p.mastery.sampleCount >= MIN_SAMPLE_SIZE) // tái dùng ngưỡng của diagnosis.ts
    .map((p) => {
      const masteryGapFactor = Math.max(0, input.targetMastery.avgScoreRatio - p.mastery.avgScoreRatio) * -1 + 1;
      // node tiên quyết CÀNG YẾU hơn target → factor càng lớn (đáng ngờ là gốc rễ)
      const weaknessFactor = 1 - p.mastery.avgScoreRatio;
      const score = p.weight * 0.4 + weaknessFactor * 0.4 + masteryGapFactor * 0.2;
      return {
        prerequisiteName: p.lessonOrTopicName,
        attributionScore: Math.round(score * 100) / 100,
        explanation:
          `TNT nhận thấy khó khăn ở "${"<tên node target>"}" có thể liên quan nhiều hơn đến ` +
          `"${p.lessonOrTopicName}" (${Math.round(p.mastery.avgScoreRatio * 100)}%) — ` +
          `dựa trên ${p.mastery.sampleCount} câu "${p.lessonOrTopicName}", ` +
          `${input.targetMastery.sampleCount} câu "<target>".`,
      };
    })
    .sort((a, b) => b.attributionScore - a.attributionScore);
}
```

Công thức trên **cố ý đơn giản, có thể diễn giải bằng lời** (đúng yêu cầu "Explainable & Deterministic"), không phải hồi quy/ML học trọng số. Trọng số 0.4/0.4/0.2 là lựa chọn ban đầu hợp lý (giống tinh thần các hằng số trong `diagnosis.ts`), **cần Thầy Tường đối chiếu thực tế và điều chỉnh**, không phải số đo thực nghiệm.

### 3.3 Root-cause traversal

BFS ngược từ node yếu nhất theo `skill_prerequisites`, độ sâu tối đa 2 (Bài → Chương tiên quyết → Chương gốc) — đủ cho ví dụ Tham số → Cực trị → Đạo hàm trong đề bài, tránh graph traversal sâu vô hạn khi đồ thị còn thưa (curated edges ít lúc đầu).

---

## 4. Module 4 — Student Learning State 2.0 / Learning Health Score

### 4.1 Không tạo hệ phân tầng mới song song — mở rộng hệ đã có

Đề bài xin 4 tầng Xanh(≥80%)/Vàng(60-79%)/Đỏ(<60%)/Xám. Hệ hiện có (`MasteryLabel`, 5 giá trị) đã tinh hơn: tách `co_lo_hong` (khoảng nửa đúng) và `mat_goc` (sai phần lớn) thay vì gộp chung "Đỏ". **Khuyến nghị: giữ nguyên 5 mức, chỉ thêm 1 lớp hiển thị gộp "Đỏ" khi cần giao diện gọn** (map `co_lo_hong`+`mat_goc` → 1 màu Đỏ ở nơi cần tối giản, giữ 5 mức ở nơi cần chi tiết) — không tạo enum thứ 2 chạy song song, tránh lặp lại rủi ro "2 hệ phân loại, 1 cái rỗng dần" đã từng xảy ra.

### 4.2 Learning Health Score — công thức

```ts
// src/lib/learningState.ts (mới) — hàm thuần
export interface LearningHealthInput {
  knowledge: TopicDiagnosis;              // từ diagnoseTopic() — trục "biết gì"
  applicationByDifficulty: DifficultyOutcomeGroup[]; // từ diagnoseAllDifficulties() — trục "vận dụng được không"
  trend: MasteryTrendSummary;             // từ summarizeMasteryTrend() — trục "ổn định"
  avgTimeRatio: number;                   // đã có sẵn trong TopicDiagnosis — trục "tốc độ xử lý"
}

export function computeLearningHealthScore(input: LearningHealthInput): number {
  const knowledgeScore = input.knowledge.avgScoreRatio * 100;
  // Application: trọng số cao hơn cho mức tư duy cao (VD/VDC) — đúng tinh thần Bloom's,
  // vận dụng cao đúng có giá trị hơn nhận biết đúng.
  const bloomWeight: Record<Difficulty, number> = { nhan_biet: 1, thong_hieu: 1.2, van_dung: 1.5, van_dung_cao: 2 };
  const applicationScore = weightedAverage(input.applicationByDifficulty, bloomWeight) * 100;
  // Stability: trend cải thiện/ổn định = điểm cao, xu hướng đi xuống = điểm thấp.
  const stabilityScore = input.trend.direction === "cai_thien" ? 90
    : input.trend.direction === "chua_ro" ? 70
    : 40; // di_xuong
  // Fluency: thời gian gần mức kỳ vọng (không quá chậm, không quá vội) là tốt nhất.
  const fluencyScore = Math.max(0, 100 - Math.abs(input.avgTimeRatio - 1) * 100);

  // Trọng số tổng: Kiến thức là nền, chiếm nhiều nhất; Fluency ít nhất (dễ nhiễu nhất theo mẫu nhỏ).
  return Math.round(knowledgeScore * 0.4 + applicationScore * 0.3 + stabilityScore * 0.2 + fluencyScore * 0.1);
}
```

Cũng như Module 3, trọng số 0.4/0.3/0.2/0.1 là **khởi điểm hợp lý cần hiệu chỉnh theo dữ liệu thật**, không phải hằng số đã kiểm chứng — nêu rõ trong UI (mục 5) bằng dòng "ước tính, dựa trên N câu" giống cách `diagnosis.ts` đã làm, tránh ảo giác chính xác tuyệt đối mà `quyet-dinh-nang-cap-learning-lab-v1.md` (điểm chỉnh #1) đã từng nhắc.

### 4.3 Explainability Layer — JSON payload

```json
{
  "lesson_name": "Tích phân từng phần",
  "mastery_label": "co_lo_hong",
  "mastery_percent": 34,
  "sample_count": 8,
  "by_difficulty": [
    { "difficulty": "nhan_biet", "accuracy": 0.9, "sample_count": 2 },
    { "difficulty": "van_dung", "accuracy": 0.2, "sample_count": 4 },
    { "difficulty": "van_dung_cao", "accuracy": 0.0, "sample_count": 2 }
  ],
  "recurring": { "is_recurring": true, "trend": "chua_ro", "valid_point_count": 2 },
  "error_breakdown": [
    { "error_type": "conceptual", "count": 3, "confidence": "high", "example_reason": "Quên điều kiện đổi cận khi đổi biến" },
    { "error_type": "careless", "count": 1, "confidence": "medium" }
  ],
  "root_cause_candidates": [
    { "name": "Nguyên hàm cơ bản", "attribution_score": 0.71, "mastery_percent": 87 }
  ]
}
```

Payload này là **hợp nhất** kết quả 3 module (2, 3, 4) — đúng yêu cầu "vòng lặp dữ liệu khép kín" trong đề bài: click vào 1 kỹ năng ra ngay cả loại lỗi lẫn gốc rễ, không phải 3 màn hình rời rạc.

### 4.4 On-demand vs snapshot — điều kiện cụ thể để đổi quyết định 31/08

Giữ nguyên tính on-demand. **Chỉ chuyển sang bảng snapshot khi có ít nhất 1 trong 2 điều kiện đo được:**

1. Trang hồ sơ học sinh (`TeacherStudentDetail.tsx`) load chậm thấy rõ (>2-3 giây) vì phải quét toàn bộ lịch sử `question_responses` của 1 học sinh có quá nhiều lượt làm — hiện chưa xảy ra ở quy mô nhóm nhỏ.
2. Cần Learning Velocity (`ΔM/Δt`) trên khoảng thời gian dài (nhiều tháng) mà việc tính lại từ đầu mỗi lần xem trở nên tốn kém rõ rệt.

Không làm trước khi 1 trong 2 điều này xảy ra thật — tránh lặp lại rủi ro mà quyết định 31/08 đã né.

---

## 5. Module 5 — Kiến trúc UI/UX

### 5.1 Về yêu cầu "React + Tailwind CSS"

Codebase hiện tại **không dùng Tailwind** — dùng React + CSS thuần với hệ design token đã xây khá đầy đủ (`--space-1..6`, `--font-size-xs..2xl`, `--shadow-sm/md`, `data-theme` cho dark mode, class như `.diagnosis-card`/`.diagnosis-list` — đợt "Làm mới giao diện" 24/08). Thêm Tailwind vào lúc này là 1 quyết định kiến trúc lớn, riêng biệt (cấu hình build, viết lại toàn bộ class hiện có hoặc chạy song song 2 hệ CSS) — **không phải việc nhỏ đi kèm 3 hệ thống trên**. Đề xuất: tiếp tục dùng đúng hệ CSS token hiện có cho mọi component mới bên dưới, để Tailwind là 1 quyết định riêng nếu Thầy Tường thật sự muốn đổi toàn bộ giao diện sau này.

### 5.2 Dashboard học tập mới (mở rộng `TeacherStudentDetail.tsx` / `StudentDashboard.tsx`)

```
<LearningHealthCard>              // mới — health score to, 4 sub-score nhỏ (Knowledge/Application/Stability/Fluency)
<SkillGroupList>                  // mở rộng mục "Lỗi lặp lại & xu hướng" (31/08) đã có sẵn
  <SkillGroupItem mastery={...} onDrillDown>  // tái dùng MASTERY_COLOR/MASTERY_LABELS
    <ExplainPanel>                // mới — render đúng payload mục 4.3, accordion mở khi click
```

### 5.3 Màn hình Mổ xẻ bài thi (Exam Autopsy) — tab mới trong `ResultPage.tsx` (đã có 3 tab: Tổng quan/Chẩn đoán/Xem lại bài làm)

```
<Tab name="Mổ xẻ bài thi">        // tab thứ 4, thêm vào cấu trúc tab đã có
  <ScoreLossTable>                // "Em mất 2.5 điểm ở đâu" — group theo lesson_id, điểm mất = default_points - score
  <ErrorDnaCluster>                // 4 nhóm loại lỗi, mỗi nhóm hiện count + ví dụ rationale_text thật
  <WrongQuestionList>
    <QuestionReview />             // component ĐÃ CÓ, thêm 1 dòng "Vì sao sai" đọc từ student_error_instances
```

### 5.4 Bản đồ Tri thức — trang mới `TeacherKnowledgeMap.tsx`

```
<KnowledgeMapGraph nodes={topics+lessons} edges={skill_prerequisites}>
  <Node mastery={...} highlight={isRootCauseCandidate} />  // highlight từ computeAttribution() (Module 3)
<RootCauseExplainPanel>          // hiện đúng câu giải thích sinh tự động ở mục 3.2
```

Vẽ đồ thị: vì graph cố tình nhỏ/thưa (mục 3.1), không cần thư viện graph nặng — layout phân tầng đơn giản (Chương theo `order_index`, Bài lồng bên trong) đủ dùng, tránh thêm dependency lớn không cần thiết.

---

## 6. Module 6 — Lộ trình thực thi & quyết định cần Thầy Tường xác nhận

### 6.1 Lộ trình đề xuất (đợt hoá, nghiệm thu riêng — đúng nhịp đã chứng minh hiệu quả)

| Đợt | Nội dung | Phụ thuộc | Rủi ro |
|---|---|---|---|
| 1 | Chạy `migration_019` (3 bảng mục 1.1–1.3). Viết + test `errorIntelligence.ts`, `knowledgeGraph.ts`, `learningState.ts` (hàm thuần, chưa nối UI). | Không | Thấp |
| 2 | Màn hình giáo viên gắn `question_option_rationale` cho câu Phần 1 — giới hạn **1 chương thí điểm** (đề xuất: chương đang dạy thật hiện tại, theo đúng cách chọn "Chương 1/2 học kỳ 1" đã làm ở Learning Lab). | Đợt 1 | Trung bình — đây là việc thủ công lặp lại, đúng loại việc từng "chết" với `question_type_id` nếu không giới hạn phạm vi. |
| 3 | Nối `classifyError()` vào `submitAttempt()`, ghi `student_error_instances`. Exam Autopsy tab trong `ResultPage.tsx`. | Đợt 1, 2 | Thấp — chỉ thêm ghi, không sửa luồng chấm điểm cũ. |
| 4 | `skill_prerequisites`: seed tự động `ppct_order`, giáo viên xác nhận ~5-10 cạnh `curated` quan trọng cho chương thí điểm. Trang Bản đồ Tri thức. | Đợt 1 | Thấp |
| 5 | Learning Health Score + Dashboard mở rộng. | Đợt 1, 3 | Thấp — công thức mới, không sửa `diagnoseTopic()` cũ. |
| 6 | Mở rộng ra chương khác/toàn bộ ngân hàng, nếu Đợt 1–5 chạy đúng trên chương thí điểm. | Đợt 1–5 | — |

**Không chạy migration nào trong lượt trả lời này** — theo đúng quy trình đã dùng xuyên suốt dự án (đánh giá → Thầy Tường duyệt/chỉnh → mới viết code), tránh lặp lại tình huống "đề xuất rồi tạm hoãn" nếu phạm vi chưa đúng ý.

### 6.2 Quyết định cần Thầy Tường xác nhận, không phải điều tài liệu này tự quyết được

1. **Chương thí điểm cho Error Intelligence** (Đợt 2) — nên là chương đang dạy thật ở học kỳ hiện tại (tương tự lý do đã chọn Chương 1/2 cho Learning Lab trước đây), cần Thầy Tường chốt cụ thể là chương nào theo tiến độ hiện tại.
2. **Giữ 5 mức `MasteryLabel` hay gộp còn 4 tầng Xanh/Vàng/Đỏ/Xám** cho giao diện mới (mục 4.1) — đề xuất giữ 5 mức, nhưng đây là lựa chọn hiển thị, Thầy Tường quyết.
3. **Ai gắn `question_option_rationale`** — giáo viên tự làm hay để AI gợi ý trước từ `solution_latex` (chỉ khả thi với câu đã có lời giải chi tiết — hiện không bắt buộc, cần kiểm tra % câu Phần 1 đang có `solution_latex` trước khi chọn hướng này).
4. **Có mở rộng Phần 2/3** (đúng/sai, trả lời ngắn) sang phân loại lỗi `high confidence` không — cần đầu tư `solution_latex` có cấu trúc bước giải, là việc lớn hơn nhiều, nên xét riêng sau khi Phần 1 chạy ổn.
5. **Trọng số trong `computeAttribution()` (0.4/0.4/0.2) và `computeLearningHealthScore()` (0.4/0.3/0.2/0.1)** — là khởi điểm hợp lý, cần Thầy Tường đối chiếu cảm nhận thực tế về học sinh sau vài tuần chạy thử trước khi coi là chuẩn.
