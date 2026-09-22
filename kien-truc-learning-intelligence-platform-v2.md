# Kiến trúc Learning Intelligence Platform v2 — chốt theo Design Decisions (22/09/2026)

**Thay thế/bổ sung cho:** `kien-truc-learning-intelligence-platform-v1.md` (đọc trước nếu cần bối cảnh đối chiếu lịch sử dự án — phần đó vẫn đúng, không lặp lại ở đây).
**Trạng thái:** đặc tả kỹ thuật đã chốt theo chỉ đạo, sẵn sàng để bắt đầu code Đợt 1 — xem mục "Việc cần làm ngay" ở cuối trước khi bấm chạy migration.

## 0. Đổi gì so với v1

| Quyết định | v1 | v2 (chốt) |
|---|---|---|
| Node của Knowledge Graph | `topics` HOẶC `lessons` (polymorphic) | Chỉ `lessons` — đơn giản hơn, đúng chỉ đạo |
| Gắn nhãn distractor | Giáo viên nhập tay (AI gợi ý phụ) | **AI đọc `solution_latex` soạn nháp trước → giáo viên duyệt** — giảm tải nhập liệu |
| Trung tâm màn hình học sinh | Learning Health Score to | **Learning Profile + drill-down giải trình** — Health Score lùi thành số phụ |
| Theo dõi tiến bộ | Chưa thiết kế cụ thể | Progress Story — định lượng bằng SỐ LẦN 1 lỗi cụ thể giảm qua thời gian |
| UI Knowledge Graph | "đồ thị" chung chung | Cây phân nhánh có hướng, ngôn ngữ "candidate root cause", cấm khẳng định tuyệt đối |
| Lộ trình | 6 đợt theo module | **5 đợt cuốn chiếu theo giá trị người dùng**, đúng thứ tự chỉ đạo |
| Bảng mới cần | 3 bảng (đã có `pattern` gộp trong `rationale_text`) | 3 bảng, thêm cột `pattern_label` (nhãn ngắn tái sử dụng được) — cần cho Progress Story định lượng theo TỪNG lỗi cụ thể |

---

## 1. Nguyên tắc & giới hạn kỹ thuật (guardrails — đã chốt)

- Không tạo `student_skill_mastery`/`mastery_snapshots` — giữ tính toán on-demand qua `diagnoseTopic()`/`diagnoseAllDifficulties()`, chỉ lưu dữ liệu gốc (rationale, error instance, prerequisite edge).
- Không tạo thực thể `skills` mới — `topics → lessons` là cây kiến thức duy nhất. `skill_prerequisites` là cạnh **giữa các `lessons`**, không có node loại khác.
- Không dùng Tailwind — mọi component mới dùng CSS token hiện có (`--space-*`, `--font-size-*`, `--shadow-*`, `data-theme`, class kiểu `.diagnosis-card`).
- Pilot 1–2 chương trọng điểm trước khi mở rộng toàn ngân hàng câu hỏi — ví dụ minh hoạ dùng "Ứng dụng đạo hàm" (Chương 1, lớp 12) làm chương chính vì đã có `topics`/`lessons` seed sẵn (migration_016) và đúng tiến độ học kỳ 1; chốt cụ thể ở mục "Việc cần làm ngay".

---

## 2. Module 1 — Exam Autopsy & Error Intelligence (ưu tiên 1)

### 2.1 Schema

```sql
-- migration_019_error_intelligence_core.sql (ĐỀ XUẤT — chưa chạy, chờ Thầy Tường duyệt)

-- ----------------------------------------------------------------------------
-- 1) Nhãn lỗi cho từng phương án nhiễu — gắn 1 lần lúc soạn/duyệt câu hỏi,
--    theo luồng "AI soạn nháp -> giáo viên duyệt" (mục 2.2), KHÔNG suy luận
--    lúc học sinh làm bài.
-- ----------------------------------------------------------------------------
create table if not exists question_option_rationale (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  -- Phần 1: 'A'|'B'|'C'|'D'. Phần 2: 'a'|'b'|'c'|'d'. Phần 3: null (không có phương án nhiễu rời rạc, xem mục 2.5).
  option_key text,
  is_correct boolean not null default false,
  error_type text not null check (error_type in ('procedural','conceptual','calculation','careless','n_a')),
  -- Nhãn NGẮN, tái sử dụng được qua nhiều câu hỏi khác nhau cùng bản chất lỗi
  -- (vd "Quên đổi cận") -- khác rationale_text (mô tả đầy đủ, có thể khác nhau
  -- từng câu). Đây là cột QUAN TRỌNG NHẤT cho Progress Story (Module 2, mục 3.2)
  -- vì cho phép đếm "lỗi X giảm từ 4 xuống 1 lần" theo đúng 1 pattern_label,
  -- không phải đếm gộp cả error_type (quá rộng, không định lượng được câu chuyện
  -- tiến bộ cụ thể).
  pattern_label text,
  rationale_text text,
  ai_suggested boolean not null default false,
  verified_by_teacher boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, option_key)
);

comment on table question_option_rationale is
  'Nhãn lỗi cho phương án nhiễu, AI soạn nháp từ solution_latex, giáo viên xác
   nhận (verified_by_teacher) trước khi dùng để chấm Error DNA thật. Theo đúng
   pattern "AI gợi ý, giáo viên duyệt" đã dùng cho lesson_id/topic_id.';

alter table question_option_rationale enable row level security;
drop policy if exists "rationale_read_all" on question_option_rationale;
create policy "rationale_read_all" on question_option_rationale for select using (true);
drop policy if exists "rationale_write_teacher" on question_option_rationale;
create policy "rationale_write_teacher" on question_option_rationale for all
  using (is_teacher()) with check (is_teacher());

create index if not exists idx_rationale_pattern_label on question_option_rationale (pattern_label)
  where pattern_label is not null;

-- ----------------------------------------------------------------------------
-- 2) Error DNA thật, ghi 1 lần lúc chấm bài (submitAttempt) cho mỗi câu sai.
-- ----------------------------------------------------------------------------
create table if not exists student_error_instances (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references exam_attempts(id) on delete cascade,
  question_id uuid not null references questions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid references lessons(id) on delete set null, -- denormalized từ questions.lesson_id tại thời điểm chấm, tránh join lại mỗi lần đọc trend
  error_type text not null check (error_type in ('procedural','conceptual','calculation','careless','unclassified')),
  pattern_label text, -- denormalized từ question_option_rationale.pattern_label nếu confidence='high'
  confidence text not null check (confidence in ('high','medium','low')),
  signals jsonb not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

comment on table student_error_instances is
  'Kết quả 1 LẦN của Error Intelligence Engine cho mỗi câu sai -- ghi lúc nộp
   bài, không tính lại on-demand (input không đổi sau khi đã nộp). lesson_id +
   pattern_label denormalized để Recurring Pattern / Progress Story query
   thẳng bảng này, không phải join ngược questions/rationale mỗi lần.';

alter table student_error_instances enable row level security;
drop policy if exists "error_instances_select" on student_error_instances;
create policy "error_instances_select" on student_error_instances
  for select using (is_teacher() or student_id = auth.uid());
drop policy if exists "error_instances_write" on student_error_instances;
create policy "error_instances_write" on student_error_instances
  for all using (is_teacher() or student_id = auth.uid());

create index if not exists idx_error_instances_student_pattern
  on student_error_instances (student_id, pattern_label, created_at)
  where pattern_label is not null;
```

### 2.2 AI Distractor Extraction — luồng + prompt mẫu

**Luồng (đúng như chỉ đạo):**

1. Giáo viên mở 1 câu hỏi (trong Ngân hàng câu hỏi hoặc lúc duyệt đề mới nhập) chưa có `question_option_rationale` cho đủ các phương án sai.
2. Hệ thống lấy `content_latex`, `options`, `correct_answer`, `solution_latex` (nếu có), và **danh sách `pattern_label` đã tồn tại cho cùng `lesson_id`** (để AI ưu tiên tái dùng nhãn cũ thay vì tạo nhãn gần giống mới — tránh "Quên đổi cận" và "Không đổi cận tích phân" trở thành 2 pattern khác nhau).
3. Gọi AI (Gemini Flash/Flash-Lite, dự phòng Claude Haiku — đúng lựa chọn stack đã chốt trong `de-xuat-giai-phap-ky-thuat-website-thi-online.md`) với prompt bên dưới.
4. Hiển thị bản nháp AI cho giáo viên: mỗi phương án sai có `error_type` (dropdown 4 giá trị), `pattern_label` (input có gợi ý autocomplete từ danh sách đã tồn tại), `rationale_text` (textarea). Giáo viên sửa/giữ nguyên, bấm "Xác nhận" → `verified_by_teacher = true`.
5. Nếu `solution_latex` rỗng: AI vẫn chạy nhưng chỉ dựa vào `content_latex`+`options`+`correct_answer`, đánh dấu toàn bộ gợi ý ở độ tin cậy thấp hơn (hiển thị badge "AI đoán không có lời giải — kiểm tra kỹ" cho giáo viên), không chặn luồng.

**Prompt mẫu (gọi 1 lần/câu hỏi, xử lý cả 3-4 phương án sai cùng lúc để tiết kiệm lượt gọi):**

```
Bạn là trợ lý phân tích lỗi sai cho giáo viên Toán THPT. Nhiệm vụ: với MỖI
phương án SAI của câu hỏi trắc nghiệm dưới đây, suy luận vì sao một học sinh
có thể chọn nhầm phương án đó, rồi phân loại vào đúng 1 trong 4 loại lỗi:

- "procedural": đúng công thức/hướng đi nhưng thiếu bước hoặc sai thứ tự bước.
- "conceptual": nhầm bản chất định lý/điều kiện áp dụng/điều kiện xác định.
- "calculation": hướng giải đúng hoàn toàn, chỉ sai ở bước tính toán/rút gọn/đại số.
- "careless": đáp án nhiễu "hiển nhiên" (vd sai dấu đơn giản, nhầm số liệu đề
  bài) mà một học sinh đã hiểu bài vẫn có thể bấm nhầm nếu vội.

Nếu không đủ căn cứ để phân biệt chắc chắn, chọn loại GẦN ĐÚNG NHẤT, không bịa.

--- CÂU HỎI ---
Nội dung (LaTeX): {content_latex}
Các phương án: {options}
Đáp án đúng: {correct_answer}
Lời giải (nếu có): {solution_latex hoặc "KHÔNG CÓ — chỉ dựa vào nội dung câu hỏi và đáp án"}

--- NHÃN LỖI ĐÃ DÙNG CHO BÀI NÀY (ưu tiên tái dùng nếu đúng bản chất, không tạo nhãn mới gần giống) ---
{danh sách pattern_label đã tồn tại cho lesson_id này, hoặc "Chưa có nhãn nào"}

--- YÊU CẦU ĐẦU RA ---
Trả về ĐÚNG định dạng JSON sau, không thêm chữ nào khác:
{
  "options": [
    {
      "option_key": "A",
      "is_correct": false,
      "error_type": "conceptual",
      "pattern_label": "Quên đổi cận",
      "rationale_text": "Học sinh đổi biến u nhưng quên đổi lại cận tích phân theo u, giữ nguyên cận theo x.",
      "ai_confidence": "high"
    }
  ]
}
ai_confidence = "low" nếu không có lời giải chi tiết để đối chiếu.
```

Hàm gọi tương ứng, cùng file với các hàm AI hiện có:

```ts
// src/lib/ai.ts — hàm mới, cùng pattern suggestQuestionType()/matchLessonByName()
export async function suggestOptionRationale(
  question: QuestionRow,
  existingPatternLabels: string[],
): Promise<AiRationaleSuggestion[]> {
  // build prompt như trên, gọi model đã cấu hình, parse JSON, validate error_type
  // thuộc đúng 4 giá trị -- nếu parse lỗi, trả mảng rỗng (KHÔNG throw, luồng
  // đã có sẵn quy ước "AI lỗi thì để giáo viên tự nhập tay", giống ai.ts hiện tại).
}
```

### 2.3 Thuật toán tra cứu Error DNA (deterministic, chạy lúc `submitAttempt`)

```ts
// src/lib/errorIntelligence.ts (mới) — hàm thuần, có unit test
import type { Difficulty } from "./types";
import type { MasteryLabel } from "./diagnosis";
import { RUSHED_TIME_RATIO } from "./diagnosis"; // tái dùng hằng số đã có, không định nghĩa lại

export type ErrorType = "procedural" | "conceptual" | "calculation" | "careless" | "unclassified";
export type ErrorConfidence = "high" | "medium" | "low";

export interface ErrorClassificationInput {
  timeSpentSeconds: number;
  expectedTimeSeconds: number;
  masteryAtTimeOfAnswer: MasteryLabel; // diagnoseTopic() tính trên dữ liệu TRƯỚC lượt thi này
  rationale: { errorType: ErrorType; patternLabel: string | null; verifiedByTeacher: boolean } | null;
  // null nếu Phần 2/3, hoặc Phần 1 nhưng phương án học sinh chọn chưa có rationale
}

export interface ErrorClassificationResult {
  errorType: ErrorType;
  patternLabel: string | null;
  confidence: ErrorConfidence;
  reason: string;
}

const CARELESS_MASTERY: MasteryLabel[] = ["vung", "chua_chac_chan"];

export function classifyError(input: ErrorClassificationInput): ErrorClassificationResult {
  // Bậc 1 — có rationale đã giáo viên duyệt: tin cậy cao nhất.
  if (input.rationale?.verifiedByTeacher) {
    return {
      errorType: input.rationale.errorType,
      patternLabel: input.rationale.patternLabel,
      confidence: "high",
      reason: "Xác định từ nhãn lỗi đã giáo viên xác nhận cho phương án đã chọn.",
    };
  }

  // Bậc 2 — tín hiệu hành vi careless (mastery đang tốt + làm rất nhanh).
  const timeRatio = input.timeSpentSeconds / input.expectedTimeSeconds;
  if (CARELESS_MASTERY.includes(input.masteryAtTimeOfAnswer) && timeRatio <= RUSHED_TIME_RATIO) {
    return {
      errorType: "careless",
      patternLabel: null,
      confidence: "medium",
      reason: `Kỹ năng đang ở mức "vững/chưa chắc chắn" nhưng làm câu này chỉ mất ${Math.round(timeRatio * 100)}% thời gian kỳ vọng.`,
    };
  }

  // Bậc 3 — không đủ căn cứ, không đoán.
  return { errorType: "unclassified", patternLabel: null, confidence: "low", reason: "Chưa đủ dữ liệu để xác định loại lỗi cụ thể." };
}
```

### 2.4 Thuật toán gom cụm Mẫu lỗi lặp lại (Recurring Errors)

Hai tầng, tái dùng tối đa hạ tầng đã có:

**Tầng thô (Chương/Bài)** — đã có sẵn, không viết lại: `summarizeClassRecurringGroups()`.

**Tầng mới (theo `pattern_label` cụ thể)** — trả lời đúng câu "Quên đổi cận lặp lại 3 lần trên 2 đề khác nhau":

```ts
// src/lib/errorIntelligence.ts — tiếp
export interface PatternOccurrence {
  attemptId: string;
  examId: string;
  patternLabel: string;
  occurredAt: string;
}

export interface RecurringPatternResult {
  patternLabel: string;
  totalCount: number;
  distinctExamCount: number; // "lặp lại trên NHIỀU ĐỀ khác nhau", không phải trong 1 đề
  isRecurring: boolean; // totalCount >= 2 AND distinctExamCount >= 2 -- cùng tinh thần MIN_SAMPLE_SIZE của diagnosis.ts
  firstOccurredAt: string;
  lastOccurredAt: string;
}

const RECURRING_MIN_OCCURRENCES = 2;
const RECURRING_MIN_DISTINCT_EXAMS = 2;

export function summarizePatternRecurrence(occurrences: PatternOccurrence[]): RecurringPatternResult[] {
  const byLabel = new Map<string, PatternOccurrence[]>();
  for (const o of occurrences) {
    const list = byLabel.get(o.patternLabel) ?? [];
    list.push(o);
    byLabel.set(o.patternLabel, list);
  }
  return Array.from(byLabel.entries())
    .map(([patternLabel, list]) => {
      const sorted = [...list].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
      const distinctExamCount = new Set(list.map((o) => o.examId)).size;
      return {
        patternLabel,
        totalCount: list.length,
        distinctExamCount,
        isRecurring: list.length >= RECURRING_MIN_OCCURRENCES && distinctExamCount >= RECURRING_MIN_DISTINCT_EXAMS,
        firstOccurredAt: sorted[0].occurredAt,
        lastOccurredAt: sorted[sorted.length - 1].occurredAt,
      };
    })
    .filter((r) => r.isRecurring)
    .sort((a, b) => b.totalCount - a.totalCount);
}
```

Nguồn dữ liệu: `select pattern_label, attempt_id, exam_attempts.exam_id, student_error_instances.created_at from student_error_instances join exam_attempts ... where student_id = ? and pattern_label is not null`.

### 2.5 Phần 2/3 — giới hạn thật, không che giấu

Không có phương án nhiễu rời rạc nên `rationale`/`pattern_label` luôn `null` cho Phần 2/3 → `classifyError()` chỉ có thể trả `careless`(medium) hoặc `unclassified`(low) cho 2 phần này. Hiển thị đúng như vậy trong UI (mục 2.6), không gắn nhãn `procedural`/`conceptual`/`calculation` giả cho Phần 2/3.

### 2.6 API payload — màn hình Exam Autopsy

```json
{
  "attempt_id": "uuid",
  "exam_title": "Đề kiểm tra 15 phút — Chương 1",
  "score_loss": {
    "total_lost": 2.5,
    "by_lesson": [
      { "lesson_id": "uuid", "lesson_name": "Cực trị của hàm số", "points_lost": 1.5, "points_possible": 3.0 },
      { "lesson_id": "uuid", "lesson_name": "Tiệm cận", "points_lost": 1.0, "points_possible": 2.0 }
    ]
  },
  "error_dna_cluster": [
    { "error_type": "conceptual", "count": 3, "example_pattern_label": "Quên điều kiện xác định" },
    { "error_type": "careless", "count": 1, "example_pattern_label": null },
    { "error_type": "unclassified", "count": 1, "example_pattern_label": null }
  ],
  "wrong_questions": [
    {
      "question_id": "uuid",
      "part": 1,
      "chosen_option": "B",
      "correct_option": "A",
      "error_type": "conceptual",
      "confidence": "high",
      "pattern_label": "Quên điều kiện xác định",
      "rationale_text": "Không loại nghiệm làm mẫu bằng 0 trước khi kết luận cực trị."
    }
  ]
}
```

### 2.7 Component wireframe — Exam Autopsy

```
ResultPage.tsx
  <Tab name="Mổ xẻ bài thi">                 // tab thứ 4, thêm cạnh 3 tab đã có
    <ScoreLossTable data={score_loss} />      // bảng ngang, dùng lại class .stat-table hiện có
    <ErrorDnaCluster data={error_dna_cluster} colorByType={ERROR_TYPE_COLOR /* mới, cùng style MASTERY_COLOR */} />
    <WrongQuestionList>
      {wrong_questions.map(q => (
        <QuestionReview {...q}>            // component ĐÃ CÓ, thêm props error_type/pattern_label/rationale_text
          <ErrorReasonBadge type={q.error_type} confidence={q.confidence} label={q.pattern_label} />  // mới, nhỏ
        </QuestionReview>
      ))}
    </WrongQuestionList>
```

Nguồn dữ liệu: 1 hàm mới `api.getExamAutopsy(attemptId)` — join `question_responses` + `student_error_instances` + `questions`/`lessons`, không polling, gọi 1 lần khi mở tab (giống cách các tab khác của `ResultPage.tsx` đã hoạt động).

---

## 3. Module 2 — Student Learning State 2.0 (Hồ sơ năng lực giải trình được)

### 3.1 Drill-down — cấu trúc dữ liệu + câu nhận định tự động

```ts
// src/lib/learningState.ts (mới) — hàm thuần
export interface DrillDownInput {
  lessonName: string;
  byDifficulty: DifficultyOutcomeGroup[]; // từ diagnoseAllDifficulties(), đã có
  errorBreakdown: Array<{ errorType: ErrorType; count: number }>;
}

/**
 * Sinh 1 câu nhận định NGẮN, theo thứ tự ưu tiên cố định (deterministic,
 * không gọi AI) -- đúng nguyên tắc "Explainable & Deterministic". Nếu không
 * khớp quy tắc nào, KHÔNG bịa câu chung chung -- trả null, UI ẩn dòng nhận định.
 */
export function generateInsightNarrative(input: DrillDownInput): string | null {
  const basicAcc = accuracyFor(input.byDifficulty, ["nhan_biet", "thong_hieu"]);
  const advancedAcc = accuracyFor(input.byDifficulty, ["van_dung", "van_dung_cao"]);
  const dominantError = topErrorType(input.errorBreakdown);

  // Quy tắc 1 — nắm cơ bản tốt nhưng đuối ở vận dụng nhiều bước (đúng ví dụ chỉ đạo)
  if (basicAcc !== null && advancedAcc !== null && basicAcc >= 0.75 && advancedAcc <= 0.4) {
    return "Em nắm vững công thức cơ bản nhưng gặp trở ngại khi bài toán cần kết hợp nhiều bước.";
  }
  // Quy tắc 2 — lỗi chủ yếu là careless, không phải chưa hiểu bài
  if (dominantError?.errorType === "careless" && dominantError.share >= 0.5) {
    return "Phần lớn điểm mất là do bất cẩn (làm nhanh, chọn nhầm) chứ không phải chưa hiểu bài — nên luyện chậm lại, kiểm tra lại đáp án trước khi nộp.";
  }
  // Quy tắc 3 — lỗi chủ yếu là conceptual
  if (dominantError?.errorType === "conceptual" && dominantError.share >= 0.5) {
    return "Phần lớn lỗi đến từ việc nhầm lẫn bản chất/điều kiện áp dụng, không phải do tính toán — nên ôn lại lý thuyết trước khi luyện thêm bài tập.";
  }
  // Quy tắc 4 — cơ bản cũng còn yếu (không tách được nắm-cơ-bản/yếu-vận-dụng)
  if (basicAcc !== null && basicAcc < 0.5) {
    return "Cả phần nhận biết/thông hiểu cơ bản đang còn yếu — nên ưu tiên củng cố lại kiến thức nền trước khi luyện câu khó.";
  }
  return null;
}
```

### 3.2 Progress Story — định lượng bằng số lần lỗi cụ thể giảm

```ts
// src/lib/learningState.ts — tiếp, dùng chung PatternOccurrence từ errorIntelligence.ts
export interface ProgressStoryPoint {
  patternLabel: string;
  countRecentWindow: number;   // vd 3 tuần gần nhất
  countPriorWindow: number;    // 3 tuần trước đó
  narrative: string | null;
}

const PROGRESS_MIN_PRIOR_COUNT = 2; // tránh khoe "giảm từ 1 xuống 0" -- không đủ ý nghĩa

export function computeProgressStory(
  occurrences: PatternOccurrence[],
  windowDays: number,
  now: Date,
): ProgressStoryPoint[] {
  const recentCutoff = new Date(now.getTime() - windowDays * 86400000);
  const priorCutoff = new Date(recentCutoff.getTime() - windowDays * 86400000);
  const byLabel = groupBy(occurrences, (o) => o.patternLabel);

  return Object.entries(byLabel)
    .map(([patternLabel, list]) => {
      const recent = list.filter((o) => new Date(o.occurredAt) >= recentCutoff).length;
      const prior = list.filter((o) => {
        const t = new Date(o.occurredAt);
        return t >= priorCutoff && t < recentCutoff;
      }).length;
      const narrative =
        prior >= PROGRESS_MIN_PRIOR_COUNT && recent < prior
          ? `Em đã giảm lỗi "${patternLabel}" từ ${prior} lần xuống còn ${recent} lần trong ${Math.round(windowDays / 7)} tuần qua.`
          : null;
      return { patternLabel, countRecentWindow: recent, countPriorWindow: prior, narrative };
    })
    .filter((p) => p.narrative !== null);
}
```

Kết hợp với `summarizeMasteryTrend()` đã có (không viết lại) cho phần "Mastery Delta theo tuần/tháng" ở cấp Chương/Bài — Progress Story = `summarizeMasteryTrend()` (trục điểm số) **+** `computeProgressStory()` (trục lỗi cụ thể giảm), 2 câu chuyện bổ sung cho nhau, không trộn logic.

### 3.3 API payload — Learning Profile Drill-down

```json
{
  "lesson_name": "Tích phân từng phần",
  "mastery_label": "co_lo_hong",
  "sample_count": 8,
  "by_difficulty": [
    { "difficulty": "nhan_biet", "accuracy": 0.9, "sample_count": 2 },
    { "difficulty": "van_dung", "accuracy": 0.2, "sample_count": 4 },
    { "difficulty": "van_dung_cao", "accuracy": 0.0, "sample_count": 2 }
  ],
  "insight_narrative": "Em nắm vững công thức cơ bản nhưng gặp trở ngại khi bài toán cần kết hợp nhiều bước.",
  "error_breakdown": [
    { "error_type": "conceptual", "count": 3, "share": 0.6, "example_pattern_label": "Quên điều kiện đổi cận" },
    { "error_type": "careless", "count": 1, "share": 0.2 }
  ],
  "recurring_patterns": [
    { "pattern_label": "Quên điều kiện đổi cận", "total_count": 3, "distinct_exam_count": 2 }
  ],
  "progress_story": [
    { "pattern_label": "Quên điều kiện đổi cận", "narrative": "Em đã giảm lỗi \"Quên điều kiện đổi cận\" từ 4 lần xuống còn 1 lần trong 3 tuần qua." }
  ],
  "learning_health_score": 62
}
```

`learning_health_score` vẫn trả về (công thức giữ nguyên từ v1, không đổi) nhưng đặt **cuối payload**, UI hiển thị nhỏ — đúng chỉ đạo "không đóng vai trò trung tâm".

### 3.4 Component wireframe

```
TeacherStudentDetail.tsx / StudentDashboard.tsx
  <LearningProfileSection>                    // mới, thay thế vị trí ý tưởng "Learning Health Card" to ở v1
    <SkillGroupList>                          // mở rộng mục "Lỗi lặp lại & xu hướng" đã có
      <SkillGroupItem mastery={...} onClick={openDrillDown}>
    <DrillDownPanel open={...}>                // accordion/modal khi click 1 kỹ năng
      <BloomAccuracyChart data={by_difficulty} />   // cột NB/TH/VD/VDC, tái dùng chart đã có cho mức tư duy
      <InsightNarrativeLine text={insight_narrative} />  // ẩn nếu null, KHÔNG hiện câu rỗng
      <ErrorBreakdownChips data={error_breakdown} />
      <ProgressStoryList items={progress_story} />
      <small className="health-score-footnote">Chỉ số tổng hợp: {learning_health_score}/100 (ước tính, dựa trên {sample_count} câu)</small>
```

---

## 4. Module 3 — Knowledge Graph & Candidate Root-Cause Engine

### 4.1 Schema — chỉ cạnh giữa các `lessons`

```sql
-- Tiếp migration_019_error_intelligence_core.sql

create table if not exists skill_prerequisites (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,             -- Bài đang xét (vd "Cực trị của hàm số")
  prerequisite_lesson_id uuid not null references lessons(id) on delete cascade, -- Bài tiên quyết (vd "Quy tắc tính đạo hàm")
  weight numeric(3,2) not null default 0.5 check (weight between 0 and 1),
  source text not null default 'curated' check (source in ('curated','ppct_order')),
  -- 'ppct_order': lesson N phụ thuộc yếu (weight mặc định 0.3) vào lesson N-1
  --   CÙNG topic, suy tự động từ lessons.order_index -- không cần giáo viên nhập.
  -- 'curated': quan hệ XUYÊN chương/khối quan trọng, giáo viên xác nhận từng cái
  --   (AI có thể gợi ý dựa trên tên 2 Bài, giáo viên duyệt) -- weight cao hơn.
  created_at timestamptz not null default now(),
  check (lesson_id <> prerequisite_lesson_id),
  unique (lesson_id, prerequisite_lesson_id)
);

comment on table skill_prerequisites is
  'Cạnh tiên quyết CHỈ giữa các lessons (không có node loại khác) -- DAG cố
   tình thưa: ppct_order seed tự động, curated do giáo viên xác nhận từng cạnh
   có giá trị chẩn đoán cao, không suy luận toàn bộ đồ thị bằng AI/thống kê.';

alter table skill_prerequisites enable row level security;
drop policy if exists "prereq_read_all" on skill_prerequisites;
create policy "prereq_read_all" on skill_prerequisites for select using (true);
drop policy if exists "prereq_write_teacher" on skill_prerequisites;
create policy "prereq_write_teacher" on skill_prerequisites for all
  using (is_teacher()) with check (is_teacher());
```

**Seed tự động `ppct_order` (chạy 1 lần sau khi bảng tạo xong, không cần giáo viên nhập):**

```sql
insert into skill_prerequisites (lesson_id, prerequisite_lesson_id, weight, source)
select l2.id, l1.id, 0.3, 'ppct_order'
from lessons l1
join lessons l2 on l2.topic_id = l1.topic_id and l2.order_index = l1.order_index + 1
where not exists (
  select 1 from skill_prerequisites sp
  where sp.lesson_id = l2.id and sp.prerequisite_lesson_id = l1.id
);
```

### 4.2 Thuật toán `computeAttribution()` — ngôn ngữ "candidate", không khẳng định tuyệt đối

```ts
// src/lib/knowledgeGraph.ts (mới) — hàm thuần
export interface AttributionInput {
  targetLessonName: string;
  targetMastery: TopicDiagnosis;
  prerequisites: Array<{ lessonName: string; mastery: TopicDiagnosis; weight: number }>;
}

export interface AttributionResult {
  prerequisiteName: string;
  attributionScore: number; // 0..1, dùng để SẮP XẾP ứng viên, không hiển thị trực tiếp cho học sinh như "% chắc chắn"
  isCandidate: true;        // luôn true -- nhắc code review/UI: đây KHÔNG BAO GIỜ là "proven root cause"
  explanation: string;      // câu duy nhất được phép hiển thị, đúng khuôn mẫu đã chốt
}

const MIN_SAMPLE_SIZE = 2; // trùng ngưỡng diagnosis.ts

export function computeAttribution(input: AttributionInput): AttributionResult[] {
  return input.prerequisites
    .filter((p) => p.mastery.sampleCount >= MIN_SAMPLE_SIZE && input.targetMastery.sampleCount >= MIN_SAMPLE_SIZE)
    .map((p) => {
      const weaknessFactor = 1 - p.mastery.avgScoreRatio;
      const gapFactor = Math.max(0, input.targetMastery.avgScoreRatio - p.mastery.avgScoreRatio);
      const score = Math.round((p.weight * 0.4 + weaknessFactor * 0.4 + gapFactor * 0.2) * 100) / 100;
      return {
        prerequisiteName: p.lessonName,
        attributionScore: score,
        isCandidate: true as const,
        explanation:
          `TNT nhận thấy khó khăn ở "${input.targetLessonName}" có thể liên quan đến ` +
          `"${p.lessonName}" — dựa trên ${p.mastery.sampleCount} câu "${p.lessonName}" ` +
          `(${Math.round(p.mastery.avgScoreRatio * 100)}%) và ${input.targetMastery.sampleCount} câu ` +
          `"${input.targetLessonName}" (${Math.round(input.targetMastery.avgScoreRatio * 100)}%).`,
      };
    })
    .sort((a, b) => b.attributionScore - a.attributionScore)
    .slice(0, 3); // tối đa 3 ứng viên -- nhiều hơn sẽ loãng, mất giá trị chẩn đoán
}
```

Nguyên tắc bắt buộc trong code lẫn UI: **không có nơi nào trong hệ thống được phép in ra câu dạng "X là nguyên nhân khiến em yếu Y"** — chỉ có đúng 1 khuôn câu (`explanation` ở trên). Đây là ràng buộc sản phẩm, nên `AttributionResult.explanation` được sinh cứng trong hàm này (không cho UI tự ghép chuỗi khác) để không ai vô tình viết câu khẳng định tuyệt đối ở nơi khác.

### 4.3 UX — cây phân nhánh, không mạng nhện

Layout: node gốc (Bài/Chương đang yếu) ở giữa trên cùng, các ứng viên tiên quyết xếp thành hàng ngang bên dưới, nối bằng đường có hướng (mũi tên chỉ LÊN node gốc, thể hiện "nền tảng cho"). Không dùng force-directed graph (dạng mạng nhện) — đồ thị cố tình thưa (mục 4.1) nên không cần; layout cây đơn giản dễ đọc hơn nhiều với học sinh cấp 3.

### 4.4 API payload — Candidate Root-Cause Modal

```json
{
  "target": { "lesson_name": "Cực trị của hàm số", "mastery_percent": 37, "sample_count": 8 },
  "candidates": [
    {
      "lesson_name": "Quy tắc tính đạo hàm",
      "mastery_percent": 54,
      "sample_count": 8,
      "attribution_score": 0.61,
      "explanation": "TNT nhận thấy khó khăn ở \"Cực trị của hàm số\" có thể liên quan đến \"Quy tắc tính đạo hàm\" — dựa trên 8 câu \"Quy tắc tính đạo hàm\" (54%) và 8 câu \"Cực trị của hàm số\" (37%)."
    }
  ],
  "disclaimer": "Đây là các gợi ý dựa trên số liệu, không phải kết luận chắc chắn — nên đối chiếu thêm với quan sát thực tế trên lớp."
}
```

`disclaimer` là field bắt buộc trong payload (không phải chỉ ở UI) để mọi nơi tiêu thụ API này (kể cả nếu sau này có báo cáo phụ huynh dùng lại) đều mang theo đúng caveat.

### 4.5 Component wireframe

```
TeacherKnowledgeMap.tsx (trang mới)
  <LessonTreeView lessons={...} prerequisites={...} masteryByLesson={...}>
    <LessonNode highlight={mastery < 60} onClick={openRootCauseModal} />
  <RootCauseModal target={...} candidates={...} disclaimer={...}>   // mở khi click 1 node yếu
    <CandidateCard {...candidate} />                                 // mỗi ứng viên 1 card, KHÔNG xếp hạng bằng số thứ tự "1,2,3" để tránh cảm giác chắc chắn tuyệt đối, chỉ xếp bằng vị trí
```

---

## 5. Lộ trình 5 đợt (cuốn chiếu theo giá trị người dùng)

| Đợt | Nội dung | Nghiệm thu |
|---|---|---|
| **1 — Error Rationale & Engine** | Chạy `migration_019` (2 bảng đầu). `suggestOptionRationale()` trong `ai.ts` + màn hình giáo viên duyệt nháp AI. `classifyError()` + unit test. Áp dụng cho **câu Phần 1 thuộc chương thí điểm**. | Mở 1 câu Phần 1 chưa gắn nhãn → AI ra nháp hợp lý cho cả 3 phương án sai → giáo viên sửa/duyệt → `verified_by_teacher=true` lưu đúng. |
| **2 — Exam Autopsy View** | Nối `classifyError()` vào `submitAttempt()`, ghi `student_error_instances`. Tab "Mổ xẻ bài thi" trong `ResultPage.tsx` (mục 2.6-2.7). | Học sinh nộp 1 đề có câu thuộc chương thí điểm → tab mới hiện đúng điểm mất theo Bài + cụm lỗi + lý do từng câu sai. |
| **3 — Learning State 2.0 Dashboard** | `learningState.ts` (drill-down + `generateInsightNarrative`), `DrillDownPanel` (mục 3.4). Nhận diện mẫu lỗi lặp lại theo `pattern_label` (mục 2.4) hiển thị trong drill-down. | Click 1 kỹ năng yếu → hiện đúng breakdown Bloom + câu nhận định hợp lý + danh sách lỗi lặp lại (nếu có). |
| **4 — Knowledge Graph & Root Cause** | `migration_019` phần `skill_prerequisites` + seed `ppct_order`. Giáo viên xác nhận ~5-10 cạnh `curated` cho chương thí điểm. `computeAttribution()` + `TeacherKnowledgeMap.tsx`. | Click 1 Bài yếu có cạnh tiên quyết đã curated → modal hiện đúng 1-3 ứng viên kèm câu giải thích + disclaimer. |
| **5 — Learning Timeline & Progress Story** | `computeProgressStory()` (mục 3.2), tích hợp `summarizeMasteryTrend()` vào cùng khu vực. Biểu đồ tăng trưởng mastery theo tuần/tháng. | Với 1 học sinh có ≥2 lần mắc cùng `pattern_label` cách nhau vài tuần rồi giảm → Progress Story hiện đúng câu định lượng. |

Mỗi đợt chạy độc lập, nghiệm thu xong mới sang đợt sau — đúng nguyên tắc đã dùng xuyên suốt dự án. Đợt 3-5 phụ thuộc dữ liệu Đợt 1-2 sinh ra (không có `student_error_instances` thì không có gì để hiển thị) — vì vậy thứ tự KHÔNG thể đảo, dù giá trị người dùng của Đợt 3 (Dashboard) trực quan hơn Đợt 1 (chỉ là màn hình giáo viên gắn nhãn).

---

## 6. Việc cần làm ngay (tích hợp vào hệ thống)

1. **Xác nhận chương thí điểm cụ thể** — đề xuất Chương 1 "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số" (lớp 12) vì đã có `lessons` seed sẵn và đúng ví dụ trong chỉ đạo; nếu Thầy Tường muốn "Tích phân" (Chương 4, lớp 12, cũng đã seed) hoặc chương khác đang dạy thật ở học kỳ này, báo lại để chốt trước khi chạy Đợt 1.
2. **Sau khi chốt chương thí điểm, xác nhận để bắt đầu code Đợt 1** — khi đó tôi sẽ: viết `migration_019_error_intelligence_core.sql` (2 bảng đầu) đầy đủ, viết `src/lib/errorIntelligence.ts` + test, viết `suggestOptionRationale()` trong `ai.ts`, và màn hình giáo viên duyệt nháp AI — đúng cách các đợt trước đã giao (code + test pass + hướng dẫn chạy migration thủ công trên Supabase Dashboard).
3. **Việc thủ công 1 lần khi Đợt 1 xong:** chạy `migration_019...sql` trong Supabase SQL Editor (giống mọi migration trước — hướng dẫn cụ thể sẽ kèm theo khi giao code, không làm trước khi có code thật để tránh chạy migration rỗng).
4. **Kiểm tra % câu Phần 1 thuộc chương thí điểm đang có `solution_latex`** — quyết định độ hiệu quả của bước AI soạn nháp (mục 2.2); nếu tỉ lệ thấp, có thể cần đợt bổ sung lời giải trước khi Đợt 1 phát huy hết tác dụng — sẽ kiểm tra trực tiếp trong DB khi bắt đầu code, không cần Thầy Tường tự tra.
