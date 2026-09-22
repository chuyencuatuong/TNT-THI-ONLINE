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

import type { DistractorErrorType, ErrorConfidence, ErrorInstanceType } from "./types";
import type { MasteryLabel } from "./diagnosis";
import { RUSHED_TIME_RATIO } from "./diagnosis";

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
  if (CARELESS_MASTERY.includes(input.masteryAtTimeOfAnswer) && timeRatio <= RUSHED_TIME_RATIO) {
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
