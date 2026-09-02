import { describe, expect, it } from "vitest";
import {
  extractJsonBlock,
  isChunkResultFailed,
  matchLessonByName,
  matchTopicByName,
  mergeExtractedTaxonomies,
  mergeParsedExams,
  planChunkRetries,
  salvagePartialClassifications,
  sanitizeJsonEscapes,
  type ExtractedTaxonomy,
  type ParsedExam,
} from "./ai";
import type { Lesson, Topic } from "./types";

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

  it("tự sửa được dấu \\ chưa escape trong công thức LaTeX (lỗi AI hay gặp)", () => {
    // AI quên nhân đôi \ khi viết \lim, \sqrt, \left... — JSON.parse thường sẽ
    // báo lỗi "Bad escaped character" và làm mất trắng cả câu hỏi nếu không
    // sửa. Dùng lệnh LaTeX không trùng chữ cái đầu với escape JSON hợp lệ
    // (b/f/n/r/t/u) để phép thử không rơi vào vùng mơ hồ không thể phân biệt
    // với ký tự điều khiển thật — xem ghi chú giới hạn ở sanitizeJsonEscapes.
    const raw = String.raw`{"content_latex": "Tính $\lim\limits_{x} \sqrt{2}+(\alpha)$"}`;
    expect(extractJsonBlock(raw)).toEqual({
      content_latex: String.raw`Tính $\lim\limits_{x} \sqrt{2}+(\alpha)$`,
    });
  });

  it("vẫn đọc đúng khi các phần khác của JSON không có lỗi escape", () => {
    const raw = String.raw`{"a": "\\frac{1}{2}", "b": "bình thường", "c": "\lim"}`;
    expect(extractJsonBlock(raw)).toEqual({
      a: String.raw`\frac{1}{2}`,
      b: "bình thường",
      c: String.raw`\lim`,
    });
  });
});

describe("sanitizeJsonEscapes", () => {
  it("nhân đôi dấu \\ đứng trước ký tự không hợp lệ trong JSON", () => {
    expect(sanitizeJsonEscapes(String.raw`{"a": "\lim"}`)).toBe(String.raw`{"a": "\\lim"}`);
  });

  it("giữ nguyên các escape hợp lệ (\\\", \\\\, \\n...)", () => {
    const raw = String.raw`{"a": "dòng 1\ndòng \"2\", \\ hết"}`;
    expect(sanitizeJsonEscapes(raw)).toBe(raw);
  });

  it("không đụng vào backslash bên ngoài chuỗi JSON", () => {
    // Không có trường hợp thực tế nào backslash nằm ngoài chuỗi trong JSON hợp
    // lệ, nhưng hàm không được làm hỏng phần cấu trúc JSON (dấu {, }, ", ...).
    expect(sanitizeJsonEscapes('{"a": 1, "b": [1, 2]}')).toBe('{"a": 1, "b": [1, 2]}');
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

describe("mergeExtractedTaxonomies", () => {
  const empty: ExtractedTaxonomy = { candidates: [], warnings: [] };

  it("trả về taxonomy rỗng khi không có kết quả nào", () => {
    expect(mergeExtractedTaxonomies([])).toEqual(empty);
  });

  it("gộp nhiều đợt theo đúng thứ tự, cộng dồn candidates và warnings, không tự khử trùng lặp", () => {
    const chunk1: ExtractedTaxonomy = {
      candidates: [
        { name: "Dạng 1: Tìm khoảng đơn điệu", description: "...", example_summary: null },
      ],
      warnings: ["đợt 1 có 1 trang mờ"],
    };
    const chunk2: ExtractedTaxonomy = {
      candidates: [
        { name: "Dạng 1: Tìm khoảng đơn điệu", description: "trùng tên với đợt 1", example_summary: null },
        { name: "Dạng 2: Cực trị hàm số", description: "...", example_summary: "vd 1" },
      ],
      warnings: [],
    };
    const merged = mergeExtractedTaxonomies([chunk1, chunk2]);
    expect(merged.candidates).toHaveLength(3); // không khử trùng — để giáo viên tự xử lý ở bước duyệt
    expect(merged.candidates.map((c) => c.name)).toEqual([
      "Dạng 1: Tìm khoảng đơn điệu",
      "Dạng 1: Tìm khoảng đơn điệu",
      "Dạng 2: Cực trị hàm số",
    ]);
    expect(merged.warnings).toEqual(["đợt 1 có 1 trang mờ"]);
  });
});

describe("matchTopicByName", () => {
  const topics: Topic[] = [
    { id: "t1", name: "Ứng dụng đạo hàm", chapter: "Chương 1", grade: 12, order_index: null, created_at: "" },
    { id: "t2", name: "Nguyên hàm - Tích phân", chapter: "Chương 3", grade: 12, order_index: null, created_at: "" },
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

describe("matchLessonByName (thêm cùng migration_016 — Bài scoped theo topicId)", () => {
  const lessons: Lesson[] = [
    { id: "l1", topic_id: "t1", name: "Sự đồng biến, nghịch biến của hàm số", description: null, order_index: null, created_at: "" },
    { id: "l2", topic_id: "t1", name: "Cực trị của hàm số", description: null, order_index: null, created_at: "" },
    { id: "l3", topic_id: "t2", name: "Nguyên hàm", description: null, order_index: null, created_at: "" },
  ];

  it("khớp đúng tên Bài trong đúng chương, không phân biệt hoa/thường", () => {
    expect(matchLessonByName("CỰC TRỊ CỦA HÀM SỐ", "t1", lessons)).toBe("l2");
  });

  it("khớp được khi có khoảng trắng thừa ở đầu/cuối", () => {
    expect(matchLessonByName("  Nguyên hàm  ", "t2", lessons)).toBe("l3");
  });

  it("trả về null khi tên khớp Bài nhưng SAI chương (Bài đó thuộc chương khác)", () => {
    expect(matchLessonByName("Nguyên hàm", "t1", lessons)).toBeNull();
  });

  it("trả về null khi tên không khớp Bài nào trong chương", () => {
    expect(matchLessonByName("Hoán vị chỉnh hợp", "t1", lessons)).toBeNull();
  });

  it("trả về null khi tên là null/undefined/rỗng", () => {
    expect(matchLessonByName(null, "t1", lessons)).toBeNull();
    expect(matchLessonByName(undefined, "t1", lessons)).toBeNull();
    expect(matchLessonByName("   ", "t1", lessons)).toBeNull();
  });

  it("trả về null khi topicId là null (chưa xác định được chương thì không đoán Bài)", () => {
    expect(matchLessonByName("Cực trị của hàm số", null, lessons)).toBeNull();
  });

  it("trả về null khi danh sách lessons rỗng", () => {
    expect(matchLessonByName("Cực trị của hàm số", "t1", [])).toBeNull();
  });
});


describe("isChunkResultFailed / planChunkRetries (thử lại chỉ đúng đợt lỗi, thêm 31/08/2026)", () => {
  const ok: ParsedExam = { part1: [], part2: [], part3: [], warnings: [] };
  const okWithNote: ParsedExam = {
    part1: [],
    part2: [],
    part3: [],
    warnings: ["Câu 3 có hình hơi mờ, xem lại"],
  };
  const failed: ParsedExam = {
    part1: [],
    part2: [],
    part3: [],
    warnings: ["[LỖI ĐỢT] Trang 1-6: AI trả lời rỗng."],
  };

  it("isChunkResultFailed: chỉ nhận diện đúng đợt lỗi (có tiền tố [LỖI ĐỢT]), không nhầm với ghi chú thường", () => {
    expect(isChunkResultFailed(ok)).toBe(false);
    expect(isChunkResultFailed(okWithNote)).toBe(false);
    expect(isChunkResultFailed(failed)).toBe(true);
  });

  it("planChunkRetries: chưa có kết quả lần trước → cần gọi lại AI cho MỌI đợt", () => {
    expect(planChunkRetries(3)).toEqual([true, true, true]);
    expect(planChunkRetries(3, [])).toEqual([true, true, true]);
  });

  it("planChunkRetries: giữ lại đợt đã thành công, chỉ đánh dấu gọi lại đúng đợt lỗi", () => {
    expect(planChunkRetries(3, [ok, failed, okWithNote])).toEqual([false, true, false]);
  });

  it("planChunkRetries: đợt chưa từng chạy ở lần trước (undefined trong mảng) vẫn cần gọi lại", () => {
    expect(planChunkRetries(3, [ok, undefined, failed])).toEqual([false, true, true]);
  });
});

describe("salvagePartialClassifications", () => {
  it("cứu được các phần tử ĐỌC ĐÚNG khi JSON bị cắt ngang giữa chừng (lỗi thật khi bấm nút phân loại 22 câu, 01/09/2026)", () => {
    // Mô phỏng đúng dạng lỗi thật gặp: mảng "classifications" có nhiều phần
    // tử đọc đúng, nhưng bị CẮT NGANG (không có dấu ] đóng mảng/object cuối)
    // do chạm giới hạn token phản hồi giữa chừng.
    const raw = `{
  "classifications": [
    {"id": "p1:local-1", "topic_name": "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số", "lesson_name": "Bài 1. Tính đơn điệu và cực trị của hàm số"},
    {"id": "p1:local-2", "topic_name": "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số", "lesson_name": "Bài 1. Tính đơn điệu và cực trị của hàm số"},
    {"id": "p1:local-3", "topic_name": "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số", "lesson_name": "Bài 2. Giá trị lớn nhất và giá trị nhỏ nhất của hàm số"},
    {"id": "p1:local-4", "topic_name": "Ứng dụng đạo hàm để khảo`;
    const result = salvagePartialClassifications(raw);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: "p1:local-1",
      topic_name: "Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số",
      lesson_name: "Bài 1. Tính đơn điệu và cực trị của hàm số",
    });
    expect(result[2].id).toBe("p1:local-3");
    // Phần tử thứ 4 bị cắt dở (không có dấu } đóng) — bị bỏ qua, không làm hỏng 3 phần tử trước.
  });

  it("đọc đủ khi JSON không bị lỗi gì (trường hợp bình thường)", () => {
    const raw = `{"classifications": [{"id": "a", "topic_name": "X", "lesson_name": null}, {"id": "b", "topic_name": null, "lesson_name": null}]}`;
    expect(salvagePartialClassifications(raw)).toEqual([
      { id: "a", topic_name: "X", lesson_name: null },
      { id: "b", topic_name: null, lesson_name: null },
    ]);
  });

  it("trả về mảng rỗng khi không tách được object nào hợp lệ", () => {
    expect(salvagePartialClassifications("không phải JSON gì cả")).toEqual([]);
    expect(salvagePartialClassifications("")).toEqual([]);
  });

  it("bỏ qua object không có \"id\" dạng chuỗi (không đủ để ghép kết quả)", () => {
    const raw = `[{"topic_name": "X"}, {"id": "ok", "topic_name": "Y", "lesson_name": "Z"}]`;
    expect(salvagePartialClassifications(raw)).toEqual([{ id: "ok", topic_name: "Y", lesson_name: "Z" }]);
  });
});
