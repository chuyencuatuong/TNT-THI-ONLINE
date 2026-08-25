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
 * MẸO (25/08/2026, đã kiểm chứng thực tế): nếu công thức được gõ bằng
 * MathType rồi dùng chức năng "Toggle TeX" (Alt+\) để chuyển thành mã LaTeX
 * dạng CHỮ THUẦN ngay trong Word trước khi lưu, mammoth.js đọc được bình
 * thường như văn bản — không còn bị bỏ sót nữa. Đánh đổi: tài liệu lúc đó
 * hiện mã LaTeX thô (vd `\frac{1}{2}`) thay vì công thức đã đánh đẹp, nên chỉ
 * nên dùng cho 1 bản sao riêng để tải lên hệ thống, không dùng bản đó để in/
 * gửi học sinh.
 *
 * THÊM 25/08/2026 (lỗi thật gặp phải): hình ảnh/bản vẽ nhúng vào Word dưới
 * dạng đối tượng OLE (thường gặp khi dán từ Visio, Excel, hoặc "Paste Special
 * > Enhanced Metafile") thường có ảnh xem trước ở định dạng EMF/WMF (Windows
 * Metafile) — đây là 1 trong 2 nguyên nhân đã gặp gây lỗi 400 "Request
 * contains an invalid argument" TRÊN CẢ 2 MODEL AI (Gemini chỉ chấp nhận
 * PNG/JPEG/WEBP/HEIC/HEIF, không hiểu EMF/WMF, và trả lỗi luôn cho CẢ YÊU CẦU
 * chứ không chỉ bỏ qua đúng tấm ảnh đó) — làm hỏng toàn bộ lượt phân tích dù
 * phần văn bản/công thức khác hoàn toàn đọc tốt. GHI CHÚ: đây KHÔNG liên quan
 * gì đến MathType/Toggle TeX — gặp cả ở ảnh minh hoạ thường (bảng xét dấu, đồ
 * thị) không phải công thức. Xử lý: lọc bỏ ảnh có định dạng Gemini không đọc
 * được TRƯỚC khi gửi (xem SUPPORTED_IMAGE_MIME_TYPES), thay bằng 1 dòng ghi
 * chú để giáo viên biết mà tự dán lại thủ công — giống hệt cách đang xử lý
 * ảnh minh hoạ ở đường PDF, thay vì để cả lượt phân tích chết đứng vì 1 ảnh.
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
  /** Số ảnh bị BỎ QUA (không gửi cho AI) vì định dạng Gemini không đọc được — xem SUPPORTED_IMAGE_MIME_TYPES. */
  unsupportedImageCount: number;
}

/**
 * Các định dạng ảnh Gemini API chấp nhận qua inlineData (theo tài liệu
 * chính thức). Ảnh nhúng trong .docx ở định dạng khác — phổ biến nhất là
 * EMF/WMF (Windows Metafile, hay gặp khi nhúng OLE từ Visio/Excel, hoặc dán
 * "Enhanced Metafile") — phải lọc bỏ trước khi gửi, nếu không CẢ lượt gọi AI
 * sẽ bị lỗi 400 "Request contains an invalid argument" (đã gặp thật, xem ghi
 * chú ở đầu file), không chỉ riêng ảnh đó.
 */
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export async function extractDocx(file: File): Promise<ExtractedDocument> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return extractFromHtml(result.value);
}

/** Tách phần logic xử lý HTML ra hàm thuần riêng để có thể unit-test không cần file .docx thật. */
export function extractFromHtml(html: string): ExtractedDocument {
  const images: ExtractedImage[] = [];
  let counter = 0;
  let unsupportedImageCount = 0;

  let working = html.replace(
    /<img[^>]*src="data:([^;]+);base64,([^"]+)"[^>]*>/g,
    (_match, mimeType: string, dataBase64: string) => {
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())) {
        unsupportedImageCount++;
        // KHÔNG đưa vào images[] (không gửi cho AI) — chỉ để lại 1 ghi chú
        // trong văn bản, giống quy ước "(xem hình)" AI tự thêm cho ảnh cần
        // dán tay, để giáo viên biết đúng vị trí cần bổ sung ở bước xem trước.
        return ` (có hình ảnh định dạng "${mimeType}" không đọc tự động được — cần dán tay lại bằng Ctrl+V ở bước xem trước) `;
      }
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

  return { plainText: working, images, unsupportedImageCount };
}
