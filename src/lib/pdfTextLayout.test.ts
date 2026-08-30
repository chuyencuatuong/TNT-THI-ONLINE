import { describe, expect, it } from "vitest";
import { joinTextItems, type PositionedTextItem } from "./pdfTextLayout";

function mockItem(
  str: string,
  x: number,
  y: number,
  width: number,
  hasEOL = false,
): PositionedTextItem {
  return { str, width, transform: [1, 0, 0, 1, x, y], hasEOL };
}

describe("joinTextItems", () => {
  it("nối các mục cùng dòng (y giống nhau) bằng khoảng trắng", () => {
    const items = [mockItem("Câu", 36, 700, 20), mockItem("1:", 60, 700, 10)];
    expect(joinTextItems(items)).toBe("Câu 1:");
  });

  it("xuống dòng khi toạ độ y lệch quá mức cho phép", () => {
    const items = [mockItem("Dòng một", 36, 700, 40), mockItem("Dòng hai", 36, 680, 40)];
    expect(joinTextItems(items)).toBe("Dòng một\nDòng hai");
  });

  it("mục text rỗng (thường ở vị trí ảnh/khoảng trống) chỉ chèn 1 khoảng trắng, không lặp lại", () => {
    const items = [
      mockItem("Cho hàm số", 36, 700, 50),
      mockItem("", 90, 700, 20),
      mockItem("có bảng biến thiên", 130, 700, 80),
    ];
    expect(joinTextItems(items)).toBe("Cho hàm số có bảng biến thiên");
  });

  it("mảng rỗng trả về chuỗi rỗng", () => {
    expect(joinTextItems([])).toBe("");
  });

  it("gộp nhiều dòng liền không để dư quá 1 dòng trống", () => {
    const items = [mockItem("A", 36, 700, 10), mockItem("B", 36, 600, 10), mockItem("C", 36, 500, 10)];
    expect(joinTextItems(items)).toBe("A\nB\nC");
  });

  it("ưu tiên tín hiệu hasEOL của pdf.js kể cả khi toạ độ y không đổi", () => {
    const items = [mockItem("Câu 1:", 36, 700, 30, true), mockItem("Nội dung câu.", 36, 700, 60)];
    expect(joinTextItems(items)).toBe("Câu 1:\nNội dung câu.");
  });
});
