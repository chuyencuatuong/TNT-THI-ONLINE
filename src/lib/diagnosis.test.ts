import { describe, expect, it } from "vitest";
import {
  blankQuestionAdvice,
  classifyBlankQuestions,
  computeActiveSeconds,
  diagnoseAllDifficulties,
  diagnoseAllTopics,
  diagnoseTopic,
  DIFFICULTY_ORDER,
  type QuestionOutcome,
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
