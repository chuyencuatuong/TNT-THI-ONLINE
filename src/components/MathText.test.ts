import { describe, expect, it } from "vitest";
import { insertImageToken, splitLatex } from "./MathText";

/**
 * Ảnh chèn giữa văn bản (THÊM 30/08/2026) — dùng cho ô nhập lời giải thủ công
 * sau khi bỏ phần AI tự trích lời giải. Xem ghi chú ở MathText.tsx.
 */
describe("splitLatex — ảnh ![](...)", () => {
  it("tách được ảnh nằm giữa văn bản thường", () => {
    expect(splitLatex("Xem hình ![](https://a.b/c.png) rồi giải.")).toEqual([
      { type: "text", value: "Xem hình " },
      { type: "image", value: "https://a.b/c.png", alt: "" },
      { type: "text", value: " rồi giải." },
    ]);
  });

  it("giữ lại chú thích trong dấu ngoặc vuông", () => {
    expect(splitLatex("![Bảng biến thiên](https://a.b/c.png)")).toEqual([
      { type: "image", value: "https://a.b/c.png", alt: "Bảng biến thiên" },
    ]);
  });

  it("xử lý đúng thứ tự khi ảnh và công thức nằm lẫn nhau", () => {
    expect(splitLatex("$x^2$ và ![](u1) rồi $y$")).toEqual([
      { type: "inline", value: "x^2" },
      { type: "text", value: " và " },
      { type: "image", value: "u1", alt: "" },
      { type: "text", value: " rồi " },
      { type: "inline", value: "y" },
    ]);
  });

  it("ảnh đứng trước công thức khối vẫn ra đúng thứ tự", () => {
    expect(splitLatex("![](u1) sau đó $$a+b$$")).toEqual([
      { type: "image", value: "u1", alt: "" },
      { type: "text", value: " sau đó " },
      { type: "block", value: "a+b" },
    ]);
  });

  it("không đổi hành vi cũ khi văn bản không có ảnh", () => {
    expect(splitLatex("Giải $x = 1$ nhé.")).toEqual([
      { type: "text", value: "Giải " },
      { type: "inline", value: "x = 1" },
      { type: "text", value: " nhé." },
    ]);
  });

  it("nhiều ảnh liên tiếp đều được tách", () => {
    expect(splitLatex("![](a)![](b)")).toEqual([
      { type: "image", value: "a", alt: "" },
      { type: "image", value: "b", alt: "" },
    ]);
  });
});

describe("insertImageToken", () => {
  it("chèn vào đúng vị trí con trỏ, tự tách dòng cho ảnh đứng riêng", () => {
    expect(insertImageToken("Bước 1.Bước 2.", 7, "u1")).toBe("Bước 1.\n![](u1)\nBước 2.");
  });

  it("chèn vào ô đang trống thì không thêm dòng thừa", () => {
    expect(insertImageToken("", 0, "u1")).toBe("![](u1)");
  });

  it("chèn ở cuối chuỗi", () => {
    expect(insertImageToken("Xong.", 5, "u1")).toBe("Xong.\n![](u1)");
  });

  it("không thêm dòng trống thừa khi chỗ chèn vốn đã xuống dòng", () => {
    expect(insertImageToken("A\n", 2, "u1")).toBe("A\n![](u1)");
  });

  it("vị trí con trỏ vượt ngoài chuỗi thì kẹp về cuối, không làm hỏng nội dung", () => {
    expect(insertImageToken("AB", 999, "u1")).toBe("AB\n![](u1)");
    expect(insertImageToken("AB", -5, "u1")).toBe("![](u1)\nAB");
  });

  it("ảnh vừa chèn đọc lại được bằng splitLatex", () => {
    const text = insertImageToken("Lời giải:", 9, "https://a.b/c.png");
    expect(splitLatex(text)).toContainEqual({
      type: "image",
      value: "https://a.b/c.png",
      alt: "",
    });
  });
});
