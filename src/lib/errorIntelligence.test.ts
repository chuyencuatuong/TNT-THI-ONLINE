import { describe, expect, it } from "vitest";
import {
  classifyError,
  summarizePatternRecurrence,
  type ErrorClassificationInput,
  type PatternOccurrence,
} from "./errorIntelligence";

const baseInput: ErrorClassificationInput = {
  timeSpentSeconds: 90,
  expectedTimeSeconds: 90,
  masteryAtTimeOfAnswer: "chua_chac_chan",
  rationale: null,
};

describe("classifyError", () => {
  it("có rationale đã giáo viên duyệt -> confidence cao, lấy đúng error_type + pattern_label", () => {
    const result = classifyError({
      ...baseInput,
      rationale: { errorType: "conceptual", patternLabel: "Quên điều kiện xác định", verifiedByTeacher: true },
    });
    expect(result).toEqual({
      errorType: "conceptual",
      patternLabel: "Quên điều kiện xác định",
      confidence: "high",
      reason: "Xác định từ nhãn lỗi đã giáo viên xác nhận cho phương án đã chọn.",
    });
  });

  it("rationale CHƯA giáo viên duyệt (chỉ AI gợi ý) -> KHÔNG dùng, rơi xuống bậc sau", () => {
    const result = classifyError({
      ...baseInput,
      masteryAtTimeOfAnswer: "mat_goc",
      rationale: { errorType: "conceptual", patternLabel: "X", verifiedByTeacher: false },
    });
    expect(result.errorType).toBe("unclassified");
    expect(result.confidence).toBe("low");
  });

  it("rationale error_type='n_a' (phương án đúng, dữ liệu lẫn vào do lỗi) -> không dùng, rơi xuống bậc sau", () => {
    const result = classifyError({
      ...baseInput,
      masteryAtTimeOfAnswer: "mat_goc",
      rationale: { errorType: "n_a", patternLabel: null, verifiedByTeacher: true },
    });
    expect(result.errorType).toBe("unclassified");
  });

  it("không có rationale, mastery vững + làm rất nhanh -> careless, confidence medium", () => {
    const result = classifyError({
      timeSpentSeconds: 30,
      expectedTimeSeconds: 90,
      masteryAtTimeOfAnswer: "vung",
      rationale: null,
    });
    expect(result.errorType).toBe("careless");
    expect(result.confidence).toBe("medium");
    expect(result.reason).toContain("33%");
  });

  it("mastery vững nhưng KHÔNG làm nhanh -> không phải careless, unclassified", () => {
    const result = classifyError({
      timeSpentSeconds: 90,
      expectedTimeSeconds: 90,
      masteryAtTimeOfAnswer: "vung",
      rationale: null,
    });
    expect(result.errorType).toBe("unclassified");
  });

  it("làm rất nhanh nhưng mastery đang co_lo_hong/mat_goc -> không phải careless (có thể do chưa hiểu, không phải bất cẩn)", () => {
    const result = classifyError({
      timeSpentSeconds: 20,
      expectedTimeSeconds: 90,
      masteryAtTimeOfAnswer: "mat_goc",
      rationale: null,
    });
    expect(result.errorType).toBe("unclassified");
  });

  it("expectedTimeSeconds = 0 (dữ liệu bất thường) -> không chia cho 0, vẫn trả kết quả hợp lệ", () => {
    const result = classifyError({
      timeSpentSeconds: 10,
      expectedTimeSeconds: 0,
      masteryAtTimeOfAnswer: "vung",
      rationale: null,
    });
    expect(result.errorType).toBe("unclassified");
  });
});

describe("summarizePatternRecurrence", () => {
  const occ = (
    patternLabel: string,
    examId: string,
    attemptId: string,
    occurredAt: string,
  ): PatternOccurrence => ({ patternLabel, examId, attemptId, occurredAt });

  it("cùng 1 pattern xuất hiện >=2 lần trên >=2 đề khác nhau -> isRecurring = true", () => {
    const result = summarizePatternRecurrence([
      occ("Quên đổi cận", "exam-1", "a1", "2026-09-01"),
      occ("Quên đổi cận", "exam-2", "a2", "2026-09-08"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      patternLabel: "Quên đổi cận",
      totalCount: 2,
      distinctExamCount: 2,
      isRecurring: true,
    });
  });

  it("cùng 1 pattern xuất hiện 2 lần nhưng CÙNG 1 đề -> không tính là lặp lại", () => {
    const result = summarizePatternRecurrence([
      occ("Quên đổi cận", "exam-1", "a1", "2026-09-01"),
      occ("Quên đổi cận", "exam-1", "a1", "2026-09-01"),
    ]);
    expect(result).toHaveLength(0);
  });

  it("chỉ xuất hiện 1 lần -> không tính là lặp lại", () => {
    const result = summarizePatternRecurrence([occ("Quên đổi cận", "exam-1", "a1", "2026-09-01")]);
    expect(result).toHaveLength(0);
  });

  it("nhiều pattern khác nhau -> chỉ trả về pattern nào isRecurring, sắp theo totalCount giảm dần", () => {
    const result = summarizePatternRecurrence([
      occ("A", "e1", "a1", "2026-09-01"),
      occ("A", "e2", "a2", "2026-09-08"),
      occ("A", "e3", "a3", "2026-09-15"),
      occ("B", "e1", "a1", "2026-09-01"),
      occ("B", "e2", "a2", "2026-09-08"),
      occ("C", "e1", "a1", "2026-09-01"),
    ]);
    expect(result.map((r) => r.patternLabel)).toEqual(["A", "B"]);
  });

  it("firstOccurredAt/lastOccurredAt lấy đúng theo thời gian sớm nhất/muộn nhất", () => {
    const result = summarizePatternRecurrence([
      occ("A", "e2", "a2", "2026-09-08"),
      occ("A", "e1", "a1", "2026-09-01"),
    ]);
    expect(result[0].firstOccurredAt).toBe("2026-09-01");
    expect(result[0].lastOccurredAt).toBe("2026-09-08");
  });
});
