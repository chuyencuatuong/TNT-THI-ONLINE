import { describe, expect, it } from "vitest";
import {
  extractCandidateText,
  extractJsonBlock,
  parseRetryDelaySeconds,
  matchTopicByName,
  mergeExtractedTaxonomies,
  mergeParsedExams,
  sanitizeJsonEscapes,
  type ExtractedTaxonomy,
  type ParsedExam,
} from "./ai";
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

/**
 * Bộ test cho SỬA LỖI 30/08/2026 — lỗi làm mất trắng cả 1 đợt (6 trang đề)
 * vì code cũ chỉ đọc đúng candidates[0].content.parts[0].text. Xem giải thích
 * đầy đủ ở extractCandidateText() trong ai.ts.
 */
describe("extractCandidateText", () => {
  it("đọc được câu trả lời 1 mảnh như model đời cũ", () => {
    const candidate = { content: { parts: [{ text: '{"part1": []}' }] } };
    expect(extractCandidateText(candidate)).toBe('{"part1": []}');
  });

  it("GHÉP nhiều mảnh văn bản lại thành 1 (code cũ chỉ lấy mảnh đầu → JSON cụt)", () => {
    const candidate = {
      content: { parts: [{ text: '{"part1": ' }, { text: "[]" }, { text: "}" }] },
    };
    expect(extractCandidateText(candidate)).toBe('{"part1": []}');
  });

  it("BỎ QUA mảnh suy nghĩ nội bộ (thought) đứng trước nội dung thật", () => {
    const candidate = {
      content: {
        parts: [
          { text: "Người dùng muốn bóc đề thi...", thought: true },
          { text: '{"part1": []}' },
        ],
      },
    };
    expect(extractCandidateText(candidate)).toBe('{"part1": []}');
  });

  it("bỏ qua mảnh không có khoá text (đây là ca làm code cũ tưởng là rỗng)", () => {
    const candidate = { content: { parts: [{ thought: true }, { text: "xong" }] } };
    expect(extractCandidateText(candidate)).toBe("xong");
  });

  it("trả về chuỗi rỗng khi thật sự không có nội dung nào", () => {
    expect(extractCandidateText(undefined)).toBe("");
    expect(extractCandidateText({})).toBe("");
    expect(extractCandidateText({ content: {} })).toBe("");
    expect(extractCandidateText({ content: { parts: [] } })).toBe("");
    expect(extractCandidateText({ content: { parts: [{ thought: true, text: "chỉ nghĩ" }] } })).toBe(
      "",
    );
  });
});

/**
 * Google gửi kèm "retryDelay" trong thân lỗi 429. Hạn mức gói miễn phí là 5
 * lượt/PHÚT cho mỗi model, nên chờ đúng khoảng này rồi gọi lại CÙNG model là
 * qua — xem chỗ xử lý 429 trong callGeminiPartsDetailed().
 */
describe("parseRetryDelaySeconds", () => {
  const realBody = JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      details: [
        { "@type": "type.googleapis.com/google.rpc.Help", links: [] },
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", quotaValue: "5" }],
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "27s" },
      ],
    },
  });

  it("đọc được retryDelay từ thân lỗi 429 thật của Google", () => {
    expect(parseRetryDelaySeconds(realBody)).toBe(27);
  });

  it("đọc được số giây có phần thập phân", () => {
    const body = JSON.stringify({ error: { details: [{ retryDelay: "27.510795735s" }] } });
    expect(parseRetryDelaySeconds(body)).toBeCloseTo(27.510795735);
  });

  it("trả null khi không có retryDelay", () => {
    expect(parseRetryDelaySeconds(JSON.stringify({ error: { code: 400 } }))).toBeNull();
    expect(parseRetryDelaySeconds(JSON.stringify({ error: { details: [] } }))).toBeNull();
  });

  it("trả null khi thân lỗi không phải JSON, không ném lỗi", () => {
    expect(parseRetryDelaySeconds("<html>502 Bad Gateway</html>")).toBeNull();
    expect(parseRetryDelaySeconds("")).toBeNull();
  });

  it("bỏ qua giá trị sai định dạng thay vì trả NaN", () => {
    expect(parseRetryDelaySeconds(JSON.stringify({ error: { details: [{ retryDelay: "27" }] } }))).toBeNull();
    expect(parseRetryDelaySeconds(JSON.stringify({ error: { details: [{ retryDelay: 27 }] } }))).toBeNull();
  });
});
