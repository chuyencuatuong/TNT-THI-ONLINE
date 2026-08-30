/**
 * Ghép các mục text rời rạc mà pdf.js trả về (mỗi mục kèm toạ độ) thành 1
 * đoạn văn bản đọc được, giữ đúng thứ tự trên-xuống/trái-sang-phải. Tách
 * riêng thành hàm THUẦN (không phụ thuộc pdf.js) để unit-test được mà không
 * cần import pdfjs-dist (thư viện đó cần môi trường trình duyệt thật — xem
 * pdfImport.ts).
 */

export interface PositionedTextItem {
  str: string;
  /** Ma trận biến đổi pdf.js trả về: [a, b, c, d, e, f] — chỉ cần e (x) và f (y). */
  transform: number[];
  width: number;
  /**
   * pdf.js tự đánh dấu true khi mục này kết thúc 1 dòng (dựa trên phân tích
   * bố cục nội bộ của thư viện — đáng tin hơn hẳn so với tự đoán qua toạ độ
   * y, vì pdf.js còn xét cả hướng viết, cột, ngắt dòng do PDF quy định...).
   * Không phải mọi trình tạo PDF đều set field này, nên vẫn giữ thêm heuristic
   * theo toạ độ y làm lưới an toàn thứ 2 bên dưới.
   */
  hasEOL?: boolean;
}

/** Gộp các mục text (đã có toạ độ) của 1 trang thành đoạn văn bản đọc được. */
export function joinTextItems(items: PositionedTextItem[]): string {
  // Ưu tiên tín hiệu hasEOL do chính pdf.js xác định (đáng tin nhất). Đồng
  // thời vẫn xét thêm toạ độ y làm lưới an toàn thứ 2, phòng trường hợp
  // hasEOL không được set (một số PDF không có thông tin này).
  let out = "";
  let prevY: number | null = null;
  let prevEndX: number | null = null;
  const LINE_BREAK_TOLERANCE = 4; // px lệch y nhỏ hơn mức này vẫn coi là cùng dòng

  for (const item of items) {
    const text = item.str;
    const y = item.transform[5];
    const x = item.transform[4];

    if (!text) {
      // Mục rỗng (thường do pdf.js chèn tại vị trí ảnh/khoảng trống) — coi
      // như 1 khoảng trắng để không dính chữ liền nhau ở 2 phía.
      if (out && !out.endsWith(" ") && !out.endsWith("\n")) out += " ";
    } else {
      const yJumped = prevY !== null && Math.abs(y - prevY) > LINE_BREAK_TOLERANCE;
      if (yJumped) {
        out += "\n";
      } else if (
        prevEndX !== null &&
        out &&
        !out.endsWith(" ") &&
        !out.endsWith("\n") &&
        !text.startsWith(" ")
      ) {
        out += " ";
      }
      out += text;
    }

    if (item.hasEOL && !out.endsWith("\n")) out += "\n";
    prevY = y;
    prevEndX = x + item.width;
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
