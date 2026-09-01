/**
 * Trích xuất đề thi từ file PDF ngay trên trình duyệt (pdf.js), theo 2 nguồn
 * SONG SONG cho mỗi trang:
 *   1. VĂN BẢN THẬT của trang (pdf.js đọc trực tiếp lớp text nhúng sẵn trong
 *      PDF — chính xác tuyệt đối, không tốn AI). Khi Word/LibreOffice xuất
 *      file .docx ra PDF, phần chữ thường (đề bài, đáp án, lời giải) vẫn giữ
 *      nguyên là text thật; CHỈ RIÊNG công thức Toán gõ bằng MathType/Equation
 *      Editor (lưu dưới dạng đối tượng OLE nhị phân, không phải OMML) mới bị
 *      "in" lại thành hình ảnh khi xuất PDF — nên phần text lấy được ở đây đã
 *      chính xác 100%, không cần AI đọc lại.
 *   2. ẢNH của cả trang (render bằng canvas) — gửi kèm cho AI CHỈ để: (a) đọc
 *      các công thức Toán hiện ra dưới dạng hình khi xuất PDF và chuyển sang
 *      LaTeX, (b) nhận diện hình vẽ minh hoạ (đồ thị, bảng biến thiên...), và
 *      (c) xác định đáp án đúng dựa trên tín hiệu thị giác (tô màu, gạch
 *      chân, in đậm...) — những việc BẮT BUỘC phải nhìn ảnh mới làm được.
 *
 * Vì AI đã có sẵn văn bản chính xác làm "khung", nó không cần tự đọc lại toàn
 * bộ chữ tiếng Việt từ ảnh nữa — chỉ cần đối chiếu + bổ sung phần hình. Nhờ
 * vậy có thể giảm độ phân giải/chất lượng ảnh gửi đi (ảnh giờ chỉ để tham
 * khảo hình, không phải nguồn đọc chữ chính) mà vẫn chính xác hơn, đồng thời
 * nhẹ và nhanh hơn hẳn so với gửi ảnh trang độ phân giải cao để AI tự đọc hết.
 *
 * Đây là bước xử lý CHỈ diễn ra trên máy người dùng (không upload PDF lên đâu
 * khác ngoài gửi ảnh + văn bản trang cho Gemini để phân tích) — không cần
 * server riêng.
 */

// pdfjs-dist v6 chỉ có bản ESM (.mjs). Vite hỗ trợ import kèm hậu tố "?url"
// để lấy đường dẫn tới file worker mà không cần đóng gói riêng.
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { joinTextItems } from "./pdfTextLayout";
import { nowMs, type ImportBenchmarkRecorder } from "./importBenchmark";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface PdfPageImage {
  pageNumber: number;
  mimeType: string;
  dataBase64: string;
  /** Văn bản thật trích từ lớp text của trang PDF — xem giải thích ở đầu file. */
  pageText: string;
}

export interface RenderPdfOptions {
  /**
   * Hệ số phóng to khi render trang. Ảnh giờ chỉ dùng để AI xem hình/công
   * thức/tín hiệu đáp án (không phải nguồn đọc chữ chính — đã có văn bản
   * thật riêng), nên không cần độ phân giải cao như trước.
   */
  scale?: number;
  mimeType?: "image/png" | "image/jpeg";
  /** Chỉ áp dụng với image/jpeg. */
  quality?: number;
  /** Giới hạn số trang tối đa (an toàn — tránh 1 file quá dài làm tốn quá nhiều token AI ngoài ý muốn). */
  maxPages?: number;
  /**
   * Giới hạn chiều rộng ảnh xuất ra (px) — bất kể `scale` là bao nhiêu, ảnh
   * không vượt quá ngưỡng này, để tránh request gửi lên AI quá to khiến trình
   * duyệt chờ rất lâu ở bước phân tích.
   */
  maxWidthPx?: number;
}

/**
 * Render toàn bộ trang của 1 file PDF thành danh sách ảnh + văn bản thật, theo
 * đúng thứ tự trang.
 *
 * `benchmark` (PHASE 0, thêm 01/09/2026 — xem importBenchmark.ts): tham số
 * OPTIONAL, chỉ dùng để đo đạc hiệu năng khi Thầy Tường tự bật debug — không
 * truyền gì thì hàm chạy y hệt trước đây, không có rủi ro đổi hành vi.
 */
export async function renderPdfToImages(
  file: File,
  opts: RenderPdfOptions = {},
  benchmark?: ImportBenchmarkRecorder,
): Promise<PdfPageImage[]> {
  const {
    scale = 1.2,
    mimeType = "image/jpeg",
    quality = 0.7,
    maxPages = 60,
    maxWidthPx = 1100,
  } = opts;

  const pdfLoadStart = nowMs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  benchmark?.recordPdfLoad(nowMs() - pdfLoadStart);
  const pageCount = Math.min(pdf.numPages, maxPages);
  const images: PdfPageImage[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const naturalWidth = page.getViewport({ scale: 1 }).width;
    const effectiveScale = Math.min(scale, maxWidthPx / naturalWidth);
    const viewport = page.getViewport({ scale: effectiveScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Trình duyệt không hỗ trợ canvas để render PDF.");
    }
    // pdf.js v6 yêu cầu truyền cả canvas lẫn canvasContext.
    const renderStart = nowMs();
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const renderMs = nowMs() - renderStart;

    const textExtractStart = nowMs();
    const textContent = await page.getTextContent();
    const pageText = joinTextItems(textContent.items as TextItem[]);
    const textExtractMs = nowMs() - textExtractStart;

    benchmark?.recordPage({
      pageNumber,
      renderMs,
      textExtractMs,
      // ~bytes thật của ảnh sau khi giải mã base64 (mỗi 4 ký tự base64 ≈ 3 byte) — chỉ để so sánh tương đối giữa các lần đo, không cần chính xác tuyệt đối.
      imagePayloadBytes: Math.ceil((dataBase64.length * 3) / 4),
    });

    images.push({ pageNumber, mimeType, dataBase64, pageText });
  }

  return images;
}

export function totalPdfPagesExceeded(actualPages: number, maxPages: number): boolean {
  return actualPages > maxPages;
}
