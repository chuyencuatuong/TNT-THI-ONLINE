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
