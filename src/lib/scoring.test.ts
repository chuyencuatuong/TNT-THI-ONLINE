import { describe, it, expect } from "vitest";
import {
  scorePart1Question,
  scorePart2Question,
  scorePart3Question,
  combineScores,
  normalizeShortAnswer,
  PART2_SCORE_TABLE,
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
