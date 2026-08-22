/**
 * Trích xuất đề thi từ file PDF bằng cách render từng trang thành ẢNH ngay
 * trên trình duyệt (pdf.js), rồi gửi ảnh cho AI đọc trực tiếp (multimodal).
 *
 * TẠI SAO PDF thay vì đọc thẳng file .docx: công thức gõ bằng MathType/
 * Equation Editor 3.0 trong .docx được lưu dưới dạng đối tượng OLE nhị phân —
 * không phải OMML — nên KHÔNG thư viện JS nào chạy trong trình duyệt đọc được
 * (mammoth.js bỏ qua âm thầm, xem wordImport.ts). Khi xuất file .docx đó ra
 * PDF, công thức được vẽ lại đúng y hình ảnh cuối cùng bất kể định dạng lưu
 * trữ gốc — nên PDF + AI đọc ảnh né được hoàn toàn giới hạn kỹ thuật này.
 *
 * Đây là bước xử lý CHỈ diễn ra trên máy người dùng (không upload PDF lên đâu
 * khác ngoài gửi ảnh trang cho Gemini để phân tích) — không cần server riêng.
 */

// pdfjs-dist v6 chỉ có bản ESM (.mjs). Vite hỗ trợ import kèm hậu tố "?url"
// để lấy đường dẫn tới file worker mà không cần đóng gói riêng.
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface PdfPageImage {
  pageNumber: number;
  mimeType: string;
  dataBase64: string;
}

export interface RenderPdfOptions {
  /** Hệ số phóng to khi render trang — cao hơn giúp AI đọc rõ chữ nhỏ/công thức, nhưng ảnh nặng hơn. */
  scale?: number;
  mimeType?: "image/png" | "image/jpeg";
  /** Chỉ áp dụng với image/jpeg. */
  quality?: number;
  /** Giới hạn số trang tối đa (an toàn — tránh 1 file quá dài làm tốn quá nhiều token AI ngoài ý muốn). */
  maxPages?: number;
  /**
   * Giới hạn chiều rộng ảnh xuất ra (px) — bất kể `scale` là bao nhiêu, ảnh
   * không vượt quá ngưỡng này. Đề dài (10+ trang) mà ảnh quá nặng làm request
   * gửi lên AI rất to, dễ khiến trình duyệt "đứng hình" rất lâu ở bước phân
   * tích mà không rõ đang chờ gì hay đã treo hẳn. Chữ/công thức vẫn đọc rõ ở
   * mức 1400-1600px chiều rộng cho khổ A4.
   */
  maxWidthPx?: number;
}

/** Render toàn bộ trang của 1 file PDF thành danh sách ảnh, theo đúng thứ tự trang. */
export async function renderPdfToImages(
  file: File,
  opts: RenderPdfOptions = {},
): Promise<PdfPageImage[]> {
  const {
    scale = 1.6,
    mimeType = "image/jpeg",
    quality = 0.82,
    maxPages = 60,
    maxWidthPx = 1500,
  } = opts;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const dataUrl = canvas.toDataURL(mimeType, quality);
    const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    images.push({ pageNumber, mimeType, dataBase64 });
  }

  return images;
}

export function totalPdfPagesExceeded(actualPages: number, maxPages: number): boolean {
  return actualPages > maxPages;
}
