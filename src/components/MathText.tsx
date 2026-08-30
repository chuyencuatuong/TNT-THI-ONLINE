import { useMemo } from "react";
import katex from "katex";

/**
 * Hiển thị văn bản có chứa công thức Toán viết bằng LaTeX.
 * Quy ước nhập liệu: công thức trong dòng đặt giữa cặp $...$,
 * công thức khối (canh giữa, cỡ lớn) đặt giữa cặp $$...$$.
 * Ví dụ: "Giải phương trình $x^2 - 3x + 2 = 0$ trên tập số thực."
 *
 * THÊM 30/08/2026 — ẢNH CHÈN GIỮA VĂN BẢN: ngoài công thức, văn bản còn có
 * thể chứa ảnh viết theo cú pháp Markdown `![](địa-chỉ-ảnh)`. Dùng cho ô nhập
 * lời giải thủ công (xem SolutionField.tsx): giáo viên giải xong trên giấy/
 * bảng, chụp màn hình rồi Ctrl+V thẳng vào giữa lời giải, ảnh được chèn ngay
 * đúng vị trí con trỏ. Làm theo cách này thì KHÔNG cần thêm cột mới trong
 * CSDL — ảnh nằm ngay trong chính chuỗi solution_latex đã có — và mọi nơi
 * đang hiển thị lời giải bằng MathText (màn hình xem lại của học sinh, ô xem
 * trước của giáo viên...) tự động hiện được ảnh mà không phải sửa gì thêm.
 */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(() => splitLatex(text ?? ""), [text]);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
        if (part.type === "image") {
          return <img key={i} className="mathtext-image" src={part.value} alt={part.alt || "Hình trong lời giải"} />;
        }
        try {
          const html = katex.renderToString(part.value, {
            throwOnError: false,
            displayMode: part.type === "block",
          });
          // Công thức khối (displayMode) có thể rất dài (ma trận, phân số
          // nhiều tầng...) — bọc trong span cuộn ngang riêng (.math-scroll,
          // xem styles.css) để tránh đẩy tràn cả trang trên điện thoại hẹp.
          // Công thức trong dòng (inline) giữ nguyên, không bọc, để không
          // phá vỡ luồng văn bản xung quanh.
          return (
            <span
              key={i}
              className={part.type === "block" ? "math-scroll" : undefined}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <span key={i}>{part.value}</span>;
        }
      })}
    </span>
  );
}

type Segment =
  | { type: "text"; value: string }
  | { type: "inline" | "block"; value: string }
  | { type: "image"; value: string; alt: string };

/**
 * Cú pháp ảnh: `![chú thích](địa-chỉ)` — giống Markdown để ai nhìn cũng đoán
 * ra. Địa chỉ không được chứa khoảng trắng hay dấu ")" (ảnh do hệ thống tự
 * tải lên nên địa chỉ luôn thoả điều kiện này).
 */
const IMAGE_RE = /!\[([^\]\n]*)\]\(([^)\s]+)\)/;

export function splitLatex(input: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = input;

  const blockRe = /\$\$([\s\S]+?)\$\$/;
  const inlineRe = /\$([^$\n]+?)\$/;

  while (remaining.length > 0) {
    const blockMatch = remaining.match(blockRe);
    const inlineMatch = remaining.match(inlineRe);
    const imageMatch = remaining.match(IMAGE_RE);

    const blockIndex = blockMatch?.index ?? Infinity;
    const inlineIndex = inlineMatch?.index ?? Infinity;
    const imageIndex = imageMatch?.index ?? Infinity;

    // Lấy mẫu nào xuất hiện SỚM NHẤT trong phần còn lại, để 3 loại (ảnh,
    // công thức khối, công thức trong dòng) không giành nhau sai thứ tự.
    if (imageMatch && imageIndex <= blockIndex && imageIndex <= inlineIndex) {
      if (imageIndex > 0) segments.push({ type: "text", value: remaining.slice(0, imageIndex) });
      segments.push({ type: "image", value: imageMatch[2], alt: imageMatch[1] });
      remaining = remaining.slice(imageIndex + imageMatch[0].length);
    } else if (blockMatch && blockIndex <= inlineIndex) {
      if (blockIndex > 0) segments.push({ type: "text", value: remaining.slice(0, blockIndex) });
      segments.push({ type: "block", value: blockMatch[1] });
      remaining = remaining.slice(blockIndex + blockMatch[0].length);
    } else if (inlineMatch) {
      if (inlineIndex > 0) segments.push({ type: "text", value: remaining.slice(0, inlineIndex) });
      segments.push({ type: "inline", value: inlineMatch[1] });
      remaining = remaining.slice(inlineIndex + inlineMatch[0].length);
    } else {
      segments.push({ type: "text", value: remaining });
      remaining = "";
    }
  }

  return segments;
}

/** Chèn 1 ảnh (theo cú pháp ở IMAGE_RE) vào giữa chuỗi tại vị trí con trỏ. */
export function insertImageToken(text: string, cursorIndex: number, url: string): string {
  const at = Math.max(0, Math.min(cursorIndex, text.length));
  const before = text.slice(0, at);
  const after = text.slice(at);
  // Tự thêm xuống dòng quanh ảnh nếu đang dính vào chữ, để ảnh nằm riêng 1
  // dòng thay vì chen ngang giữa câu.
  const prefix = before && !before.endsWith("\n") ? "\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n" : "";
  return `${before}${prefix}![](${url})${suffix}${after}`;
}
