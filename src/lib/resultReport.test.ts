import { describe, expect, it } from "vitest";
import {
  buildActions,
  buildHeadline,
  classifyLoss,
  classifyLosses,
  dominantCause,
  lessonLossRows,
  lossBlocks,
  percentileOf,
  scoreBand,
  summarizeCauses,
  tierSummary,
  type QuestionOutcomeInput,
} from "./resultReport";

const q = (over: Partial<QuestionOutcomeInput>): QuestionOutcomeInput => ({
  questionId: "q",
  number: 1,
  part: 1,
  score: 0,
  maxScore: 0.25,
  answered: true,
  timeSpentSeconds: 60,
  lessonId: "L1",
  lessonName: "Bài 1",
  errorType: null,
  patternLabel: null,
  blankReason: null,
  ...over,
});

describe("classifyLoss", () => {
  it("bỏ qua câu trọn điểm", () => {
    expect(classifyLoss(q({ score: 0.25 }))).toBeNull();
  });
  it("bỏ trống vì chưa kịp mở -> Nhịp độ; đã mở rồi bỏ qua -> Chưa định vị", () => {
    expect(classifyLoss(q({ answered: false, blankReason: "chua_kip_doc" }))!.cause).toBe("speed");
    expect(classifyLoss(q({ answered: false, blankReason: "doc_roi_bo_qua" }))!.cause).toBe("unloc");
  });
  it("ánh xạ loại lỗi sang 3 nhóm", () => {
    expect(classifyLoss(q({ errorType: "conceptual" }))!.cause).toBe("know");
    expect(classifyLoss(q({ errorType: "procedural" }))!.cause).toBe("exec");
    expect(classifyLoss(q({ errorType: "calculation" }))!.cause).toBe("exec");
    expect(classifyLoss(q({ errorType: "careless", timeSpentSeconds: 30 }))!.cause).toBe("speed");
  });
  it("chưa xác định loại lỗi: chỉ vào Nhịp độ khi làm >= 2 lần định mức", () => {
    const slow = classifyLoss(q({ part: 2, score: 0.25, maxScore: 1, timeSpentSeconds: 400 }))!;
    expect(slow.cause).toBe("speed");
    expect(slow.lost).toBe(0.75);
    expect(slow.note).toContain("6 phút 40 giây");
    expect(classifyLoss(q({ part: 2, score: 0.25, maxScore: 1, timeSpentSeconds: 200 }))!.cause).toBe("unloc");
    // không có dữ liệu thời gian thì không được coi là chậm
    expect(classifyLoss(q({ timeSpentSeconds: 0 }))!.cause).toBe("unloc");
  });
});

describe("tổng hợp", () => {
  const losses = classifyLosses([
    q({ questionId: "a", number: 3, errorType: "conceptual", lessonId: "L3", lessonName: "Bài 3" }),
    q({ questionId: "b", number: 6, errorType: "procedural" }),
    q({ questionId: "c", number: 16, part: 2, score: 0.25, maxScore: 1, timeSpentSeconds: 400 }),
    q({ questionId: "d", number: 21, part: 3, maxScore: 0.5, answered: false, blankReason: "chua_kip_doc", lessonId: "L3", lessonName: "Bài 3" }),
    q({ questionId: "e", number: 20, part: 3, maxScore: 0.5, lessonId: "L2", lessonName: "Bài 2" }),
  ]);
  const summary = summarizeCauses(losses);

  it("tính điểm rơi theo nhóm và nhóm trội theo điểm", () => {
    expect(summary.map((s) => [s.cause, s.points])).toEqual([
      ["speed", 1.25],
      ["exec", 0.25],
      ["know", 0.25],
      ["unloc", 0.5],
    ]);
    expect(dominantCause(summary)).toBe("speed");
  });

  it("chỉ trả Chưa định vị khi không còn nhóm nào khác", () => {
    expect(dominantCause(summarizeCauses(classifyLosses([q({})])))).toBe("unloc");
    expect(dominantCause(summarizeCauses([]))).toBeNull();
  });

  it("ô điểm rơi: mỗi ô 0.25, mỗi câu ít nhất 1 ô", () => {
    const { unit, blocks } = lossBlocks(losses);
    expect(unit).toBe(0.25);
    expect(blocks.length).toBe(1 + 1 + 3 + 2 + 2);
    expect(blocks[0].cause).toBe("speed");
  });

  it("điểm rơi theo bài, nhiều nhất trước", () => {
    const rows = lessonLossRows(losses);
    expect(rows[0]).toMatchObject({ key: "L1", lost: 1 });
    expect(rows.map((r) => r.key)).toEqual(["L1", "L3", "L2"]);
  });

  it("kế hoạch: việc 1 theo nhóm trội, luôn kết thúc bằng Ôn tập câu sai, tối đa 3 việc", () => {
    const actions = buildActions({ summary, lessons: lessonLossRows(losses), rootCause: null, recurringLabel: "X", allQuestionIds: [] });
    expect(actions).toHaveLength(3);
    expect(actions[0].title).toContain("không bấm giờ");
    expect(actions[0].questionIds).toEqual(["c", "d"]);
    expect(actions[0].gain).toBe(1.25);
    expect(actions[2].key).toBe("journal");
    expect(actions[2].body).toContain("«X»");
  });

  it("có ứng viên gốc rễ thì việc 2 là ôn bài nền tảng", () => {
    const actions = buildActions({
      summary,
      lessons: [],
      rootCause: { foundationName: "Bài 2. Quy tắc tính đạo hàm", foundationGrade: 11, targetName: "Bài 1" },
      recurringLabel: null,
      allQuestionIds: [],
    });
    expect(actions[1].title).toBe("Ôn lại Bài 2. Quy tắc tính đạo hàm (Lớp 11)");
  });
});

describe("vị trí & nhận định", () => {
  it("phân vị chỉ khi đủ 20 lượt", () => {
    expect(percentileOf(Array(19).fill(5), 6)).toBeNull();
    const p = percentileOf([...Array(29).fill(5), 6.5, ...Array(12).fill(8)], 6.5)!;
    expect(p).toEqual({ below: 29, n: 42, pct: 69 });
  });
  it("nhóm năng lực theo thang cố định", () => {
    expect(scoreBand(4.99).name).toBe("Củng cố nền");
    expect(scoreBand(6.5).name).toBe("Tăng tốc");
    expect(scoreBand(8.5).name).toBe("Bứt phá");
    expect(scoreBand(10).name).toBe("Bứt phá");
  });
  it("câu nhận định", () => {
    expect(buildHeadline({ totalLost: 0, dominant: null, basic: 1 })).toBe("Giữ trọn điểm toàn bài.");
    expect(buildHeadline({ totalLost: 3.5, dominant: "speed", basic: 0.89 })).toBe(
      "Kiến thức nền vững. Điểm rơi dồn vào nhịp độ làm bài.",
    );
    expect(buildHeadline({ totalLost: 1, dominant: "exec", basic: null })).toBe(
      "Điểm rơi tập trung ở bước biến đổi và tính toán.",
    );
  });
  it("tầng tư duy", () => {
    const t = tierSummary([
      { difficulty: "nhan_biet", sampleCount: 4, accuracy: 1, label: "vung" },
      { difficulty: "thong_hieu", sampleCount: 5, accuracy: 0.8, label: "vung" },
      { difficulty: "van_dung", sampleCount: 8, accuracy: 0.53, label: "co_lo_hong" },
      { difficulty: "van_dung_cao", sampleCount: 5, accuracy: 0.2, label: "mat_goc" },
    ]);
    expect(t.solidUpTo).toBe("thong_hieu");
    expect(t.firstGap).toBe("van_dung");
    expect(Math.round((t.basic ?? 0) * 100)).toBe(89);
  });
});
