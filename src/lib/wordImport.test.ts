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

  // THÊM 25/08/2026: lỗi thật gặp phải — ảnh nhúng dạng EMF/WMF (OLE từ
  // Visio/Excel) bị gửi thẳng cho Gemini làm lỗi 400 "Request contains an
  // invalid argument" trên CẢ 2 model, hỏng nguyên lượt phân tích dù phần
  // còn lại đọc tốt. Phải lọc bỏ TRƯỚC khi gửi, không phải để AI tự xử lý.
  it("lọc bỏ ảnh định dạng Gemini không đọc được (EMF/WMF), không đưa vào images gửi cho AI", () => {
    const html = '<p>Câu 1. <img src="data:image/x-emf;base64,QUJD" alt=""> là bảng xét dấu.</p>';
    const { plainText, images, unsupportedImageCount } = extractFromHtml(html);
    expect(images).toHaveLength(0);
    expect(unsupportedImageCount).toBe(1);
    expect(plainText).not.toContain("base64");
    expect(plainText).not.toContain("[HINH_1]");
    expect(plainText).toContain("không đọc tự động được");
  });

  it("vẫn đánh số [HINH_n] đúng cho ảnh hợp lệ dù có xen lẫn ảnh không đọc được", () => {
    const html =
      '<img src="data:image/png;base64,AAA"><p>giữa</p><img src="data:image/x-emf;base64,BBB"><p>giữa 2</p><img src="data:image/jpeg;base64,CCC">';
    const { images, unsupportedImageCount } = extractFromHtml(html);
    expect(images.map((i) => i.placeholder)).toEqual(["[HINH_1]", "[HINH_2]"]);
    expect(images.map((i) => i.mimeType)).toEqual(["image/png", "image/jpeg"]);
    expect(unsupportedImageCount).toBe(1);
  });

  it("unsupportedImageCount = 0 khi mọi ảnh đều đọc được", () => {
    const html = '<img src="data:image/png;base64,AAA">';
    const { unsupportedImageCount } = extractFromHtml(html);
    expect(unsupportedImageCount).toBe(0);
  });
});
