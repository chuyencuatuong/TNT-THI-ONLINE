import { useMemo } from "react";
import katex from "katex";

/**
 * Hiển thị văn bản có chứa công thức Toán viết bằng LaTeX.
 * Quy ước nhập liệu: công thức trong dòng đặt giữa cặp $...$,
 * công thức khối (canh giữa, cỡ lớn) đặt giữa cặp $$...$$.
 * Ví dụ: "Giải phương trình $x^2 - 3x + 2 = 0$ trên tập số thực."
 */
export function MathText({ text }: { text: string }) {
  const parts = useMemo(() => splitLatex(text ?? ""), [text]);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.type === "text") return <span key={i}>{part.value}</span>;
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
  | { type: "inline" | "block"; value: string };

function splitLatex(input: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = input;

  const blockRe = /\$\$([\s\S]+?)\$\$/;
  const inlineRe = /\$([^$\n]+?)\$/;

  while (remaining.length > 0) {
    const blockMatch = remaining.match(blockRe);
    const inlineMatch = remaining.match(inlineRe);

    const blockIndex = blockMatch?.index ?? Infinity;
    const inlineIndex = inlineMatch?.index ?? Infinity;

    if (blockMatch && blockIndex <= inlineIndex) {
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
