import { describe, it, expect } from "vitest";
import {
  scorePart1Question,
  scorePart2Question,
  scorePart3Question,
  combineScores,
  normalizeShortAnswer,
  PART2_SCORE_TABLE,
  scorePart1Custom,
  scorePart2Custom,
  scorePart2AllOrNothing,
  resolveExamScoring,
  maxScoreOf,
  scoreQuestionWithAnswer,
} from "./scoring";

describe("Phần 1 - trắc nghiệm 4 phương án", () => {
  it("đúng đáp án -> 0.25 điểm", () => {
    expect(scorePart1Question("A", "A")).toBe(0.25);
  });
  it("sai đáp án -> 0 điểm", () => {
    expect(scorePart1Question("A", "B")).toBe(0);
  });
  it("bỏ trống -> 0 điểm", () => {
    expect(scorePart1Question("A", null)).toBe(0);
    expect(scorePart1Question("A", undefined)).toBe(0);
  });
});

describe("Phần 2 - đúng/sai 4 ý, đúng barem chính thức", () => {
  const correct = { a: true, b: false, c: true, d: false };

  it("đúng cả 4 ý -> 1.0 điểm", () => {
    const r = scorePart2Question(correct, { a: true, b: false, c: true, d: false });
    expect(r.correctCount).toBe(4);
    expect(r.score).toBe(1);
  });

  it("đúng 3/4 ý -> 0.5 điểm", () => {
    const r = scorePart2Question(correct, { a: true, b: false, c: true, d: true });
    expect(r.correctCount).toBe(3);
    expect(r.score).toBe(0.5);
  });

  it("đúng 2/4 ý -> 0.25 điểm", () => {
    const r = scorePart2Question(correct, { a: true, b: true, c: true, d: true });
    expect(r.correctCount).toBe(2);
    expect(r.score).toBe(0.25);
  });

  it("đúng 1/4 ý -> 0.1 điểm", () => {
    const r = scorePart2Question(correct, { a: true, b: true, c: false, d: true });
    expect(r.correctCount).toBe(1);
    expect(r.score).toBe(0.1);
  });

  it("sai cả 4 ý -> 0 điểm", () => {
    const r = scorePart2Question(correct, { a: false, b: true, c: false, d: true });
    expect(r.correctCount).toBe(0);
    expect(r.score).toBe(0);
  });

  it("thiếu ý (chưa trả lời) tính là sai ý đó, không phải bỏ qua", () => {
    // học sinh mới trả lời a, c — còn b, d chưa chọn
    const r = scorePart2Question(correct, { a: true, c: true });
    expect(r.correctCount).toBe(2);
    expect(r.score).toBe(0.25);
  });

  it("không trả lời gì -> 0 điểm", () => {
    const r = scorePart2Question(correct, null);
    expect(r.correctCount).toBe(0);
    expect(r.score).toBe(0);
  });

  it("bảng điểm khớp đúng barem đề bài đưa ra", () => {
    expect(PART2_SCORE_TABLE[1]).toBe(0.1);
    expect(PART2_SCORE_TABLE[2]).toBe(0.25);
    expect(PART2_SCORE_TABLE[3]).toBe(0.5);
    expect(PART2_SCORE_TABLE[4]).toBe(1);
  });
});

describe("Phần 3 - trả lời ngắn", () => {
  it("khớp chuỗi chính xác -> đủ điểm", () => {
    expect(scorePart3Question("Hà Nội", "Hà Nội", 0.5)).toBe(0.5);
  });

  it("khớp số dù định dạng khác nhau (12.5 vs 12.50 vs 12,5)", () => {
    expect(scorePart3Question("12.5", "12.50", 0.5)).toBe(0.5);
    expect(scorePart3Question("12.5", "12,5", 0.5)).toBe(0.5);
  });

  it("sai số -> 0 điểm", () => {
    expect(scorePart3Question("12.5", "12.6", 0.5)).toBe(0);
  });

  it("không trả lời -> 0 điểm", () => {
    expect(scorePart3Question("12.5", null, 0.5)).toBe(0);
    expect(scorePart3Question("12.5", "", 0.5)).toBe(0);
  });

  it("normalizeShortAnswer bỏ khoảng trắng thừa và đổi dấu phẩy", () => {
    expect(normalizeShortAnswer("  1, 5  ")).toBe("1.5");
  });
});

describe("Tổng hợp điểm 3 phần", () => {
  it("cộng đúng và làm tròn 2 chữ số", () => {
    // Phần 1: 12 câu đúng hết = 3.0 | Phần 2: 4 câu, mỗi câu 2 ý đúng = 4*0.25=1.0 | Phần 3: 2 câu x 1 điểm = 2.0
    const result = combineScores(3.0, 1.0, 2.0);
    expect(result.totalScore).toBe(6.0);
  });

  it("không bị lỗi cộng dồn số thực (floating point)", () => {
    // 0.25 * 12 lần cộng dễ ra sai số nếu không làm tròn
    let part1 = 0;
    for (let i = 0; i < 12; i++) part1 += 0.25;
    const result = combineScores(part1, 0, 0);
    expect(result.part1Score).toBe(3);
  });
});

describe("Tính điểm linh hoạt (Đợt 3, mục 2)", () => {
  describe("scorePart1Custom", () => {
    it("đúng đáp án -> trọn điểm tuỳ chỉnh", () => {
      expect(scorePart1Custom("A", "A", 1)).toBe(1);
      expect(scorePart1Custom("A", "A", 0.5)).toBe(0.5);
    });
    it("sai hoặc bỏ trống -> 0 điểm dù điểm tối đa là bao nhiêu", () => {
      expect(scorePart1Custom("A", "B", 1)).toBe(0);
      expect(scorePart1Custom("A", null, 1)).toBe(0);
    });
  });

  describe("scorePart2Custom (thủ công, cộng điểm riêng từng ý)", () => {
    const correct = { a: true, b: false, c: true, d: false };
    const subPoints = { a: 0.3, b: 0.2, c: 0.3, d: 0.2 };

    it("đúng cả 4 ý -> cộng đủ 4 mức điểm riêng", () => {
      const r = scorePart2Custom(correct, correct, subPoints);
      expect(r.correctCount).toBe(4);
      expect(r.score).toBe(1);
    });

    it("chỉ đúng 1 ý -> chỉ cộng điểm của đúng ý đó (không theo bảng tỉ lệ chuẩn)", () => {
      const r = scorePart2Custom(correct, { a: true, b: true, c: false, d: true }, subPoints);
      expect(r.correctCount).toBe(1);
      expect(r.score).toBe(0.3);
    });

    it("không trả lời gì -> 0 điểm", () => {
      const r = scorePart2Custom(correct, null, subPoints);
      expect(r.correctCount).toBe(0);
      expect(r.score).toBe(0);
    });
  });

  describe("scorePart2AllOrNothing (tự động, không chấm từng phần)", () => {
    const correct = { a: true, b: false, c: true, d: false };

    it("đúng cả 4 ý -> trọn điểm", () => {
      const r = scorePart2AllOrNothing(correct, correct, 2);
      expect(r.correctCount).toBe(4);
      expect(r.score).toBe(2);
    });

    it("đúng 3/4 ý -> vẫn 0 điểm (không có điểm từng phần)", () => {
      const r = scorePart2AllOrNothing(correct, { a: true, b: false, c: true, d: true }, 2);
      expect(r.correctCount).toBe(3);
      expect(r.score).toBe(0);
    });
  });

  describe("resolveExamScoring", () => {
    const examQuestions = [
      { question_id: "q1", part: 1 as const, default_points: null, custom_points: null, custom_part2_points: null },
      { question_id: "q2", part: 2 as const, default_points: null, custom_points: null, custom_part2_points: null },
      { question_id: "q3", part: 3 as const, default_points: 0.5, custom_points: null, custom_part2_points: null },
    ];

    it("chế độ 'chuan_thpt' -> giống hệt barem cũ (0.25/1.0/default_points), bất kể có custom_points hay không", () => {
      const withCustomButIgnored = [
        { ...examQuestions[0], custom_points: 5 },
        examQuestions[1],
        examQuestions[2],
      ];
      const resolved = resolveExamScoring("chuan_thpt", null, withCustomButIgnored);
      expect(resolved.get("q1")!.maxScore).toBe(0.25);
      expect(resolved.get("q2")!.maxScore).toBe(1);
      expect(resolved.get("q3")!.maxScore).toBe(0.5);
      expect(resolved.get("q2")!.part2SubPoints).toBeNull();
    });

    it("chế độ 'tuy_chinh' + 'tu_dong' -> chia đều 10đ cho tổng số câu (làm tròn 2 chữ số), mọi câu bằng nhau", () => {
      const resolved = resolveExamScoring("tuy_chinh", "tu_dong", examQuestions);
      expect(resolved.get("q1")!.maxScore).toBe(3.33);
      expect(resolved.get("q2")!.maxScore).toBe(3.33);
      expect(resolved.get("q3")!.maxScore).toBe(3.33);
      expect(resolved.get("q2")!.part2SubPoints).toBeNull();
    });

    it("chia đều 10đ cho 10 câu -> mỗi câu đúng 1.0 điểm, không lệch làm tròn", () => {
      const tenQuestions = Array.from({ length: 10 }, (_, i) => ({
        question_id: `t${i}`,
        part: 1 as const,
        default_points: null,
        custom_points: null,
        custom_part2_points: null,
      }));
      const resolved = resolveExamScoring("tuy_chinh", "tu_dong", tenQuestions);
      expect(resolved.get("t0")!.maxScore).toBe(1);
      expect(resolved.get("t9")!.maxScore).toBe(1);
    });

    it("chế độ 'tuy_chinh' + 'thu_cong' -> dùng đúng custom_points đã nhập, câu chưa nhập = 0", () => {
      const withCustom = [
        { ...examQuestions[0], custom_points: 3 },
        examQuestions[1],
        { ...examQuestions[2], custom_points: 2 },
      ];
      const resolved = resolveExamScoring("tuy_chinh", "thu_cong", withCustom);
      expect(resolved.get("q1")!.maxScore).toBe(3);
      expect(resolved.get("q2")!.maxScore).toBe(0); // chưa nhập gì cho câu Phần 2 này
      expect(resolved.get("q3")!.maxScore).toBe(2);
    });

    it("chế độ 'tuy_chinh' + 'thu_cong' + Phần 2 có custom_part2_points -> tổng = a+b+c+d, giữ part2SubPoints", () => {
      const withPart2 = [
        examQuestions[0],
        { ...examQuestions[1], custom_part2_points: { a: 0.3, b: 0.2, c: 0.3, d: 0.2 } },
        examQuestions[2],
      ];
      const resolved = resolveExamScoring("tuy_chinh", "thu_cong", withPart2);
      expect(resolved.get("q2")!.maxScore).toBe(1);
      expect(resolved.get("q2")!.part2SubPoints).toEqual({ a: 0.3, b: 0.2, c: 0.3, d: 0.2 });
    });

    it("đề không có câu nào -> không lỗi chia cho 0 ở chế độ tự động", () => {
      const resolved = resolveExamScoring("tuy_chinh", "tu_dong", []);
      expect(resolved.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// scoreQuestionWithAnswer / maxScoreOf — hàm chấm 1 câu dùng CHUNG cho lúc nộp
// bài (submitAttempt) và lúc giáo viên chấm lại (regradeAttempt, 14/09/2026).
// Điểm quan trọng nhất cần khoá lại bằng test: 2 luồng đó phải cho ra ĐÚNG
// cùng một con số, nên hàm này phải khớp với các hàm chấm lẻ sẵn có.
// ---------------------------------------------------------------------------
describe("scoreQuestionWithAnswer", () => {
  const p1 = { part: 1 as const, correct_answer: { choice: "B" }, default_points: null };
  const p2 = {
    part: 2 as const,
    correct_answer: { a: true, b: false, c: true, d: false },
    default_points: null,
  };
  const p3 = { part: 3 as const, correct_answer: { value: "3,5" }, default_points: 0.5 };

  it("Phần 1 chế độ chuẩn: đúng được 0.25đ, sai 0đ, bỏ trống 0đ", () => {
    expect(scoreQuestionWithAnswer(p1, { choice: "B" }, undefined, false).score).toBe(0.25);
    expect(scoreQuestionWithAnswer(p1, { choice: "A" }, undefined, false).score).toBe(0);
    expect(scoreQuestionWithAnswer(p1, null, undefined, false).score).toBe(0);
  });

  it("Phần 1 chế độ tuỳ chỉnh: dùng đúng điểm tối đa của câu", () => {
    const resolved = { maxScore: 0.4, part2SubPoints: null };
    expect(scoreQuestionWithAnswer(p1, { choice: "B" }, resolved, true).score).toBe(0.4);
    expect(scoreQuestionWithAnswer(p1, { choice: "C" }, resolved, true).score).toBe(0);
  });

  it("có resolved nhưng đề ở chế độ CHUẨN thì vẫn chấm theo barem chuẩn", () => {
    // Đây là cái bẫy dễ sai nhất: resolveExamScoring luôn trả về resolved kể
    // cả ở chế độ chuẩn, nên không được lấy resolved làm căn cứ dùng hàm Custom.
    const resolved = { maxScore: 0.25, part2SubPoints: null };
    expect(scoreQuestionWithAnswer(p1, { choice: "B" }, resolved, false).score).toBe(0.25);
  });

  it("Phần 2 chế độ chuẩn: trả về cả số ý đúng theo bảng tỉ lệ THPT", () => {
    const r = scoreQuestionWithAnswer(
      p2,
      { a: true, b: false, c: true, d: true },
      undefined,
      false,
    );
    expect(r.subCorrectCount).toBe(3);
    expect(r.score).toBe(PART2_SCORE_TABLE[3]);
  });

  it("Phần 2 thủ công: cộng điểm riêng từng ý đúng", () => {
    const resolved = { maxScore: 2, part2SubPoints: { a: 0.5, b: 0.5, c: 0.5, d: 0.5 } };
    const r = scoreQuestionWithAnswer(p2, { a: true, b: false, c: false, d: false }, resolved, true);
    expect(r.subCorrectCount).toBe(3);
    expect(r.score).toBe(1.5);
  });

  it("Phần 2 tự động: đúng cả 4 ý mới có điểm", () => {
    const resolved = { maxScore: 0.4, part2SubPoints: null };
    expect(
      scoreQuestionWithAnswer(p2, { a: true, b: false, c: true, d: true }, resolved, true).score,
    ).toBe(0);
    expect(
      scoreQuestionWithAnswer(p2, { a: true, b: false, c: true, d: false }, resolved, true).score,
    ).toBe(0.4);
  });

  it("Phần 3: so sánh theo dạng đã chuẩn hoá, dùng default_points ở chế độ chuẩn", () => {
    expect(scoreQuestionWithAnswer(p3, { value: "3.5" }, undefined, false).score).toBe(0.5);
    expect(scoreQuestionWithAnswer(p3, { value: "3,50" }, undefined, false).score).toBe(0.5);
    expect(scoreQuestionWithAnswer(p3, { value: "4" }, undefined, false).score).toBe(0);
    expect(scoreQuestionWithAnswer(p3, null, undefined, false).score).toBe(0);
  });

  it("Phần 3 tuỳ chỉnh: dùng maxScore thay cho default_points", () => {
    const resolved = { maxScore: 1.25, part2SubPoints: null };
    expect(scoreQuestionWithAnswer(p3, { value: "3,5" }, resolved, true).score).toBe(1.25);
  });

  it("cho ra ĐÚNG cùng kết quả với các hàm chấm lẻ đang dùng ở chế độ chuẩn", () => {
    expect(scoreQuestionWithAnswer(p1, { choice: "B" }, undefined, false).score).toBe(
      scorePart1Question("B", "B"),
    );
    const direct = scorePart2Question(p2.correct_answer as never, { a: true, b: true });
    const viaHelper = scoreQuestionWithAnswer(p2, { a: true, b: true }, undefined, false);
    expect(viaHelper.score).toBe(direct.score);
    expect(viaHelper.subCorrectCount).toBe(direct.correctCount);
  });
});

describe("maxScoreOf", () => {
  it("không có resolved thì rơi về barem chuẩn THPT", () => {
    expect(maxScoreOf({ part: 1, correct_answer: null, default_points: null }, undefined)).toBe(0.25);
    expect(maxScoreOf({ part: 2, correct_answer: null, default_points: null }, undefined)).toBe(1);
    expect(maxScoreOf({ part: 3, correct_answer: null, default_points: 0.75 }, undefined)).toBe(0.75);
    expect(maxScoreOf({ part: 3, correct_answer: null, default_points: null }, undefined)).toBe(0.5);
  });

  it("có resolved thì luôn ưu tiên điểm tối đa thật của đề", () => {
    expect(
      maxScoreOf(
        { part: 1, correct_answer: null, default_points: null },
        { maxScore: 0.4, part2SubPoints: null },
      ),
    ).toBe(0.4);
  });
});
