/**
 * PHASE 0 — đo đạc hiệu năng pipeline import PDF, KHÔNG đổi hành vi production.
 * Xem `audit-pdf-import-engine-v2-vong2.md` (mục E/H trong project) — mọi số
 * liệu ở đây chỉ để Thầy Tường tự đo trên web thật (sandbox Claude không gọi
 * được Gemini — xem mục A.3 tài liệu đó), không phục vụ tính năng nào cho
 * giáo viên khác và không đổi bất kỳ hành vi nào giáo viên đang thấy.
 *
 * Toàn bộ hàm TÍNH TOÁN ở file này là hàm THUẦN (không phụ thuộc DOM/mạng) để
 * unit-test được, đúng quy ước đã có của dự án (xem chunk.ts, concurrency.ts).
 * `ImportBenchmarkRecorder` là lớp mỏng bọc ngoài, chỉ GOM dữ liệu trong lúc
 * pipeline chạy rồi giao lại cho các hàm thuần tính tổng hợp ở finish() —
 * không tự tính toán gì trong class, để phần tính toán vẫn test được độc lập.
 *
 * Mọi nơi nhận `ImportBenchmarkRecorder` (renderPdfToImages, parseExamFromImages,
 * parseExamFromPdfPages — xem pdfImport.ts/ai.ts) đều nhận nó qua tham số
 * OPTIONAL cuối cùng — không truyền gì thì pipeline chạy y hệt trước đây,
 * không có rủi ro đổi hành vi cho bản đang chạy.
 */

export type ThinkingLevel = "low" | "medium" | "high";

/**
 * Đọc biến môi trường VITE_GEMINI_THINKING_LEVEL — trả về null nếu không set
 * hoặc giá trị không hợp lệ, để KHÔNG gửi field `thinkingConfig` lên Gemini
 * (giữ đúng hành vi mặc định hiện tại — Google tự chọn mức mặc định) trừ khi
 * Thầy chủ động set để so sánh. Bối cảnh: `gemini-3.7-flash` là model có
 * "thinking mode", phát hiện thật trong phiên audit — 1 yêu cầu JSON 2 field
 * cực đơn giản đã tốn 154/183 token (84%) cho suy luận nội bộ
 * (`usageMetadata.thoughtsTokenCount`), khả năng cao chiếm phần lớn latency
 * 20-40s/đợt đã ghi nhận. Gemini 3 Flash KHÔNG hỗ trợ tắt hẳn thinking (khác
 * dòng 2.5 dùng `thinkingBudget=0`), chỉ hạ được xuống mức "low" qua
 * `thinkingConfig.thinkingLevel`. Hàm thuần, tách riêng để test không cần đọc
 * biến môi trường thật.
 */
export function resolveThinkingLevel(rawValue: string | undefined): ThinkingLevel | null {
  if (rawValue === "low" || rawValue === "medium" || rawValue === "high") return rawValue;
  return null;
}

export interface PageRenderMetric {
  pageNumber: number;
  renderMs: number;
  textExtractMs: number;
  imagePayloadBytes: number;
}

export interface GeminiCallMetric {
  /** Nhãn phân biệt lần gọi, vd "batch-1-attempt-1" hoặc "batch-1-fallback-1" — đặt ở nơi gọi (ai.ts), không tự sinh ở đây. */
  label: string;
  model: string;
  roundTripMs: number;
  ok: boolean;
  thinkingLevelRequested: ThinkingLevel | null;
  /** null khi lỗi trước khi có response (network/timeout/HTTP lỗi) — Google không trả usageMetadata trong trường hợp đó. */
  promptTokenCount: number | null;
  candidatesTokenCount: number | null;
  totalTokenCount: number | null;
  thoughtsTokenCount: number | null;
}

export interface ImportBenchmarkSummary {
  pageCount: number;
  totalImagePayloadBytes: number;
  /** pdfLoadMs + tổng renderMs + tổng textExtractMs — phần "không đụng AI" của pipeline. */
  totalPdfParsingMs: number;
  geminiCallCount: number;
  geminiCallCountOk: number;
  totalGeminiMs: number;
  totalJsonParseMs: number;
  totalPromptTokens: number;
  totalCandidatesTokens: number;
  totalThoughtsTokens: number;
  /**
   * % token thinking trên tổng token (prompt+candidates+thoughts), tính trên
   * các lần gọi THÀNH CÔNG có usageMetadata — null nếu chưa lần nào có dữ liệu
   * (mọi lần gọi đều lỗi, hoặc chưa gọi lần nào).
   */
  thoughtsTokenSharePercent: number | null;
}

export interface ImportBenchmarkRecord {
  fileName: string;
  pdfLoadMs: number;
  pages: PageRenderMetric[];
  geminiCalls: GeminiCallMetric[];
  jsonParseMsEntries: number[];
  totalImportMs: number;
  summary: ImportBenchmarkSummary;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Hàm thuần — tổng hợp số liệu render/text-extract/payload theo từng trang. Tách riêng để test độc lập với phần Gemini. */
export function summarizePages(pages: PageRenderMetric[]): {
  totalImagePayloadBytes: number;
  totalPageParsingMs: number;
} {
  return {
    totalImagePayloadBytes: sum(pages.map((p) => p.imagePayloadBytes)),
    totalPageParsingMs: sum(pages.map((p) => p.renderMs + p.textExtractMs)),
  };
}

/** Hàm thuần — tổng hợp số liệu các lần gọi Gemini (kể cả lần lỗi/retry/fallback). */
export function summarizeGeminiCalls(calls: GeminiCallMetric[]): {
  geminiCallCount: number;
  geminiCallCountOk: number;
  totalGeminiMs: number;
  totalPromptTokens: number;
  totalCandidatesTokens: number;
  totalThoughtsTokens: number;
  thoughtsTokenSharePercent: number | null;
} {
  const totalPromptTokens = sum(calls.map((c) => c.promptTokenCount ?? 0));
  const totalCandidatesTokens = sum(calls.map((c) => c.candidatesTokenCount ?? 0));
  const totalThoughtsTokens = sum(calls.map((c) => c.thoughtsTokenCount ?? 0));
  const totalKnownTokens = totalPromptTokens + totalCandidatesTokens + totalThoughtsTokens;
  return {
    geminiCallCount: calls.length,
    geminiCallCountOk: calls.filter((c) => c.ok).length,
    totalGeminiMs: sum(calls.map((c) => c.roundTripMs)),
    totalPromptTokens,
    totalCandidatesTokens,
    totalThoughtsTokens,
    thoughtsTokenSharePercent: totalKnownTokens > 0 ? (totalThoughtsTokens / totalKnownTokens) * 100 : null,
  };
}

/** Hàm thuần — ghép 2 hàm tổng hợp trên thành 1 summary đầy đủ. Đây là hàm ImportBenchmarkRecorder.finish() gọi, tách riêng để test không cần dựng cả class. */
export function buildImportBenchmarkSummary(
  pages: PageRenderMetric[],
  geminiCalls: GeminiCallMetric[],
  jsonParseMsEntries: number[],
  pdfLoadMs: number,
): ImportBenchmarkSummary {
  const pageSummary = summarizePages(pages);
  const geminiSummary = summarizeGeminiCalls(geminiCalls);
  return {
    pageCount: pages.length,
    totalImagePayloadBytes: pageSummary.totalImagePayloadBytes,
    totalPdfParsingMs: pdfLoadMs + pageSummary.totalPageParsingMs,
    geminiCallCount: geminiSummary.geminiCallCount,
    geminiCallCountOk: geminiSummary.geminiCallCountOk,
    totalGeminiMs: geminiSummary.totalGeminiMs,
    totalJsonParseMs: sum(jsonParseMsEntries),
    totalPromptTokens: geminiSummary.totalPromptTokens,
    totalCandidatesTokens: geminiSummary.totalCandidatesTokens,
    totalThoughtsTokens: geminiSummary.totalThoughtsTokens,
    thoughtsTokenSharePercent: geminiSummary.thoughtsTokenSharePercent,
  };
}

/** performance.now() khi có (trình duyệt), Date.now() khi không (Node/test) — tách riêng để không phải import cả class chỉ để lấy giờ. */
export function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * Lớp mỏng gom số liệu trong lúc pipeline import 1 file PDF chạy. Tạo 1
 * instance mới cho MỖI lần import (không tái sử dụng giữa các file), truyền
 * (optional) vào renderPdfToImages()/parseExamFromPdfPages(), cuối cùng gọi
 * finish() để lấy bản ghi đầy đủ kèm summary đã tính sẵn.
 */
export class ImportBenchmarkRecorder {
  private pdfLoadMsValue = 0;
  private pages: PageRenderMetric[] = [];
  private geminiCalls: GeminiCallMetric[] = [];
  private jsonParseMsEntries: number[] = [];
  private readonly startedAt = nowMs();

  recordPdfLoad(ms: number): void {
    this.pdfLoadMsValue = ms;
  }

  recordPage(metric: PageRenderMetric): void {
    this.pages.push(metric);
  }

  recordGeminiCall(metric: GeminiCallMetric): void {
    this.geminiCalls.push(metric);
  }

  recordJsonParse(ms: number): void {
    this.jsonParseMsEntries.push(ms);
  }

  finish(fileName: string): ImportBenchmarkRecord {
    return {
      fileName,
      pdfLoadMs: this.pdfLoadMsValue,
      pages: this.pages,
      geminiCalls: this.geminiCalls,
      jsonParseMsEntries: this.jsonParseMsEntries,
      totalImportMs: nowMs() - this.startedAt,
      summary: buildImportBenchmarkSummary(this.pages, this.geminiCalls, this.jsonParseMsEntries, this.pdfLoadMsValue),
    };
  }
}

/**
 * true khi nên bật hiển thị/tải benchmark cho phiên hiện tại — chế độ dev
 * (`npm run dev`) LUÔN bật, bản deploy thật (GitHub Pages) chỉ bật khi truy
 * cập kèm `?debug=1` trên URL (để Thầy tự bật khi cần đo trên bản thật, không
 * hiện cho giáo viên khác dùng chung site). Hàm thuần theo nghĩa nhận thẳng
 * "search string" thay vì tự đọc window.location — để test được mà không cần
 * DOM giả lập.
 */
export function isBenchmarkEnabled(isDevMode: boolean, locationSearch: string): boolean {
  if (isDevMode) return true;
  return new URLSearchParams(locationSearch).get("debug") === "1";
}
