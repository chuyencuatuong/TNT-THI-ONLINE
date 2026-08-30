import { describe, expect, it } from "vitest";
import { shuffleQuestionForReview } from "./reviewShuffle";
import type { Part1Answer, Part2Answer, QuestionRow } from "./types";

function makePart1Question(): QuestionRow {
  return {
    id: "q1",
    part: 1,
    question_type_id: null,
    topic_id: null,
    ai_suggested_topic_id: null,
    difficulty: null,
    content_latex: "1+1=?",
    image_url: null,
    options: { choices: { A: "1", B: "2", C: "3", D: "4" } },
    correct_answer: { choice: "B" },
    solution_latex: null,
    default_points: null,
    ai_suggested_type_id: null,
    ai_suggestion_confirmed: false,
    source: "manual",
    created_by: "t1",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function makePart2Question(): QuestionRow {
  return {
    id: "q2",
    part: 2,
    question_type_id: null,
    topic_id: null,
    ai_suggested_topic_id: null,
    difficulty: null,
    content_latex: "Xét tính đúng sai",
    image_url: null,
    options: { items: { a: "ý a", b: "ý b", c: "ý c", d: "ý d" } },
    correct_answer: { a: true, b: false, c: true, d: false },
    solution_latex: null,
    default_points: null,
    ai_suggested_type_id: null,
    ai_suggestion_confirmed: false,
    source: "manual",
    created_by: "t1",
    created_at: "2026-01-01T00:00:00Z",
  };
}

// randomFn cố định để test tất định — không quan trọng hoán vị cụ thể là gì,
// chỉ cần kiểm tra các bất biến (invariant) đúng với MỌI hoán vị hợp lệ.
const randomSequences = [
  () => 0,
  () => 0.99,
  (() => {
    let i = 0;
    const seq = [0.9, 0.1, 0.5, 0.3];
    return () => seq[i++ % seq.length];
  })(),
];

describe("shuffleQuestionForReview — Phần 1", () => {
  it("nội dung 4 phương án sau khi xáo vẫn đúng bộ giá trị gốc (chỉ đổi vị trí)", () => {
    for (const rf of randomSequences) {
      const shuffled = shuffleQuestionForReview(makePart1Question(), rf);
      const values = Object.values((shuffled.options as { choices: Record<string, string> }).choices);
      expect(values.sort()).toEqual(["1", "2", "3", "4"]);
    }
  });

  it("đáp án đúng sau khi xáo vẫn trỏ đúng NỘI DUNG đã đúng ban đầu (giá trị '2')", () => {
    for (const rf of randomSequences) {
      const shuffled = shuffleQuestionForReview(makePart1Question(), rf);
      const choices = (shuffled.options as { choices: Record<string, string> }).choices;
      const newCorrectLabel = (shuffled.correct_answer as Part1Answer).choice;
      expect(choices[newCorrectLabel]).toBe("2");
    }
  });

  it("không sửa object câu hỏi gốc", () => {
    const original = makePart1Question();
    const originalChoicesCopy = { ...(original.options as { choices: Record<string, string> }).choices };
    shuffleQuestionForReview(original, () => 0.5);
    expect((original.options as { choices: Record<string, string> }).choices).toEqual(originalChoicesCopy);
    expect((original.correct_answer as Part1Answer).choice).toBe("B");
  });
});

describe("shuffleQuestionForReview — Phần 2", () => {
  it("nội dung 4 ý sau khi xáo vẫn đúng bộ giá trị gốc, và đúng/sai đi kèm đúng nội dung ý đó", () => {
    for (const rf of randomSequences) {
      const original = makePart2Question();
      const shuffled = shuffleQuestionForReview(original, rf);
      const items = (shuffled.options as { items: Record<string, string> }).items;
      const correct = shuffled.correct_answer as Part2Answer;

      // Tập nội dung 4 ý không đổi
      expect(Object.values(items).sort()).toEqual(["ý a", "ý b", "ý c", "ý d"]);

      // Ý nào có nội dung "ý a"/"ý c" (đúng theo đề gốc) thì sau khi xáo vẫn phải true;
      // "ý b"/"ý d" (sai theo đề gốc) vẫn phải false — bất kể xáo sang vị trí nào.
      for (const key of ["a", "b", "c", "d"] as const) {
        if (items[key] === "ý a" || items[key] === "ý c") {
          expect(correct[key]).toBe(true);
        } else {
          expect(correct[key]).toBe(false);
        }
      }
    }
  });
});

describe("shuffleQuestionForReview — Phần 3", () => {
  it("không có gì để xáo trộn, trả về nguyên câu hỏi", () => {
    const q3: QuestionRow = {
      ...makePart1Question(),
      part: 3,
      options: {},
      correct_answer: { value: "5" },
    };
    const result = shuffleQuestionForReview(q3, () => 0.5);
    expect(result).toBe(q3);
  });
});
