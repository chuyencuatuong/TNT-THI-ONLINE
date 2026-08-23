import { describe, expect, it } from "vitest";
import { extractJsonBlock, matchTopicByName, mergeParsedExams, type ParsedExam } from "./ai";
import type { Topic } from "./types";

describe("extractJsonBlock", () => {
  it("đọc JSON thuần không có code fence", () => {
    expect(extractJsonBlock('{"a": 1}')).toEqual({ a: 1 });
  });

  it("bóc JSON ra khỏi khối ```json ... ```", () => {
    const raw = 'Đây là kết quả:\n```json\n{"a": 1, "b": [1,2,3]}\n```\nHết.';
    expect(extractJsonBlock(raw)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it("bóc JSON ra khỏi khối ``` không ghi rõ ngôn ngữ", () => {
    const raw = '```\n{"ok": true}\n```';
    expect(extractJsonBlock(raw)).toEqual({ ok: true });
  });

  it("đọc được mảng JSON ở gốc", () => {
    expect(extractJsonBlock("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("bỏ qua chữ thừa trước/sau khối JSON", () => {
    const raw = 'Trả lời: {"x": "y"} — xong.';
    expect(extractJsonBlock(raw)).toEqual({ x: "y" });
  });
});

describe("mergeParsedExams", () => {
  const empty: ParsedExam = { part1: [], part2: [], part3: [], warnings: [] };

  it("trả về đề rỗng khi không có kết quả nào", () => {
    expect(mergeParsedExams([])).toEqual(empty);
  });

  it("gộp nhiều đợt theo đúng thứ tự, cộng dồn từng phần và warnings", () => {
    const chunk1: ParsedExam = {
      part1: [{ content_latex: "câu 1", choices: { A: "", B: "", C: "", D: "" }, correct_choice: "A" }],
      part2: [],
      part3: [],
      warnings: ["đợt 1 có 1 câu mờ"],
    };
    const chunk2: ParsedExam = {
      part1: [{ content_latex: "câu 2", choices: { A: "", B: "", C: "", D: "" }, correct_choice: null }],
      part2: [{ content_latex: "câu tf", items: { a: "", b: "", c: "", d: "" }, correct: null }],
      part3: [],
      warnings: [],
    };
    const merged = mergeParsedExams([chunk1, chunk2]);
    expect(merged.part1.map((q) => q.content_latex)).toEqual(["câu 1", "câu 2"]);
    expect(merged.part2).toHaveLength(1);
    expect(merged.part3).toHaveLength(0);
    expect(merged.warnings).toEqual(["đợt 1 có 1 câu mờ"]);
  });
});

describe("matchTopicByName", () => {
  const topics: Topic[] = [
    { id: "t1", name: "Ứng dụng đạo hàm", chapter: "Chương 1", grade: 12, created_at: "" },
    { id: "t2", name: "Nguyên hàm - Tích phân", chapter: "Chương 3", grade: 12, created_at: "" },
  ];

  it("khớp đúng tên chương, không phân biệt hoa/thường", () => {
    expect(matchTopicByName("ỨNG DỤNG ĐẠO HÀM", topics)).toBe("t1");
  });

  it("khớp được khi có khoảng trắng thừa ở đầu/cuối", () => {
    expect(matchTopicByName("  Nguyên hàm - Tích phân  ", topics)).toBe("t2");
  });

  it("trả về null khi tên không khớp chương nào", () => {
    expect(matchTopicByName("Hình học không gian", topics)).toBeNull();
  });

  it("trả về null khi tên là null/undefined/rỗng", () => {
    expect(matchTopicByName(null, topics)).toBeNull();
    expect(matchTopicByName(undefined, topics)).toBeNull();
    expect(matchTopicByName("   ", topics)).toBeNull();
  });

  it("trả về null khi danh sách topics rỗng", () => {
    expect(matchTopicByName("Ứng dụng đạo hàm", [])).toBeNull();
  });
});
