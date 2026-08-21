import { describe, expect, it } from "vitest";
import { extractFromHtml } from "./wordImport";

describe("extractFromHtml", () => {
  it("bóc thẻ HTML cơ bản thành văn bản thuần", () => {
    const html = "<p>Câu 1. Giải phương trình.</p><p>A. x=1</p>";
    const { plainText } = extractFromHtml(html);
    expect(plainText).toContain("Câu 1. Giải phương trình.");
    expect(plainText).toContain("A. x=1");
    expect(plainText).not.toContain("<p>");
  });

  it("giữ lại in đậm dưới dạng **...** để AI nhận biết đáp án đánh dấu", () => {
    const html = "<p>A. <strong>x = 1</strong></p><p>B. x = 2</p>";
    const { plainText } = extractFromHtml(html);
    expect(plainText).toContain("**x = 1**");
  });

  it("tách hình ảnh base64 thành placeholder và danh sách images riêng", () => {
    const html =
      '<p>Câu 1. <img src="data:image/png;base64,QUJD" alt=""> là công thức.</p>';
    const { plainText, images } = extractFromHtml(html);
    expect(plainText).toContain("[HINH_1]");
    expect(plainText).not.toContain("base64");
    expect(images).toHaveLength(1);
    expect(images[0]).toEqual({
      placeholder: "[HINH_1]",
      mimeType: "image/png",
      dataBase64: "QUJD",
    });
  });

  it("đánh số nhiều hình ảnh theo đúng thứ tự xuất hiện", () => {
    const html =
      '<img src="data:image/png;base64,AAA"><p>giữa</p><img src="data:image/jpeg;base64,BBB">';
    const { images } = extractFromHtml(html);
    expect(images.map((i) => i.placeholder)).toEqual(["[HINH_1]", "[HINH_2]"]);
    expect(images[1].mimeType).toBe("image/jpeg");
  });

  it("giải mã các HTML entity thường gặp", () => {
    const html = "<p>x &gt; 0 &amp; y &lt; 10 &quot;test&quot;</p>";
    const { plainText } = extractFromHtml(html);
    expect(plainText).toBe('x > 0 & y < 10 "test"');
  });

  it("gộp nhiều dòng trống liên tiếp lại", () => {
    const html = "<p>Dòng 1</p><p></p><p></p><p>Dòng 2</p>";
    const { plainText } = extractFromHtml(html);
    expect(plainText).not.toMatch(/\n{3,}/);
  });
});
