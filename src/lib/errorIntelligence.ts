/**
 * Error Intelligence Engine — tra cứu "Error DNA" (loại lỗi) cho từng câu sai,
 * và gom cụm mẫu lỗi lặp lại theo pattern_label cụ thể (Đợt 1, 22/09/2026).
 *
 * QUAN TRỌNG: giống diagnosis.ts, đây là các hàm THUẦN (pure function), không
 * gọi AI, không phụ thuộc DB/mạng. Việc gọi AI (suggestOptionRationale) nằm
 * riêng ở ai.ts, và CHỈ chạy lúc giáo viên soạn/duyệt câu hỏi -- không chạy
 * lúc học sinh làm bài. classifyError() ở đây chỉ TRA CỨU kết quả đã có sẵn
 * (rationale đã giáo viên duyệt) hoặc áp dụng 1 tín hiệu hành vi đơn giản
 * (careless) -- không có bước "AI đoán" nào khi học sinh nộp bài.
 *
 * Xem đầy đủ thiết kế & lý do trong tài liệu dự án "Website thi Online"
 * (Claude Project), file kien-truc-learning-intelligence-platform-v2.md.
 */

import type { Difficulty, DistractorErrorType, ErrorConfidence, ErrorInstanceType } from "./types";
import type { MasteryLabel, QuestionOutcome } from "./diagnosis";
import { DEFAULT_EXPECTED_TIME_SECONDS, diagnoseTopic, RUSHED_TIME_RATIO } from "./diagnosis";
import { maxScoreOf, PART2_SCORE_TABLE } from "./scoring";
import type { Part1Answer } from "./types";

export const ERROR_TYPE_LABELS: Record<ErrorInstanceType, string> = {
  procedural: "Lỗi thủ tục (thiếu/sai thứ tự bước)",
  conceptual: "Lỗi khái niệm (nhầm bản chất/điều kiện)",
  calculation: "Lỗi tính toán (đúng hướng, sai bước tính)",
  careless: "Lỗi bất cẩn (đọc/chọn vội)",
  unclassified: "Chưa xác định được loại lỗi cụ thể",
};

/** Màu đại diện cho từng loại lỗi -- dùng inline style (giống cách MASTERY_COLOR
 * đang dùng ở ResultPage.tsx/TeacherStudentDetail.tsx), không phải class CSS mới. */
export const ERROR_TYPE_COLOR: Record<ErrorInstanceType, string> = {
  procedural: "#7c5cbf",
  conceptual: "#c0392b",
  calculation: "#b8860b",
  careless: "#6b7280",
  unclassified: "#9ca3af",
};

/** Nhãn ngắn cho chip/badge trên giao diện. */
export const ERROR_TYPE_SHORT_LABELS: Record<ErrorInstanceType, string> = {
  conceptual: "Lỗi khái niệm",
  procedural: "Lỗi thủ tục",
  calculation: "Lỗi tính toán",
  careless: "Lỗi bất cẩn",
  unclassified: "Chưa xác định",
};

export const DISTRACTOR_ERROR_TYPE_LABELS: Record<DistractorErrorType, string> = {
  procedural: "Lỗi thủ tục",
  conceptual: "Lỗi khái niệm",
  calculation: "Lỗi tính toán",
  careless: "Lỗi bất cẩn",
  n_a: "Không áp dụng (phương án đúng)",
};

// -----------------------------------------------------------------------------
// classifyError() — tra cứu Error DNA lúc chấm bài (Đợt 2 sẽ gọi trong
// submitAttempt()). Bậc 1: rationale đã giáo viên duyệt (tin cậy cao). Bậc 2:
// tín hiệu careless (mastery đang tốt + làm rất nhanh). Bậc 3: không đủ căn
// cứ, KHÔNG đoán giữa procedural/conceptual/calculation.
// -----------------------------------------------------------------------------

export interface ErrorClassificationInput {
  timeSpentSeconds: number;
  expectedTimeSeconds: number;
  /** diagnoseTopic() tính trên dữ liệu TRƯỚC lượt thi này -- không tính luôn cả lượt đang chấm, tránh vòng lặp ngược. */
  masteryAtTimeOfAnswer: MasteryLabel;
  /** null nếu Phần 2/3, hoặc Phần 1 nhưng phương án học sinh chọn chưa có rationale đã duyệt. */
  rationale: {
    errorType: DistractorErrorType;
    patternLabel: string | null;
    verifiedByTeacher: boolean;
  } | null;
}

export interface ErrorClassificationResult {
  errorType: ErrorInstanceType;
  patternLabel: string | null;
  confidence: ErrorConfidence;
  reason: string;
}

const CARELESS_MASTERY: MasteryLabel[] = ["vung", "chua_chac_chan"];

export function classifyError(input: ErrorClassificationInput): ErrorClassificationResult {
  if (input.rationale?.verifiedByTeacher && input.rationale.errorType !== "n_a") {
    return {
      errorType: input.rationale.errorType,
      patternLabel: input.rationale.patternLabel,
      confidence: "high",
      reason: "Xác định từ nhãn lỗi đã giáo viên xác nhận cho phương án đã chọn.",
    };
  }

  const timeRatio =
    input.expectedTimeSeconds > 0 ? input.timeSpentSeconds / input.expectedTimeSeconds : 1;
  // timeSpentSeconds = 0 nghĩa là KHÔNG CÓ dữ liệu thời gian (lượt làm cũ,
  // thiếu sự kiện xem câu) — không được hiểu thành "làm cực nhanh".
  if (
    input.timeSpentSeconds > 0 &&
    CARELESS_MASTERY.includes(input.masteryAtTimeOfAnswer) &&
    timeRatio <= RUSHED_TIME_RATIO
  ) {
    return {
      errorType: "careless",
      patternLabel: null,
      confidence: "medium",
      reason: `Kỹ năng đang ở mức "vững/chưa chắc chắn" nhưng làm câu này chỉ mất ${Math.round(timeRatio * 100)}% thời gian kỳ vọng.`,
    };
  }

  return {
    errorType: "unclassified",
    patternLabel: null,
    confidence: "low",
    reason: "Chưa đủ dữ liệu để xác định loại lỗi cụ thể cho câu này.",
  };
}

// -----------------------------------------------------------------------------
// summarizePatternRecurrence() — gom cụm mẫu lỗi lặp lại theo pattern_label cụ
// thể (khác summarizeClassRecurringGroups() của diagnosis.ts, vốn gom theo
// Chương/Bài -- đây là trục "loại lỗi cụ thể", độc lập, không trộn logic).
// -----------------------------------------------------------------------------

export interface PatternOccurrence {
  attemptId: string;
  examId: string;
  patternLabel: string;
  occurredAt: string;
}

export interface RecurringPatternResult {
  patternLabel: string;
  totalCount: number;
  /** Số đề KHÁC NHAU đã xuất hiện lỗi này -- "lặp lại qua nhiều đề", không phải nhiều câu cùng 1 đề. */
  distinctExamCount: number;
  isRecurring: boolean;
  firstOccurredAt: string;
  lastOccurredAt: string;
}

const RECURRING_MIN_OCCURRENCES = 2;
const RECURRING_MIN_DISTINCT_EXAMS = 2;

export function summarizePatternRecurrence(
  occurrences: PatternOccurrence[],
): RecurringPatternResult[] {
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
        isRecurring:
          list.length >= RECURRING_MIN_OCCURRENCES && distinctExamCount >= RECURRING_MIN_DISTINCT_EXAMS,
        firstOccurredAt: sorted[0].occurredAt,
        lastOccurredAt: sorted[sorted.length - 1].occurredAt,
      };
    })
    .filter((r) => r.isRecurring)
    .sort((a, b) => b.totalCount - a.totalCount);
}


// =============================================================================
// Củng cố 27/09/2026 — Error DNA tính ON-DEMAND (không ghi lúc nộp bài)
// =============================================================================
//
// Thiết kế v2 ban đầu định ghi kết quả classifyError() vào bảng
// student_error_instances NGAY lúc submitAttempt(). Đổi sang tính lại mỗi lần
// đọc (giống quyết định 31/08/2026 không dùng bảng snapshot cho mastery), vì:
//  1. Nhãn lỗi giáo viên xác nhận SAU khi học sinh đã thi vẫn áp dụng ngược
//     cho toàn bộ bài làm cũ — giáo viên được phép gắn nhãn dần dần, ưu tiên
//     câu học sinh sai nhiều nhất, không phải gắn đủ trước khi giao đề.
//  2. Không đụng vào luồng nộp bài (rủi ro cao nhất của hệ thống).
//  3. Giáo viên sửa điểm/chấm lại (regradeAttempt) hay sửa nhãn thì kết quả tự
//     đúng theo, không có dữ liệu snapshot bị lệch.
// Bảng student_error_instances (migration_019) vì vậy KHÔNG được dùng.
// -----------------------------------------------------------------------------

/** 1 câu hỏi trong 1 lượt làm bài của 1 học sinh — dạng "phẳng" đã chuẩn hoá
 * từ question_responses + questions + exam_attempts (xem
 * api.getStudentResponseFacts). Là đầu vào CHUNG của Module 1/2/3. */
export interface StudentResponseFact {
  attemptId: string;
  examId: string;
  examTitle: string;
  /** ISO — thời điểm bắt đầu lượt làm bài (dùng làm mốc thời gian của câu trả lời). */
  startedAt: string;
  questionId: string;
  part: 1 | 2 | 3;
  difficulty: Difficulty | null;
  topicId: string | null;
  topicName: string | null;
  topicOrder: number | null;
  lessonId: string | null;
  lessonName: string | null;
  lessonOrder: number | null;
  score: number;
  maxScore: number;
  timeSpentSeconds: number;
  changeCount: number;
  /** false = bỏ trống (final_answer null). */
  answered: boolean;
  /** Chỉ Phần 1: phương án học sinh chọn ('A'..'D'), null nếu bỏ trống/không phải Phần 1. */
  chosenOption: string | null;
  /** Chỉ Phần 1: đáp án đúng. */
  correctOption: string | null;
}

/** 1 dòng question_responses kèm câu hỏi + lượt làm (xem api.getStudentResponseFacts). */
export type ResponseFactRow = {
  id: string;
  question_id: string;
  final_answer: unknown;
  /** Đáp án giáo viên sửa lại sau khi nộp (migration_018) — ưu tiên hơn final_answer. */
  teacher_answer: unknown;
  score: number;
  sub_correct_count: number | null;
  time_spent_seconds: number;
  change_count: number;
  question: {
    part: 1 | 2 | 3;
    difficulty: Difficulty | null;
    default_points: number | null;
    correct_answer: unknown;
    topic: { id: string; name: string; order_index: number | null } | null;
    lesson: { id: string; name: string; order_index: number | null } | null;
  } | null;
  attempt: {
    id: string;
    exam_id: string;
    started_at: string;
    exam: { title: string } | null;
  };
};

/**
 * Chuẩn hoá điểm về BAREM CHUẨN để so sánh được giữa các đề (đề tính điểm tuỳ
 * chỉnh có thể cho 1 câu = 0.2 hay 0.5 điểm): Phần 1 so phương án với đáp án,
 * Phần 2 tra bảng PART2_SCORE_TABLE theo số ý đúng, Phần 3 có điểm > 0 là
 * đúng. Luôn dùng đáp án giáo viên đã sửa (teacher_answer) nếu có — giống hệt
 * cách regradeAttempt chấm lại.
 */
export function responseRowToFact(r: ResponseFactRow): StudentResponseFact | null {
  if (!r.question) return null;
  const q = r.question;
  const maxScore = maxScoreOf(q, undefined);
  const effective = r.teacher_answer ?? r.final_answer ?? null;
  const answered = effective !== null && effective !== undefined;
  const chosen = q.part === 1 && answered ? ((effective as Partial<Part1Answer>).choice ?? null) : null;
  const correct = q.part === 1 ? ((q.correct_answer as Partial<Part1Answer>)?.choice ?? null) : null;
  let score: number;
  if (!answered) score = 0;
  else if (q.part === 1) score = chosen !== null && chosen === correct ? maxScore : 0;
  else if (q.part === 3) score = r.score > 0 ? maxScore : 0;
  else if (r.sub_correct_count !== null && r.sub_correct_count !== undefined) {
    const n = Math.max(0, Math.min(4, Math.round(r.sub_correct_count))) as 0 | 1 | 2 | 3 | 4;
    score = PART2_SCORE_TABLE[n];
  } else score = Math.min(maxScore, Math.max(0, r.score));
  return {
    attemptId: r.attempt.id,
    examId: r.attempt.exam_id,
    examTitle: r.attempt.exam?.title ?? "(đề đã xoá)",
    startedAt: r.attempt.started_at,
    questionId: r.question_id,
    part: q.part,
    difficulty: q.difficulty,
    topicId: q.topic?.id ?? null,
    topicName: q.topic?.name ?? null,
    topicOrder: q.topic?.order_index ?? null,
    lessonId: q.lesson?.id ?? null,
    lessonName: q.lesson?.name ?? null,
    lessonOrder: q.lesson?.order_index ?? null,
    score,
    maxScore,
    timeSpentSeconds: r.time_spent_seconds ?? 0,
    changeCount: r.change_count ?? 0,
    answered,
    chosenOption: chosen,
    correctOption: correct,
  };
}

export interface RationaleEntry {
  errorType: DistractorErrorType;
  patternLabel: string | null;
  rationaleText: string | null;
  verifiedByTeacher: boolean;
}

export function rationaleKey(questionId: string, optionKey: string): string {
  return `${questionId}::${optionKey}`;
}

/** Sai = CÓ trả lời nhưng chưa đạt trọn điểm. Câu bỏ trống KHÔNG tính là "lỗi"
 * ở đây — đã có chẩn đoán riêng "chưa kịp đọc / đọc rồi bỏ qua"
 * (classifyBlankQuestions trong diagnosis.ts), không trộn 2 loại. */
export function isWrongFact(f: Pick<StudentResponseFact, "answered" | "score" | "maxScore">): boolean {
  return f.answered && f.maxScore > 0 && f.score < f.maxScore - 0.005;
}

export function factToOutcome(f: StudentResponseFact): QuestionOutcome {
  return {
    part: f.part,
    scoreRatio: f.maxScore > 0 ? Math.min(1, Math.max(0, f.score / f.maxScore)) : 0,
    timeSpentSeconds: f.timeSpentSeconds,
    changeCount: f.changeCount,
  };
}

export interface ErrorInstance {
  attemptId: string;
  examId: string;
  examTitle: string;
  occurredAt: string;
  questionId: string;
  part: 1 | 2 | 3;
  difficulty: Difficulty | null;
  topicId: string | null;
  topicName: string | null;
  lessonId: string | null;
  lessonName: string | null;
  chosenOption: string | null;
  correctOption: string | null;
  errorType: ErrorInstanceType;
  patternLabel: string | null;
  confidence: ErrorConfidence;
  reason: string;
  /** Mô tả đầy đủ từ nhãn giáo viên — chỉ có khi confidence = 'high'. */
  rationaleText: string | null;
  pointsLost: number;
}

function masteryGroupKey(f: StudentResponseFact): string | null {
  if (f.lessonId) return `lesson:${f.lessonId}`;
  if (f.topicId) return `topic:${f.topicId}`;
  return null;
}

/**
 * Tra Error DNA cho MỌI câu sai trong danh sách `facts` (có thể gồm nhiều
 * lượt làm bài). Mức nắm vững "tại thời điểm trả lời" (đầu vào tín hiệu
 * careless của classifyError) chỉ tính từ các lượt làm bài TRƯỚC lượt đang
 * xét, cùng Bài (hoặc cùng Chương nếu câu chưa gán Bài) — không dùng dữ liệu
 * tương lai, và không tính chính lượt đang xét (tránh vòng lặp ngược).
 */
export function buildErrorInstances(
  facts: StudentResponseFact[],
  rationale: Map<string, RationaleEntry>,
  expectedTime: Record<1 | 2 | 3, number> = DEFAULT_EXPECTED_TIME_SECONDS,
): ErrorInstance[] {
  const byGroup = new Map<string, StudentResponseFact[]>();
  for (const f of facts) {
    const k = masteryGroupKey(f);
    if (!k) continue;
    const list = byGroup.get(k) ?? [];
    list.push(f);
    byGroup.set(k, list);
  }

  const result: ErrorInstance[] = [];
  for (const f of facts) {
    if (!isWrongFact(f)) continue;
    const k = masteryGroupKey(f);
    const prior = k
      ? (byGroup.get(k) ?? []).filter((p) => p.attemptId !== f.attemptId && p.startedAt < f.startedAt)
      : [];
    const mastery = diagnoseTopic(prior.map(factToOutcome), expectedTime).label;
    const entry =
      f.part === 1 && f.chosenOption ? rationale.get(rationaleKey(f.questionId, f.chosenOption)) ?? null : null;
    const c = classifyError({
      timeSpentSeconds: f.timeSpentSeconds,
      expectedTimeSeconds: expectedTime[f.part],
      masteryAtTimeOfAnswer: mastery,
      rationale: entry
        ? { errorType: entry.errorType, patternLabel: entry.patternLabel, verifiedByTeacher: entry.verifiedByTeacher }
        : null,
    });
    result.push({
      attemptId: f.attemptId,
      examId: f.examId,
      examTitle: f.examTitle,
      occurredAt: f.startedAt,
      questionId: f.questionId,
      part: f.part,
      difficulty: f.difficulty,
      topicId: f.topicId,
      topicName: f.topicName,
      lessonId: f.lessonId,
      lessonName: f.lessonName,
      chosenOption: f.chosenOption,
      correctOption: f.correctOption,
      errorType: c.errorType,
      patternLabel: c.patternLabel,
      confidence: c.confidence,
      reason: c.reason,
      rationaleText: c.confidence === "high" ? entry?.rationaleText ?? null : null,
      pointsLost: Math.max(0, Math.round((f.maxScore - f.score) * 100) / 100),
    });
  }
  return result.sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.questionId.localeCompare(b.questionId),
  );
}

/** Thứ tự hiển thị cố định khi 2 loại lỗi bằng số lần. */
export const ERROR_TYPE_ORDER: ErrorInstanceType[] = [
  "conceptual",
  "procedural",
  "calculation",
  "careless",
  "unclassified",
];

export interface ErrorDnaCluster {
  errorType: ErrorInstanceType;
  count: number;
  /** Tỉ lệ trên TỔNG số câu sai (kể cả unclassified). */
  share: number;
  /** Các nhãn lỗi cụ thể thuộc loại này, nhiều nhất trước. */
  patternLabels: { label: string; count: number }[];
}

export function summarizeErrorDna(instances: ErrorInstance[]): ErrorDnaCluster[] {
  const total = instances.length;
  if (total === 0) return [];
  const map = new Map<ErrorInstanceType, { count: number; labels: Map<string, number> }>();
  for (const i of instances) {
    const e = map.get(i.errorType) ?? { count: 0, labels: new Map<string, number>() };
    e.count += 1;
    if (i.patternLabel) e.labels.set(i.patternLabel, (e.labels.get(i.patternLabel) ?? 0) + 1);
    map.set(i.errorType, e);
  }
  return Array.from(map.entries())
    .map(([errorType, e]) => ({
      errorType,
      count: e.count,
      share: e.count / total,
      patternLabels: Array.from(e.labels.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort(
      (a, b) =>
        b.count - a.count || ERROR_TYPE_ORDER.indexOf(a.errorType) - ERROR_TYPE_ORDER.indexOf(b.errorType),
    );
}

export function toPatternOccurrences(instances: ErrorInstance[]): PatternOccurrence[] {
  return instances
    .filter((i) => i.patternLabel)
    .map((i) => ({
      attemptId: i.attemptId,
      examId: i.examId,
      patternLabel: i.patternLabel as string,
      occurredAt: i.occurredAt,
    }));
}

// -----------------------------------------------------------------------------
// Mổ xẻ 1 bài thi (Exam Autopsy)
// -----------------------------------------------------------------------------

export interface ScoreLossRow {
  key: string;
  lessonId: string | null;
  name: string;
  pointsLost: number;
  pointsPossible: number;
  wrongCount: number;
  blankCount: number;
}

export interface ExamAutopsy {
  totalLost: number;
  totalPossible: number;
  /** Chỉ các Bài có mất điểm, mất nhiều nhất trước. */
  scoreLoss: ScoreLossRow[];
  errorDna: ErrorDnaCluster[];
  wrongQuestions: ErrorInstance[];
  blankCount: number;
  /** Số câu sai đã tra được loại lỗi từ nhãn giáo viên (confidence high). */
  highConfidenceCount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildExamAutopsy(
  attemptFacts: StudentResponseFact[],
  attemptInstances: ErrorInstance[],
): ExamAutopsy {
  const groups = new Map<string, ScoreLossRow>();
  let totalLost = 0;
  let totalPossible = 0;
  let blankCount = 0;
  for (const f of attemptFacts) {
    const lost = Math.max(0, f.maxScore - f.score);
    totalLost += lost;
    totalPossible += f.maxScore;
    if (!f.answered) blankCount += 1;
    const key = f.lessonId ? `lesson:${f.lessonId}` : f.topicId ? `topic:${f.topicId}` : "none";
    const name = f.lessonName ?? (f.topicName ? `${f.topicName} (chưa gán Bài)` : "(chưa gán Chương/Bài)");
    const row = groups.get(key) ?? {
      key,
      lessonId: f.lessonId,
      name,
      pointsLost: 0,
      pointsPossible: 0,
      wrongCount: 0,
      blankCount: 0,
    };
    row.pointsLost += lost;
    row.pointsPossible += f.maxScore;
    if (isWrongFact(f)) row.wrongCount += 1;
    if (!f.answered) row.blankCount += 1;
    groups.set(key, row);
  }
  const scoreLoss = Array.from(groups.values())
    .map((r) => ({ ...r, pointsLost: round2(r.pointsLost), pointsPossible: round2(r.pointsPossible) }))
    .filter((r) => r.pointsLost > 0)
    .sort((a, b) => b.pointsLost - a.pointsLost || a.name.localeCompare(b.name));
  return {
    totalLost: round2(totalLost),
    totalPossible: round2(totalPossible),
    scoreLoss,
    errorDna: summarizeErrorDna(attemptInstances),
    wrongQuestions: attemptInstances,
    blankCount,
    highConfidenceCount: attemptInstances.filter((i) => i.confidence === "high").length,
  };
}

// -----------------------------------------------------------------------------
// Hàng đợi gắn nhãn cho giáo viên — ưu tiên câu học sinh chọn sai nhiều nhất
// -----------------------------------------------------------------------------

export type RationaleStatus = "verified" | "draft" | "none";

export interface LabelingQueueInput {
  questionId: string;
  correctOption: string;
  /** Số lượt học sinh chọn từng phương án (mọi lượt làm bài, mọi học sinh). */
  choiceCounts: Record<string, number>;
  status: RationaleStatus;
}

export interface LabelingQueueItem extends LabelingQueueInput {
  /** Tổng số lượt chọn phương án SAI — thước đo "câu này đang gây mất điểm bao nhiêu". */
  wrongChoiceTotal: number;
}

/** Sắp theo số lượt chọn sai giảm dần: gắn nhãn 10-20 câu đầu danh sách
 * thường đã phủ phần lớn lỗi thực tế của học sinh (xem summarizeLabelingCoverage). */
export function rankLabelingQueue(items: LabelingQueueInput[]): LabelingQueueItem[] {
  return items
    .map((it) => ({
      ...it,
      wrongChoiceTotal: Object.entries(it.choiceCounts)
        .filter(([k]) => k !== it.correctOption)
        .reduce((sum, [, n]) => sum + n, 0),
    }))
    .sort((a, b) => b.wrongChoiceTotal - a.wrongChoiceTotal);
}

export interface LabelingCoverage {
  totalQuestions: number;
  verifiedQuestions: number;
  draftQuestions: number;
  totalWrongChoices: number;
  coveredWrongChoices: number;
  /** % lượt chọn sai THỰC TẾ của học sinh đã tra được nhãn — null nếu chưa có lượt chọn sai nào. */
  coveragePercent: number | null;
}

export function summarizeLabelingCoverage(items: LabelingQueueItem[]): LabelingCoverage {
  const totalWrongChoices = items.reduce((s, i) => s + i.wrongChoiceTotal, 0);
  const coveredWrongChoices = items
    .filter((i) => i.status === "verified")
    .reduce((s, i) => s + i.wrongChoiceTotal, 0);
  return {
    totalQuestions: items.length,
    verifiedQuestions: items.filter((i) => i.status === "verified").length,
    draftQuestions: items.filter((i) => i.status === "draft").length,
    totalWrongChoices,
    coveredWrongChoices,
    coveragePercent:
      totalWrongChoices > 0 ? Math.round((coveredWrongChoices / totalWrongChoices) * 100) : null,
  };
}
