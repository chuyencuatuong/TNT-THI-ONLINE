/**
 * Trích xuất nội dung từ file đề thi định dạng .docx ngay trên trình duyệt
 * (dùng mammoth.js), chuẩn bị dữ liệu để gửi cho AI phân tích cấu trúc đề.
 *
 * GIỚI HẠN CẦN BIẾT: mammoth.js đọc được văn bản, in đậm/in nghiêng, bảng, và
 * hình ảnh nhúng trong file .docx — nhưng KHÔNG đọc được công thức gõ bằng
 * công cụ "Equation" / MathType có sẵn của Word (định dạng OMML), thư viện này
 * sẽ bỏ qua các công thức đó một cách âm thầm (không báo lỗi). Nếu đề của bạn
 * dùng Equation Editor để gõ công thức, các câu có công thức sẽ bị thiếu phần
 * công thức khi trích xuất — bạn sẽ thấy rõ điều này ở màn hình xem trước và
 * cần gõ tay lại bằng LaTeX cho câu đó. Công thức được CHỤP/DÁN dưới dạng HÌNH
 * ẢNH thì trích xuất tốt hơn nhiều, vì AI có thể "đọc" hình ảnh trực tiếp.
 */

import * as mammoth from "mammoth";

export interface ExtractedImage {
  placeholder: string;
  mimeType: string;
  dataBase64: string;
}

export interface ExtractedDocument {
  /** Văn bản thuần, in đậm được giữ lại dưới dạng **...** để AI nhận biết đáp án được đánh dấu */
  plainText: string;
  images: ExtractedImage[];
}

export async function extractDocx(file: File): Promise<ExtractedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return extractFromHtml(result.value);
}

/** Tách phần logic xử lý HTML ra hàm thuần riêng để có thể unit-test không cần file .docx thật. */
export function extractFromHtml(html: string): ExtractedDocument {
  const images: ExtractedImage[] = [];
  let counter = 0;

  let working = html.replace(
    /<img[^>]*src="data:([^;]+);base64,([^"]+)"[^>]*>/g,
    (_match, mimeType: string, dataBase64: string) => {
      counter++;
      const placeholder = `[HINH_${counter}]`;
      images.push({ placeholder, mimeType, dataBase64 });
      return placeholder;
    },
  );

  // Giữ lại tín hiệu in đậm/in nghiêng (thường dùng để đánh dấu đáp án đúng)
  // dưới dạng ký hiệu markdown đơn giản, trước khi bóc hết thẻ HTML còn lại.
  working = working
    .replace(/<\/(strong|b)>/gi, "**")
    .replace(/<(strong|b)[^>]*>/gi, "**")
    .replace(/<\/(em|i)>/gi, "*")
    .replace(/<(em|i)[^>]*>/gi, "*")
    .replace(/<\/(p|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { plainText: working, images };
}
