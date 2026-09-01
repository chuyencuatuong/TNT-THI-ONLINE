import { describe, expect, it } from "vitest";
import {
  blankQuestionAdvice,
  classifyBlankQuestions,
  computeActiveSeconds,
  diagnoseAllDifficulties,
  diagnoseAllTopics,
  diagnoseTopic,
  DIFFICULTY_ORDER,
  summarizeClassRecurringGroups,
  summarizeMasteryTrend,
  type MasteryHistoryPoint,
  type MasteryLabel,
  type QuestionOutcome,
  type RecurringGroupInput,
  type TopicDiagnosis,
} from "./diagnosis";

const part1 = (scoreRatio: number, timeSpentSeconds: number, changeCount = 0): QuestionOutcome => ({
  part: 1,
  scoreRatio,
  timeSpentSeconds,
  changeCount,
});

describe("diagnoseTopic", () => {
  it("trả về 'chua_du_du_lieu' khi không có dữ liệu", () => {
    expect(diagnoseTopic([]).label).toBe("chua_du_du_lieu");
  });

  it("trả về 'chua_du_du_lieu' khi chỉ có 1 câu (mẫu quá nhỏ)", () => {
    expect(diagnoseTopic([part1(1, 60)]).label).toBe("chua_du_du_lieu");
  });

  it("phân loại 'vung' khi đúng cao, thời gian hợp lý, ít đổi đáp án", () => {
    const outcomes = [part1(1, 70, 0), part1(1, 80, 1), part1(1, 60, 0)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("vung");
    expect(result.sampleCount).toBe(3);
  });

  it("phân loại 'chua_chac_chan' khi đúng cao nhưng mất nhiều thời gian", () => {
    // 90s là mức kỳ vọng cho Phần 1 -> 200s là rất chậm (tỉ lệ > 1.3)
    const outcomes = [part1(1, 200, 0), part1(1, 220, 0)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("chua_chac_chan");
  });

  it("phân loại 'chua_chac_chan' khi đúng cao nhưng đổi đáp án nhiều lần", () => {
    const outcomes = [part1(1, 60, 3), part1(1, 60, 4)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("chua_chac_chan");
  });

  it("phân loại 'co_lo_hong' khi đúng khoảng 40-80%", () => {
    const outcomes = [part1(0.5, 90, 0), part1(0.5, 90, 0)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("co_lo_hong");
  });

  it("phân loại 'mat_goc' khi đúng dưới 40%", () => {
    const outcomes = [part1(0, 90, 0), part1(0, 90, 0)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("mat_goc");
  });

  it("đánh dấu possiblyRushed khi sai nhiều nhưng làm rất nhanh", () => {
    const outcomes = [part1(0, 20, 0), part1(0, 15, 0)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("mat_goc");
    expect(result.possiblyRushed).toBe(true);
  });

  it("không đánh dấu possiblyRushed khi sai nhiều nhưng có đầu tư thời gian", () => {
    const outcomes = [part1(0, 150, 0), part1(0, 160, 0)];
    const result = diagnoseTopic(outcomes);
    expect(result.label).toBe("mat_goc");
    expect(result.possiblyRushed).toBe(false);
  });
});

describe("diagnoseAllTopics", () => {
  it("chẩn đoán độc lập cho từng nhóm chương", () => {
    const groups = [
      {
        topic_id: "t1",
        topic_name: "Chương A",
        outcomes: [part1(1, 60), part1(1, 70)],
      },
      {
        topic_id: "t2",
        topic_name: "Chương B",
        outcomes: [part1(0, 90), part1(0, 90)],
      },
    ];
    const result = diagnoseAllTopics(groups);
    expect(result.find((r) => r.topic_id === "t1")?.label).toBe("vung");
    expect(result.find((r) => r.topic_id === "t2")?.label).toBe("mat_goc");
  });
});

describe("diagnoseAllDifficulties", () => {
  it("LUÔN trả đủ 4 mức theo DIFFICULTY_ORDER, kể cả mức chưa có câu nào", () => {
    const result = diagnoseAllDifficulties([
      { difficulty: "nhan_biet", outcomes: [part1(1, 60), part1(1, 70)] },
    ]);
    expect(result.map((r) => r.difficulty)).toEqual(DIFFICULTY_ORDER);
    expect(result.find((r) => r.difficulty === "nhan_biet")?.label).toBe("vung");
    expect(result.find((r) => r.difficulty === "thong_hieu")?.label).toBe("chua_du_du_lieu");
    expect(result.find((r) => r.difficulty === "van_dung")?.sampleCount).toBe(0);
  });

  it("chẩn đoán độc lập cho từng mức độ tư duy", () => {
    const result = diagnoseAllDifficulties([
      { difficulty: "nhan_biet", outcomes: [part1(1, 60), part1(1, 70)] },
      { difficulty: "van_dung_cao", outcomes: [part1(0, 90), part1(0, 90)] },
    ]);
    expect(result.find((r) => r.difficulty === "nhan_biet")?.label).toBe("vung");
    expect(result.find((r) => r.difficulty === "van_dung_cao")?.label).toBe("mat_goc");
  });
});

describe("computeActiveSeconds", () => {
  it("trả về 0 khi không có sự kiện nào", () => {
    expect(computeActiveSeconds([])).toBe(0);
  });

  it("tính đúng 1 lượt xem đơn giản", () => {
    const events = [
      { event_type: "enter" as const, created_at: "2026-01-01T00:00:00.000Z" },
      { event_type: "leave" as const, created_at: "2026-01-01T00:00:30.000Z" },
    ];
    expect(computeActiveSeconds(events)).toBe(30);
  });

  it("cộng dồn nhiều lượt quay lại xem", () => {
    const events = [
      { event_type: "enter" as const, created_at: "2026-01-01T00:00:00.000Z" },
      { event_type: "leave" as const, created_at: "2026-01-01T00:00:20.000Z" },
      { event_type: "enter" as const, created_at: "2026-01-01T00:01:00.000Z" },
      { event_type: "leave" as const, created_at: "2026-01-01T00:01:15.000Z" },
    ];
    expect(computeActiveSeconds(events)).toBe(35);
  });

  it("bỏ qua 'enter' bị treo (không có 'leave' khớp, ví dụ học sinh nộp bài giữa chừng)", () => {
    const events = [
      { event_type: "enter" as const, created_at: "2026-01-01T00:00:00.000Z" },
      { event_type: "leave" as const, created_at: "2026-01-01T00:00:10.000Z" },
      { event_type: "enter" as const, created_at: "2026-01-01T00:00:20.000Z" },
      // không có leave tương ứng
    ];
    expect(computeActiveSeconds(events)).toBe(10);
  });

  it("xử lý đúng thứ tự dù mảng đầu vào không theo thời gian", () => {
    const events = [
      { event_type: "leave" as const, created_at: "2026-01-01T00:00:30.000Z" },
      { event_type: "enter" as const, created_at: "2026-01-01T00:00:00.000Z" },
    ];
    expect(computeActiveSeconds(events)).toBe(30);
  });
});

describe("classifyBlankQuestions", () => {
  it("trả về rỗng khi không có câu nào bị bỏ trống", () => {
    const result = classifyBlankQuestions([], ["q1", "q2"]);
    expect(result.totalBlank).toBe(0);
    expect(result.timeoutCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("xếp vào 'chua_kip_doc' khi câu bỏ trống chưa từng được mở xem", () => {
    const result = classifyBlankQuestions(["q1", "q2"], []);
    expect(result.timeoutCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.items.every((i) => i.reason === "chua_kip_doc")).toBe(true);
  });

  it("xếp vào 'doc_roi_bo_qua' khi câu bỏ trống đã từng được mở xem", () => {
    const result = classifyBlankQuestions(["q1", "q2"], ["q1", "q2"]);
    expect(result.skippedCount).toBe(2);
    expect(result.timeoutCount).toBe(0);
  });

  it("phân loại đúng khi trộn lẫn cả 2 nguyên nhân", () => {
    const result = classifyBlankQuestions(["q1", "q2", "q3"], ["q2"]);
    expect(result.totalBlank).toBe(3);
    expect(result.timeoutCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.items.find((i) => i.question_id === "q2")?.reason).toBe("doc_roi_bo_qua");
  });
});

describe("blankQuestionAdvice", () => {
  it("trả về null khi không có câu bỏ trống", () => {
    expect(blankQuestionAdvice(classifyBlankQuestions([], []))).toBeNull();
  });

  it("nêu rõ vấn đề thời gian khi toàn bộ là 'chua_kip_doc'", () => {
    const advice = blankQuestionAdvice(classifyBlankQuestions(["q1"], []));
    expect(advice).toContain("phân bổ thời gian");
  });

  it("nêu rõ vấn đề kiến thức khi toàn bộ là 'doc_roi_bo_qua'", () => {
    const advice = blankQuestionAdvice(classifyBlankQuestions(["q1"], ["q1"]));
    expect(advice).toContain("kiểm tra lại kiến thức");
  });

  it("nêu cả 2 nguyên nhân khi trộn lẫn", () => {
    const advice = blankQuestionAdvice(classifyBlankQuestions(["q1", "q2"], ["q2"]));
    expect(advice).toContain("1 câu chưa kịp xem");
    expect(advice).toContain("1 câu đã xem nhưng bỏ qua");
  });
});

/** Dựng nhanh 1 điểm trên chuỗi thời gian mastery mà không cần chạy diagnoseTopic thật
 * (test summarizeMasteryTrend độc lập với ngưỡng của diagnoseTopic). */
function mkPoint(
  label: MasteryLabel,
  startedAt: string,
  avgScoreRatio = label === "vung" ? 0.9 : label === "chua_chac_chan" ? 0.85 : label === "co_lo_hong" ? 0.6 : 0.2,
): MasteryHistoryPoint {
  const diagnosis: TopicDiagnosis = {
    label,
    sampleCount: label === "chua_du_du_lieu" ? 1 : 3,
    avgScoreRatio,
    avgTimeRatio: 1,
    avgChangeCount: 0,
    possiblyRushed: false,
  };
  return { attempt_id: `a-${startedAt}`, started_at: startedAt, exam_title: `Đề ${startedAt}`, diagnosis };
}

describe("summarizeMasteryTrend", () => {
  it("history rỗng -> không lặp lại, xu hướng chưa rõ, latestLabel null", () => {
    const result = summarizeMasteryTrend([]);
    expect(result).toEqual({
      isRecurring: false,
      direction: "chua_ro",
      latestLabel: null,
      validPointCount: 0,
    });
  });

  it("chỉ toàn 'chua_du_du_lieu' -> không tính là điểm hợp lệ nào", () => {
    const history = [mkPoint("chua_du_du_lieu", "2026-01-01"), mkPoint("chua_du_du_lieu", "2026-02-01")];
    const result = summarizeMasteryTrend(history);
    expect(result.validPointCount).toBe(0);
    expect(result.latestLabel).toBeNull();
    expect(result.isRecurring).toBe(false);
  });

  it("2 lần gần nhất đều yếu (co_lo_hong/mat_goc) -> lặp lại", () => {
    const history = [
      mkPoint("vung", "2026-01-01"),
      mkPoint("co_lo_hong", "2026-02-01"),
      mkPoint("mat_goc", "2026-03-01"),
    ];
    expect(summarizeMasteryTrend(history).isRecurring).toBe(true);
  });

  it("chỉ 1 trong 2 lần gần nhất yếu -> KHÔNG tính là lặp lại", () => {
    const history = [
      mkPoint("co_lo_hong", "2026-01-01"),
      mkPoint("vung", "2026-02-01"),
      mkPoint("mat_goc", "2026-03-01"),
    ];
    expect(summarizeMasteryTrend(history).isRecurring).toBe(false);
  });

  it("bỏ qua các điểm 'chua_du_du_lieu' khi xét 2 lần gần nhất", () => {
    const history = [
      mkPoint("co_lo_hong", "2026-01-01"),
      mkPoint("mat_goc", "2026-02-01"),
      mkPoint("chua_du_du_lieu", "2026-03-01"), // lần này không đủ dữ liệu, không "cứu" được chuỗi lặp lại
    ];
    expect(summarizeMasteryTrend(history).isRecurring).toBe(true);
  });

  it("dưới 3 điểm hợp lệ -> xu hướng luôn 'chua_ro'", () => {
    const history = [mkPoint("mat_goc", "2026-01-01", 0.2), mkPoint("vung", "2026-02-01", 0.95)];
    expect(summarizeMasteryTrend(history).direction).toBe("chua_ro");
  });

  it("điểm nửa sau cao hơn hẳn nửa đầu -> 'cai_thien'", () => {
    const history = [
      mkPoint("mat_goc", "2026-01-01", 0.2),
      mkPoint("co_lo_hong", "2026-02-01", 0.3),
      mkPoint("chua_chac_chan", "2026-03-01", 0.8),
      mkPoint("vung", "2026-04-01", 0.9),
    ];
    expect(summarizeMasteryTrend(history).direction).toBe("cai_thien");
  });

  it("điểm nửa sau thấp hơn hẳn nửa đầu -> 'di_xuong'", () => {
    const history = [
      mkPoint("vung", "2026-01-01", 0.9),
      mkPoint("vung", "2026-02-01", 0.85),
      mkPoint("co_lo_hong", "2026-03-01", 0.4),
      mkPoint("mat_goc", "2026-04-01", 0.2),
    ];
    expect(summarizeMasteryTrend(history).direction).toBe("di_xuong");
  });

  it("chênh lệch nhỏ (dưới ngưỡng) -> vẫn 'chua_ro', không báo nhầm xu hướng", () => {
    const history = [
      mkPoint("chua_chac_chan", "2026-01-01", 0.82),
      mkPoint("chua_chac_chan", "2026-02-01", 0.85),
      mkPoint("chua_chac_chan", "2026-03-01", 0.84),
      mkPoint("chua_chac_chan", "2026-04-01", 0.86),
    ];
    expect(summarizeMasteryTrend(history).direction).toBe("chua_ro");
  });

  it("latestLabel lấy đúng nhãn của lần CÓ đủ dữ liệu gần nhất, bỏ qua chua_du_du_lieu ở cuối", () => {
    const history = [
      mkPoint("mat_goc", "2026-01-01"),
      mkPoint("vung", "2026-02-01"),
      mkPoint("chua_du_du_lieu", "2026-03-01"),
    ];
    expect(summarizeMasteryTrend(history).latestLabel).toBe("vung");
  });

  it("tích hợp thật với diagnoseTopic (không phải dữ liệu dựng tay) vẫn hoạt động đúng", () => {
    const weakOutcomes: QuestionOutcome[] = [
      { part: 1, scoreRatio: 0.1, timeSpentSeconds: 90, changeCount: 0 },
      { part: 1, scoreRatio: 0.2, timeSpentSeconds: 90, changeCount: 0 },
    ];
    const history: MasteryHistoryPoint[] = [
      { attempt_id: "a1", started_at: "2026-01-01", exam_title: "Đề 1", diagnosis: diagnoseTopic(weakOutcomes) },
      { attempt_id: "a2", started_at: "2026-02-01", exam_title: "Đề 2", diagnosis: diagnoseTopic(weakOutcomes) },
    ];
    const result = summarizeMasteryTrend(history);
    expect(result.latestLabel).toBe("mat_goc");
    expect(result.isRecurring).toBe(true);
  });
});

describe("summarizeClassRecurringGroups", () => {
  const weakTrend = summarizeMasteryTrend([
    mkPoint("co_lo_hong", "2026-01-01"),
    mkPoint("mat_goc", "2026-02-01"),
  ]);
  const okTrend = summarizeMasteryTrend([mkPoint("vung", "2026-01-01"), mkPoint("vung", "2026-02-01")]);
  const noDataTrend = summarizeMasteryTrend([]);

  it("không có học sinh nào -> mảng rỗng", () => {
    expect(summarizeClassRecurringGroups([])).toEqual([]);
  });

  it("bỏ qua nhóm không có học sinh nào lặp lại (recurringCount = 0)", () => {
    const perStudent: RecurringGroupInput[][] = [
      [{ id: "t1", name: "Chương 1", trend: okTrend }],
      [{ id: "t1", name: "Chương 1", trend: okTrend }],
    ];
    expect(summarizeClassRecurringGroups(perStudent)).toEqual([]);
  });

  it("tính đúng % lặp lại và chỉ đếm học sinh có dữ liệu hợp lệ (bỏ qua validPointCount = 0)", () => {
    const perStudent: RecurringGroupInput[][] = [
      [{ id: "t1", name: "Chương 1", trend: weakTrend }],
      [{ id: "t1", name: "Chương 1", trend: weakTrend }],
      [{ id: "t1", name: "Chương 1", trend: okTrend }],
      [{ id: "t1", name: "Chương 1", trend: noDataTrend }], // học sinh này chưa có dữ liệu -> không tính vào mẫu số
    ];
    const result = summarizeClassRecurringGroups(perStudent);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "t1", studentCount: 3, recurringCount: 2, recurringPercent: 67 });
  });

  it("sắp theo % lặp lại giảm dần", () => {
    const perStudent: RecurringGroupInput[][] = [
      [
        { id: "low", name: "Chương thấp", trend: weakTrend },
        { id: "high", name: "Chương cao", trend: weakTrend },
      ],
      [{ id: "high", name: "Chương cao", trend: weakTrend }],
    ];
    const result = summarizeClassRecurringGroups(perStudent);
    expect(result.map((r) => r.id)).toEqual(["high", "low"]);
  });
});
