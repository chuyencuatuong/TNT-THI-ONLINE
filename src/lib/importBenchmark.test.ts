import { describe, expect, it } from "vitest";
import {
  buildImportBenchmarkSummary,
  ImportBenchmarkRecorder,
  isBenchmarkEnabled,
  resolveThinkingLevel,
  summarizeGeminiCalls,
  summarizePages,
  type GeminiCallMetric,
  type PageRenderMetric,
} from "./importBenchmark";

describe("resolveThinkingLevel", () => {
  it("nhận đúng 3 giá trị hợp lệ", () => {
    expect(resolveThinkingLevel("low")).toBe("low");
    expect(resolveThinkingLevel("medium")).toBe("medium");
    expect(resolveThinkingLevel("high")).toBe("high");
  });

  it("undefined (không set biến môi trường) → null, không ép field lên Gemini", () => {
    expect(resolveThinkingLevel(undefined)).toBeNull();
  });

  it("giá trị lạ/gõ sai → null thay vì crash hoặc gửi rác lên API", () => {
    expect(resolveThinkingLevel("LOW")).toBeNull();
    expect(resolveThinkingLevel("cao")).toBeNull();
    expect(resolveThinkingLevel("")).toBeNull();
  });
});

describe("summarizePages", () => {
  it("cộng dồn payload và thời gian render+extract của từng trang", () => {
    const pages: PageRenderMetric[] = [
      { pageNumber: 1, renderMs: 100, textExtractMs: 10, imagePayloadBytes: 50_000 },
      { pageNumber: 2, renderMs: 120, textExtractMs: 15, imagePayloadBytes: 60_000 },
    ];
    expect(summarizePages(pages)).toEqual({
      totalImagePayloadBytes: 110_000,
      totalPageParsingMs: 245,
    });
  });

  it("mảng rỗng → tổng = 0, không lỗi chia cho 0", () => {
    expect(summarizePages([])).toEqual({ totalImagePayloadBytes: 0, totalPageParsingMs: 0 });
  });
});

describe("summarizeGeminiCalls", () => {
  it("tính đúng thoughtsTokenSharePercent khi có dữ liệu token", () => {
    const calls: GeminiCallMetric[] = [
      {
        label: "batch-1-attempt-1",
        model: "gemini-3.7-flash",
        roundTripMs: 25_000,
        ok: true,
        thinkingLevelRequested: null,
        promptTokenCount: 20,
        candidatesTokenCount: 9,
        thoughtsTokenCount: 154,
        totalTokenCount: 183,
      },
    ];
    const result = summarizeGeminiCalls(calls);
    expect(result.geminiCallCount).toBe(1);
    expect(result.geminiCallCountOk).toBe(1);
    expect(result.totalGeminiMs).toBe(25_000);
    expect(result.totalPromptTokens).toBe(20);
    expect(result.totalCandidatesTokens).toBe(9);
    expect(result.totalThoughtsTokens).toBe(154);
    // 154 / (20+9+154) = 84.15...%
    expect(result.thoughtsTokenSharePercent).toBeCloseTo(84.15, 1);
  });

  it("lần gọi lỗi (usage = null) không làm hỏng tổng, chỉ không đóng góp token", () => {
    const calls: GeminiCallMetric[] = [
      {
        label: "batch-1-attempt-1",
        model: "gemini-3.7-flash",
        roundTripMs: 90_000,
        ok: false,
        thinkingLevelRequested: null,
        promptTokenCount: null,
        candidatesTokenCount: null,
        thoughtsTokenCount: null,
        totalTokenCount: null,
      },
      {
        label: "batch-1-attempt-2",
        model: "gemini-3.7-flash",
        roundTripMs: 22_000,
        ok: true,
        thinkingLevelRequested: "low",
        promptTokenCount: 500,
        candidatesTokenCount: 300,
        thoughtsTokenCount: 50,
        totalTokenCount: 850,
      },
    ];
    const result = summarizeGeminiCalls(calls);
    expect(result.geminiCallCount).toBe(2);
    expect(result.geminiCallCountOk).toBe(1);
    expect(result.totalGeminiMs).toBe(112_000);
    expect(result.totalPromptTokens).toBe(500);
    expect(result.thoughtsTokenSharePercent).toBeCloseTo((50 / 850) * 100, 5);
  });

  it("chưa có lần gọi nào hoặc mọi lần đều lỗi → thoughtsTokenSharePercent = null (không phải 0 hay NaN)", () => {
    expect(summarizeGeminiCalls([]).thoughtsTokenSharePercent).toBeNull();
    const allFailed: GeminiCallMetric[] = [
      {
        label: "batch-1-attempt-1",
        model: "gemini-3.7-flash",
        roundTripMs: 90_000,
        ok: false,
        thinkingLevelRequested: null,
        promptTokenCount: null,
        candidatesTokenCount: null,
        thoughtsTokenCount: null,
        totalTokenCount: null,
      },
    ];
    expect(summarizeGeminiCalls(allFailed).thoughtsTokenSharePercent).toBeNull();
  });
});

describe("buildImportBenchmarkSummary", () => {
  it("ghép đúng tổng PDF-parsing (pdfLoadMs + render + extract) tách biệt với tổng Gemini/JSON-parse", () => {
    const pages: PageRenderMetric[] = [{ pageNumber: 1, renderMs: 200, textExtractMs: 20, imagePayloadBytes: 40_000 }];
    const calls: GeminiCallMetric[] = [
      {
        label: "batch-1-attempt-1",
        model: "gemini-3.7-flash",
        roundTripMs: 30_000,
        ok: true,
        thinkingLevelRequested: null,
        promptTokenCount: 1000,
        candidatesTokenCount: 500,
        thoughtsTokenCount: 200,
        totalTokenCount: 1700,
      },
    ];
    const summary = buildImportBenchmarkSummary(pages, calls, [3, 2], 150);
    expect(summary.totalPdfParsingMs).toBe(150 + 200 + 20); // 370
    expect(summary.totalGeminiMs).toBe(30_000);
    expect(summary.totalJsonParseMs).toBe(5);
    expect(summary.pageCount).toBe(1);
  });
});

describe("ImportBenchmarkRecorder", () => {
  it("gom số liệu qua các lần record() rồi finish() trả về bản ghi đầy đủ có summary khớp", () => {
    const recorder = new ImportBenchmarkRecorder();
    recorder.recordPdfLoad(80);
    recorder.recordPage({ pageNumber: 1, renderMs: 100, textExtractMs: 10, imagePayloadBytes: 30_000 });
    recorder.recordPage({ pageNumber: 2, renderMs: 110, textExtractMs: 12, imagePayloadBytes: 32_000 });
    recorder.recordGeminiCall({
      label: "batch-1-attempt-1",
      model: "gemini-3.7-flash",
      roundTripMs: 28_000,
      ok: true,
      thinkingLevelRequested: null,
      promptTokenCount: 2000,
      candidatesTokenCount: 900,
      thoughtsTokenCount: 300,
      totalTokenCount: 3200,
    });
    recorder.recordJsonParse(4);

    const record = recorder.finish("de-thi-mau.pdf");

    expect(record.fileName).toBe("de-thi-mau.pdf");
    expect(record.pdfLoadMs).toBe(80);
    expect(record.pages).toHaveLength(2);
    expect(record.geminiCalls).toHaveLength(1);
    expect(record.summary.pageCount).toBe(2);
    expect(record.summary.totalImagePayloadBytes).toBe(62_000);
    expect(record.summary.geminiCallCountOk).toBe(1);
    expect(record.summary.totalJsonParseMs).toBe(4);
    // totalImportMs đo bằng đồng hồ thật (nowMs) — chỉ cần chắc chắn là số không âm, không so khớp giá trị cụ thể (chạy nhanh trong test, không đáng tin để assert bằng)
    expect(record.totalImportMs).toBeGreaterThanOrEqual(0);
  });

  it("structureConfident mặc định null khi không gọi recordStructureConfidence (vd luồng nhập .docx không dò cấu trúc)", () => {
    const recorder = new ImportBenchmarkRecorder();
    expect(recorder.finish("de-thi.docx").structureConfident).toBeNull();
  });

  it("structureConfident lấy đúng giá trị lần gọi recordStructureConfidence gần nhất (01/09/2026, việc #1-3 kế hoạch cải tiến)", () => {
    const recorderTrue = new ImportBenchmarkRecorder();
    recorderTrue.recordStructureConfidence(true);
    expect(recorderTrue.finish("de-thi.pdf").structureConfident).toBe(true);

    const recorderFalse = new ImportBenchmarkRecorder();
    recorderFalse.recordStructureConfidence(false);
    expect(recorderFalse.finish("de-thi.pdf").structureConfident).toBe(false);
  });
});

describe("isBenchmarkEnabled", () => {
  it("luôn bật ở chế độ dev, bất kể query string", () => {
    expect(isBenchmarkEnabled(true, "")).toBe(true);
    expect(isBenchmarkEnabled(true, "?foo=bar")).toBe(true);
  });

  it("bản deploy thật (không dev) chỉ bật khi có ?debug=1", () => {
    expect(isBenchmarkEnabled(false, "")).toBe(false);
    expect(isBenchmarkEnabled(false, "?debug=0")).toBe(false);
    expect(isBenchmarkEnabled(false, "?debug=1")).toBe(true);
    expect(isBenchmarkEnabled(false, "?foo=bar&debug=1")).toBe(true);
  });
});
