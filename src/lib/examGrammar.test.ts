import { describe, expect, it } from "vitest";
import { detectExamStructure, findLastOrderedLabelRun, type StructurePage } from "./examGrammar";

describe("findLastOrderedLabelRun", () => {
  it("nhận đủ 4 nhãn khi cùng 1 dòng, cách nhau khoảng trắng lớn (bố cục Azota thật)", () => {
    const text = "Cho hàm số f(x). A. (0;-1;0)   B. (-2;0;0)   *C. (0;-1;3)   D. (-2;-1;0)";
    const result = findLastOrderedLabelRun(text, ["A", "B", "C", "D"]);
    expect(result.complete).toBe(true);
    expect(result.found).toEqual(["A", "B", "C", "D"]);
  });

  it("nhận đủ 4 nhãn khi chia 2 dòng (A,B dòng 1 — C,D dòng 2, thực tế Thầy Tường mô tả)", () => {
    const text = "Cho hàm số f(x).\nA. (0;-1;0)   B. (-2;0;0)\nC. (0;-1;3)   D. (-2;-1;0)";
    const result = findLastOrderedLabelRun(text, ["A", "B", "C", "D"]);
    expect(result.complete).toBe(true);
  });

  it("KHÔNG bị nhầm với toạ độ điểm dạng A(1;2;3) (không có dấu . hoặc ) ngay sau chữ cái)", () => {
    const text = "Trong không gian Oxyz, cho điểm A(1;2;3) và B(0;1;0). Đường thẳng AB có vectơ chỉ phương là\nA. (1;-1;3)   B. (1;1;-3)   C. (-1;1;3)   D. (1;1;3)";
    const result = findLastOrderedLabelRun(text, ["A", "B", "C", "D"]);
    expect(result.complete).toBe(true);
    // Phải lấy đúng 4 nhãn Ở CUỐI (đáp án thật), không lẫn với A(/B( ở đầu câu.
  });

  it("thiếu 1 nhãn → complete = false", () => {
    const text = "A. một   B. hai   D. bốn"; // thiếu C
    const result = findLastOrderedLabelRun(text, ["A", "B", "C", "D"]);
    expect(result.complete).toBe(false);
  });

  it("nhãn sai thứ tự (D trước A) → complete = false", () => {
    const text = "D. bốn   C. ba   B. hai   A. một";
    const result = findLastOrderedLabelRun(text, ["A", "B", "C", "D"]);
    expect(result.complete).toBe(false);
  });

  it("mảng nhãn rỗng (Phần 3, không có đáp án cho sẵn) → luôn complete = true", () => {
    expect(findLastOrderedLabelRun("bất kỳ nội dung gì", [])).toEqual({ found: [], complete: true });
  });

  it("nhận nhãn có 1 khoảng trắng giữa chữ cái và dấu chấm (lỗi tách text item thật của pdf.js, đề Thầy Tường 01/09/2026, vd \"D .\")", () => {
    const text = "A. một B. hai C. ba D . bốn";
    const result = findLastOrderedLabelRun(text, ["A", "B", "C", "D"]);
    expect(result.complete).toBe(true);
  });
});

describe("detectExamStructure", () => {
  function page(pageNumber: number, pageText: string): StructurePage {
    return { pageNumber, pageText };
  }

  it("tách đúng 1 đề đầy đủ 3 Phần, đáp án đúng chuẩn — structureConfident = true", () => {
    const pages: StructurePage[] = [
      page(
        1,
        [
          "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.",
          "Câu 1: Trong không gian Oxyz, tọa độ hình chiếu của điểm A(-2;-1;3) trên mặt phẳng Oyz là",
          "A. (0;-1;0)   B. (-2;0;0)   C. (0;-1;3)   D. (-2;-1;0)",
          "Câu 2: Cho hai vectơ.",
          "A. một   B. hai   C. ba   D. bốn",
        ].join("\n"),
      ),
      page(
        2,
        [
          "PHẦN II. Câu trắc nghiệm đúng sai.",
          "Câu 1: Cho hai điểm M, N.",
          "a) đúng   b) sai   c) đúng   d) sai",
          "PHẦN III. Câu trả lời ngắn.",
          "Câu 1: Tính giá trị của biểu thức.",
          "Đáp số: 5",
        ].join("\n"),
      ),
    ];

    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(true);
    expect(structure.sections).toHaveLength(3);
    expect(structure.sections[0].part).toBe("part1");
    expect(structure.sections[0].questions).toHaveLength(2);
    expect(structure.sections[0].questions[0].choiceLabelsComplete).toBe(true);
    expect(structure.sections[1].part).toBe("part2");
    expect(structure.sections[2].part).toBe("part3");
    // Phần 3 không cần nhãn — vẫn confident.
    expect(structure.sections[2].questions[0].choiceLabelsComplete).toBe(true);
  });

  it("câu có Lời giải nhắc lại \"Chọn A.\" sau đáp án KHÔNG được làm hỏng thứ tự (lỗi thật phát hiện trên đề Thầy Tường 01/09/2026)", () => {
    // Trước khi sửa: quét nhãn trên CẢ đoạn "Lời giải" khiến "Chọn A." (xuất
    // hiện SAU D.) trở thành lần xuất hiện SAU CÙNG của "A" → phá vỡ điều
    // kiện A→B→C→D tăng dần, dù đáp án thật ở đầu câu hoàn toàn đúng thứ tự.
    const pages: StructurePage[] = [
      page(
        1,
        [
          "PHẦN I: CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN",
          "Câu 1: Cho hàm số y=f(x) có bảng biến thiên như sau:",
          "A.   ; 2   . B.   1;1  . C.   0;  . D.   1;   .",
          "Lời giải",
          "Chọn A.",
          "Dựa vào bảng biến thiên, ta thấy hàm số đồng biến trên khoảng đã cho.",
          "Câu 2: Câu tiếp theo.",
          "A. một   B. hai   C. ba   D. bốn",
        ].join("\n"),
      ),
    ];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(true);
    expect(structure.sections[0].questions[0].choiceLabelsComplete).toBe(true);
    expect(structure.sections[0].questions[0].choiceLabelsFound).toEqual(["A", "B", "C", "D"]);
  });

  it("câu vắt ngang 2 trang vẫn được ghép đúng (gán đúng trang bắt đầu câu)", () => {
    const pages: StructurePage[] = [
      page(1, ["PHẦN I. Câu trắc nghiệm.", "Câu 1: Cho hàm số f(x) rất dài, tiếp tục sang trang sau..."].join("\n")),
      page(2, ["A. một   B. hai   C. ba   D. bốn", "Câu 2: Câu tiếp theo.", "A. 1   B. 2   C. 3   D. 4"].join("\n")),
    ];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(true);
    expect(structure.sections[0].questions[0].pageNumber).toBe(1);
    expect(structure.sections[0].questions[0].choiceLabelsComplete).toBe(true);
    expect(structure.sections[0].questions[1].pageNumber).toBe(2);
  });

  it("thiếu đáp án 1 câu (chỉ có A, B, C — thiếu D, có thể do PDF mất chữ) → structureConfident = false cho CẢ đề", () => {
    const pages: StructurePage[] = [
      page(1, ["PHẦN I. Câu trắc nghiệm.", "Câu 1: Đề bài.", "A. một   B. hai   C. ba"].join("\n")),
    ];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(false);
  });

  it("không tìm thấy Phần nào (đề không theo format chuẩn) → structureConfident = false, sections rỗng", () => {
    const pages: StructurePage[] = [page(1, "Đây là 1 đoạn văn bản bất kỳ, không có Câu hay Phần nào cả.")];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(false);
    expect(structure.sections).toEqual([]);
  });

  it("Phần xuất hiện sai thứ tự (II trước I) → structureConfident = false", () => {
    const pages: StructurePage[] = [
      page(
        1,
        ["PHẦN II. ...", "Câu 1: ...", "a) x b) y c) z d) t", "PHẦN I. ...", "Câu 1: ...", "A. x B. y C. z D. t"].join(
          "\n",
        ),
      ),
    ];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(false);
  });

  it("số câu không tăng dần trong 1 Phần (trùng/giảm số) → structureConfident = false", () => {
    const pages: StructurePage[] = [
      page(
        1,
        [
          "PHẦN I. ...",
          "Câu 1: ...",
          "A. x   B. y   C. z   D. t",
          "Câu 1: (lặp số câu do đọc nhầm) ...",
          "A. x   B. y   C. z   D. t",
        ].join("\n"),
      ),
    ];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(false);
  });

  it("mảng trang rỗng → structureConfident = false, không lỗi", () => {
    expect(detectExamStructure([])).toEqual({ sections: [], structureConfident: false });
  });

  it("chấp nhận đề chỉ có Phần I (không có Phần II/III)", () => {
    const pages: StructurePage[] = [
      page(1, ["PHẦN I. ...", "Câu 1: ...", "A. x   B. y   C. z   D. t"].join("\n")),
    ];
    const structure = detectExamStructure(pages);
    expect(structure.structureConfident).toBe(true);
    expect(structure.sections).toHaveLength(1);
  });
});
