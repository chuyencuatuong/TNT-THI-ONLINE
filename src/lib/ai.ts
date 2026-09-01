/**
 * Tích hợp AI (Gemini) — gọi thẳng từ trình duyệt bằng free tier.
 * Hai việc AI hỗ trợ, đúng như yêu cầu ban đầu:
 *  1) Gợi ý gán dạng bài khi giáo viên nhập câu hỏi mới (giáo viên luôn là người
 *     duyệt/xác nhận cuối cùng — AI không tự ý ghi đè ngân hàng câu hỏi).
 *  2) Tổng hợp nhận xét bằng lời cho báo cáo định kỳ, dựa trên số liệu đã tính sẵn
 *     (AI không tự tính điểm, chỉ diễn giải số liệu thành lời văn).
 */

import type { Lesson, Topic } from "./types";
import type { ExtractedImage } from "./wordImport";
import { chunkArray } from "./chunk";
import { mapWithConcurrency } from "./concurrency";
import {
  nowMs,
  resolveThinkingLevel,
  type GeminiCallMetric,
  type ImportBenchmarkRecorder,
  type ThinkingLevel,
} from "./importBenchmark";
// THÊM 01/09/2026 (Giai đoạn 1a — sau khi nghiên cứu Azota): bộ khung dò cấu
// trúc đề (Phần/Câu/nhãn đáp án) THUẦN QUY TẮC, không gọi AI — xem lý do đầy
// đủ ở đầu file examGrammar.ts. Chỉ dùng để RÚT GỌN việc AI phải làm (khỏi
// phải tự tìm ranh giới câu), KHÔNG thay AI đọc nội dung/công thức — nếu dò
// không chắc chắn (structureConfident = false) thì bỏ qua hoàn toàn, AI chạy
// y hệt như trước đây.
import { buildStructureScaffold, detectExamStructure, type DetectedQuestion, type StructurePage } from "./examGrammar";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;
// Cho phép ghi đè bằng biến môi trường VITE_GEMINI_MODEL mà không cần sửa code
// — hữu ích vì tên model Gemini đổi khá thường xuyên (bản mặc định bên dưới
// chỉ chính xác tại thời điểm viết, nên kiểm tra lại tên model khả dụng cho
// API key của bạn tại Google AI Studio nếu gặp lỗi 404 khi gọi AI).
// ĐỔI 24/08/2026: từng dùng "gemini-3.7-flash" nhưng gói miễn phí model này chỉ
// cho 20 lượt gọi/NGÀY (đã gặp lỗi 429 RESOURCE_EXHAUSTED thật khi thử — xem
// quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier"). Đổi sang
// "gemini-2.5-flash" lúc đó vì ổn định hơn.
// ĐỔI TIẾP 25/08/2026: "gemini-2.5-flash" bị Google NGƯNG cấp cho API key mới
// (lỗi 404 thật khi gọi: "model gemini-2.5-flash is no longer available to
// new users"). Đổi sang "gemini-3.6-flash" — đúng model Google khuyến nghị
// thay thế trong chính thông báo lỗi đó.
// ĐỔI TIẾP LẠI 25/08/2026: quay về "gemini-3.7-flash" theo quyết định của
// Thầy — 20 lượt gọi/ngày (free tier) là đủ dùng cho nhu cầu thực tế, không
// cần đổi model chỉ để né hạn mức. Nếu sau này thấy thiếu lượt (lỗi 429
// RESOURCE_EXHAUSTED), có 2 hướng: (a) vào aistudio.google.com/rate-limit xem
// hạn mức/giá nâng cấp thật, hoặc (b) đổi tạm qua biến môi trường
// VITE_GEMINI_MODEL sang model khác (vd. "gemini-3.6-flash") mà không cần
// sửa code.
const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || "gemini-3.7-flash";
// THÊM 25/08/2026: ngay sau khi đổi lại sang "gemini-3.7-flash" (theo quyết
// định của Thầy ở trên), gặp thật lỗi 503 UNAVAILABLE ("This model is
// currently experiencing high demand") — khác hẳn 2 lỗi trước đó (404 model
// ngưng cấp, 429 hết hạn mức/ngày), đây là Google đang QUÁ TẢI TẠM THỜI cho
// riêng model này. "3.7-flash" là model định vị cao cấp hơn (lập trình/agentic
// phức tạp) nên nhiều khả năng bị giới hạn công suất chặt hơn, dễ quá tải vào
// giờ cao điểm hơn "3.6-flash" (định vị tác vụ "hằng ngày", đã dùng ổn định
// lúc trước). Thay vì bắt giáo viên chờ rồi vẫn nhận lỗi, hoặc phải tự đổi lại
// model, thêm cơ chế DỰ PHÒNG: hết đợt thử lại ở model chính mà vẫn lỗi do quá
// tải/hết hạn mức, tự động chuyển sang model dự phòng này trước khi báo lỗi
// hẳn — vừa giữ đúng lựa chọn 3.7-flash của Thầy (ưu tiên hạn mức 20 lượt/ngày
// cao hơn), vừa không bị "đứng hình" khi Google quá tải.
const GEMINI_FALLBACK_MODEL =
  (import.meta.env.VITE_GEMINI_FALLBACK_MODEL as string | undefined) ||
  "gemini-3.6-flash";

/**
 * PHASE 0 (thêm 01/09/2026) — biến môi trường TUỲ CHỌN để so sánh latency/độ
 * chính xác khi hạ mức "suy luận" (thinking) của Gemini. Phát hiện thật trong
 * phiên audit: `gemini-3.7-flash` là model có thinking mode — 1 yêu cầu JSON
 * cực đơn giản đã tốn 154/183 token (84%) cho thinking
 * (`usageMetadata.thoughtsTokenCount`), khả năng cao chiếm phần lớn latency
 * 20-40s/đợt đã ghi nhận trước đây. Không set biến này → KHÔNG gửi field
 * `thinkingConfig` lên Gemini, giữ nguyên hành vi mặc định hiện tại (Google tự
 * chọn mức mặc định, hiện là "medium" theo tài liệu). Chỉ set khi chủ động
 * muốn đo so sánh — xem audit-pdf-import-engine-v2-vong2.md mục K/Phase 0.
 * Lưu ý đã tra cứu: dòng Gemini 3 Flash KHÔNG hỗ trợ tắt hẳn thinking (khác
 * dòng 2.5 dùng `thinkingBudget=0`), giá trị thấp nhất gửi được là "low".
 */
const GEMINI_THINKING_LEVEL: ThinkingLevel | null = resolveThinkingLevel(
  import.meta.env.VITE_GEMINI_THINKING_LEVEL as string | undefined,
);

function geminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Thời gian chờ tối đa (ms) cho 1 lần gọi Gemini trước khi tự huỷ. Không có
 * giới hạn này, nếu mạng/API bị treo, giao diện sẽ đứng ở "đang phân tích"
 * vô thời hạn mà không có cách nào báo lỗi cho giáo viên biết để thử lại.
 */
const GEMINI_TIMEOUT_MS = 90_000;

/**
 * Google thỉnh thoảng trả lỗi 503 "quá tải" hoặc 429 "vượt giới hạn tốc độ"
 * — đây là lỗi TẠM THỜI theo đúng thông báo của Google, tự thử lại sau vài
 * giây thường sẽ qua. Không thử lại quá nhiều lần để tránh treo lâu vô ích.
 *
 * GIẢM 01/09/2026 (3 → 2, dựa trên benchmark thật — xem
 * danh-gia-de-xuat-azota-chatgpt-v1.md mục G): 2 lần đo thật cho thấy CẢ 6/6
 * lần gọi model chính (`gemini-3.7-flash`) đều lỗi trước khi model dự phòng
 * xử lý được — tức lần thử thứ 3 ở model chính chưa từng "cứu" được 1 lượt
 * nào trong 2 lần đo, chỉ cộng thêm thời gian chờ vô ích (có lần cả 1 lượt
 * thử ăn trọn 90s timeout). Giảm xuống 2 lần cắt bớt phần chờ thừa này mà vẫn
 * giữ ít nhất 1 lần thử lại trước khi chuyển model dự phòng.
 *
 * CHƯA giảm GEMINI_TIMEOUT_MS (90s) ở đợt này: cả 2 lần đo, lượt THÀNH CÔNG
 * (ở model dự phòng) cũng mất 49.9s và 66.8s — nếu hạ timeout xuống thấp hơn
 * mức đó ngay bây giờ sẽ có nguy cơ tự huỷ NGANG những lượt gọi đang xử lý
 * đúng hướng, biến "chậm nhưng sẽ xong" thành "luôn thất bại rồi phải thử
 * lại" — tệ hơn hiện tại. Nên giảm timeout SAU khi phần thu hẹp việc giao cho
 * AI (parser tách câu, tách phân loại chương/bài khỏi luồng import...) đã
 * làm xong và đo lại thời gian 1 lượt gọi thành công thực tế còn bao lâu.
 */
const GEMINI_MAX_ATTEMPTS = 2;
const GEMINI_RETRY_DELAYS_MS = [3000];
/** Số lần thử ở ĐỢT DỰ PHÒNG (model dự phòng) — cố tình ít hơn model chính, để
 * khi cả 2 model đều đang có vấn đề, tổng thời gian chờ không bị nhân đôi. */
const GEMINI_FALLBACK_MAX_ATTEMPTS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeGeminiHttpError(status: number): string {
  if (status === 503) {
    return "Google đang quá tải (lỗi 503 UNAVAILABLE) — đã tự thử lại vài lần nhưng vẫn lỗi. Đây là lỗi tạm thời từ phía Google, đợi vài phút rồi thử lại.";
  }
  if (status === 429) {
    return "Đã gọi AI quá nhiều lần trong thời gian ngắn (lỗi 429 — vượt giới hạn tốc độ của gói miễn phí). Đợi 1-2 phút rồi thử lại.";
  }
  if (status === 404) {
    return "Không tìm thấy model AI (lỗi 404) — có thể tên model đang cấu hình không đúng hoặc chưa khả dụng cho API key này. Kiểm tra lại VITE_GEMINI_MODEL hoặc để trống dùng mặc định.";
  }
  if (status === 401 || status === 403) {
    return "API key không hợp lệ hoặc không có quyền gọi model này (lỗi 401/403) — kiểm tra lại VITE_GEMINI_API_KEY.";
  }
  if (status === 400) {
    return "Yêu cầu gửi lên AI không hợp lệ (lỗi 400) — có thể do dữ liệu ảnh bị lỗi khi render trang PDF.";
  }
  return `Lỗi từ Gemini API (mã ${status}).`;
}

interface GeminiCallResult {
  text: string | null;
  /** Lý do cụ thể khi text là null — để hiện cho giáo viên biết chính xác chuyện gì xảy ra thay vì chỉ nói chung chung "có lỗi". */
  errorMessage: string | null;
  /**
   * THÊM 25/08/2026: true khi Gemini dừng sinh chữ giữa chừng vì chạm giới hạn
   * "maxOutputTokens" (finishReason "MAX_TOKENS") — text vẫn có thể khác rỗng
   * (chỉ là JSON bị cắt cụt, không đóng ngoặc), khiến bước JSON.parse() ở nơi
   * gọi hàm này thất bại. Gắn cờ riêng để nơi gọi báo đúng lý do "bị cắt do
   * vượt giới hạn độ dài" thay vì lẫn vào thông báo chung "AI trả lời sai định
   * dạng JSON" — 2 nguyên nhân cần xử lý khác nhau (cắt ngang thì cần đợt nhỏ
   * hơn hoặc tăng maxOutputTokens, còn sai định dạng thường do AI quên escape).
   */
  truncated?: boolean;
  /**
   * PHASE 0 (thêm 01/09/2026) — số liệu benchmark của ĐÚNG lần gọi HTTP này
   * (không tính retry/fallback khác, mỗi lần đó tự trả usage riêng). null khi
   * lỗi xảy ra trước khi có response (network/timeout) — Google không trả
   * usageMetadata trong trường hợp đó. Không ảnh hưởng luồng xử lý JSON hiện
   * có (chỉ đọc thêm field sẵn có trong response, không đổi field text/truncated).
   */
  usage?: {
    promptTokenCount: number | null;
    candidatesTokenCount: number | null;
    totalTokenCount: number | null;
    thoughtsTokenCount: number | null;
  } | null;
}

/**
 * maxAttemptsForModel: số lần thử tối đa CHO MODEL HIỆN TẠI của lệnh gọi này
 * (không tính đợt dự phòng riêng) — model dự phòng dùng số lần thử ít hơn
 * (GEMINI_FALLBACK_MAX_ATTEMPTS) để không kéo dài gấp đôi thời gian chờ khi
 * cả 2 model đều đang có vấn đề.
 * isFallback: true khi lệnh gọi này đã là đợt dùng model dự phòng — để không
 * dự phòng lồng dự phòng (chỉ đổi model đúng 1 lần).
 */
async function callGeminiPartsDetailed(
  parts: GeminiPart[],
  maxOutputTokens: number,
  attempt = 1,
  model: string = GEMINI_MODEL,
  maxAttemptsForModel: number = GEMINI_MAX_ATTEMPTS,
  isFallback = false,
  /** PHASE 0 (thêm 01/09/2026) — optional, chỉ để ghi benchmark. Không truyền gì thì hành vi y hệt trước đây. */
  benchmark?: ImportBenchmarkRecorder,
  benchmarkLabel?: string,
): Promise<GeminiCallResult> {
  if (!GEMINI_API_KEY) {
    return { text: null, errorMessage: "Thiếu VITE_GEMINI_API_KEY — chưa cấu hình API key cho AI." };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const attemptStart = nowMs();
  /** Ghi 1 dòng benchmark cho ĐÚNG lần gọi HTTP này (không phải cho toàn bộ chuỗi retry/fallback) — gọi ở mọi điểm return bên dưới. */
  function recordAttempt(ok: boolean, usage: GeminiCallResult["usage"]): void {
    if (!benchmark) return;
    benchmark.recordGeminiCall({
      label: `${benchmarkLabel ?? "call"}-attempt${attempt}${isFallback ? "-fallback" : ""}`,
      model,
      roundTripMs: nowMs() - attemptStart,
      ok,
      thinkingLevelRequested: GEMINI_THINKING_LEVEL,
      promptTokenCount: usage?.promptTokenCount ?? null,
      candidatesTokenCount: usage?.candidatesTokenCount ?? null,
      totalTokenCount: usage?.totalTokenCount ?? null,
      thoughtsTokenCount: usage?.thoughtsTokenCount ?? null,
    } satisfies GeminiCallMetric);
  }
  try {
    const res = await fetch(`${geminiEndpoint(model)}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens,
          // GEMINI_THINKING_LEVEL = null (mặc định, chưa set biến môi trường) → KHÔNG thêm field này, giữ nguyên hành vi hiện tại.
          ...(GEMINI_THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL } } : {}),
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text();
      console.error(`Gemini API lỗi (model ${model}):`, res.status, bodyText);
      // 503/5xx là quá tải TẠM THỜI phía Google — đáng thử lại cùng model vài
      // giây sau, thường sẽ qua.
      // 429 (RESOURCE_EXHAUSTED) THỰC TẾ gặp 25/08/2026 lại là hết hạn mức
      // THEO NGÀY (quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
      // response còn kèm "retryDelay" ~30-45s) — đợi 3s/8s tại chỗ rồi gọi lại
      // CÙNG model gần như chắc chắn vẫn lỗi (chỉ tốn thêm thời gian chờ vô
      // ích), nên KHÔNG thử lại cùng model khi gặp 429, chuyển thẳng sang
      // model dự phòng (hạn mức free tier tính RIÊNG theo từng model, nên còn
      // nguyên 20 lượt/ngày).
      const serverOverload = res.status === 503 || res.status >= 500;
      const quotaExhausted = res.status === 429;
      const retriableSameModel = serverOverload && attempt < maxAttemptsForModel;
      recordAttempt(false, null);
      if (retriableSameModel) {
        await sleep(GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 8000);
        return callGeminiPartsDetailed(parts, maxOutputTokens, attempt + 1, model, maxAttemptsForModel, isFallback, benchmark, benchmarkLabel);
      }
      if (!isFallback && (serverOverload || quotaExhausted) && model !== GEMINI_FALLBACK_MODEL) {
        console.warn(`Model "${model}" ${quotaExhausted ? "hết hạn mức/ngày" : "quá tải"} sau ${attempt} lần thử — tự chuyển sang model dự phòng "${GEMINI_FALLBACK_MODEL}".`);
        return callGeminiPartsDetailed(
          parts,
          maxOutputTokens,
          1,
          GEMINI_FALLBACK_MODEL,
          GEMINI_FALLBACK_MAX_ATTEMPTS,
          true,
          benchmark,
          benchmarkLabel,
        );
      }
      const base = describeGeminiHttpError(res.status);
      return {
        text: null,
        errorMessage: isFallback
          ? `${base} (đã tự thử cả model dự phòng "${GEMINI_FALLBACK_MODEL}" nhưng vẫn lỗi)`
          : base,
      };
    }
    const json = await res.json();
    const candidate = json?.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text as string | undefined;
    // "MAX_TOKENS" = Gemini dừng sinh chữ giữa chừng vì chạm giới hạn
    // maxOutputTokens gửi lên — xem GeminiCallResult.truncated ở trên.
    const truncated = candidate?.finishReason === "MAX_TOKENS";
    // PHASE 0 (thêm 01/09/2026) — usageMetadata.thoughtsTokenCount là phát
    // hiện thật trong phiên audit (xem const GEMINI_THINKING_LEVEL ở trên):
    // trường này TỒN TẠI sẵn trong response nhưng CHƯA từng được đọc ở đây.
    const usage: GeminiCallResult["usage"] = json?.usageMetadata
      ? {
          promptTokenCount: json.usageMetadata.promptTokenCount ?? null,
          candidatesTokenCount: json.usageMetadata.candidatesTokenCount ?? null,
          totalTokenCount: json.usageMetadata.totalTokenCount ?? null,
          thoughtsTokenCount: json.usageMetadata.thoughtsTokenCount ?? null,
        }
      : null;
    if (!text?.trim()) {
      recordAttempt(false, usage);
      if (truncated) {
        return {
          text: null,
          errorMessage: "AI bị dừng ngang do vượt giới hạn độ dài phản hồi (MAX_TOKENS) trước khi viết được nội dung nào — đợt này có thể quá dài, thử lại sau hoặc chia nhỏ hơn.",
          truncated: true,
          usage,
        };
      }
      return { text: null, errorMessage: "AI trả lời rỗng, không có nội dung để đọc.", usage };
    }
    recordAttempt(true, usage);
    return { text: text.trim(), errorMessage: null, truncated, usage };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      recordAttempt(false, null);
      if (attempt < maxAttemptsForModel) {
        return callGeminiPartsDetailed(parts, maxOutputTokens, attempt + 1, model, maxAttemptsForModel, isFallback, benchmark, benchmarkLabel);
      }
      if (!isFallback && model !== GEMINI_FALLBACK_MODEL) {
        console.warn(`Model "${model}" liên tục timeout sau ${attempt} lần thử — tự chuyển sang model dự phòng "${GEMINI_FALLBACK_MODEL}".`);
        return callGeminiPartsDetailed(
          parts,
          maxOutputTokens,
          1,
          GEMINI_FALLBACK_MODEL,
          GEMINI_FALLBACK_MAX_ATTEMPTS,
          true,
          benchmark,
          benchmarkLabel,
        );
      }
      return {
        text: null,
        errorMessage: `Gọi AI quá ${GEMINI_TIMEOUT_MS / 1000}s không có phản hồi (đã thử lại ${maxAttemptsForModel} lần${isFallback ? " với model dự phòng" : ""}) — có thể do mạng chậm hoặc ảnh gửi lên quá nặng.`,
      };
    }
    recordAttempt(false, null);
    console.error("Gọi Gemini thất bại:", err);
    return { text: null, errorMessage: "Lỗi kết nối mạng khi gọi AI — kiểm tra lại internet rồi thử lại." };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiParts(
  parts: GeminiPart[],
  maxOutputTokens = 500,
): Promise<string | null> {
  const { text } = await callGeminiPartsDetailed(parts, maxOutputTokens);
  return text;
}

async function callGemini(prompt: string): Promise<string | null> {
  return callGeminiParts([{ text: prompt }], 500);
}

/**
 * AI thỉnh thoảng quên escape dấu `\` khi viết công thức LaTeX bên trong 1
 * chuỗi JSON (vd viết `\lim` thay vì `\\lim`) — với JSON, `\` chỉ hợp lệ khi
 * theo sau bởi đúng 1 trong các ký tự `" \ / b f n r t u`, nên `\l`, `\i`...
 * làm `JSON.parse` báo lỗi "Bad escaped character" và làm MẤT TRẮNG cả đợt
 * câu hỏi đó (dù nội dung AI trả về thực ra đọc đúng, chỉ sai định dạng).
 * Hàm này duyệt qua chuỗi, chỉ bên trong các cặp dấu `"..."` của JSON, và tự
 * escape thêm 1 dấu `\` cho mọi backslash không hợp lệ — biến `\lim` thành
 * `\\lim` để JSON.parse đọc được, và sau khi JSON giải mã lại đúng ra `\lim`
 * (1 dấu `\`) như LaTeX gốc cần có. Tách hàm thuần riêng để test được.
 *
 * GIỚI HẠN CÒN LẠI (cố ý, không cố sửa): chỉ coi `\` là "lỗi cần sửa" khi ký
 * tự theo sau KHÔNG nằm trong đúng bộ escape hợp lệ của JSON — nên các lệnh
 * LaTeX bắt đầu bằng đúng 1 trong các chữ `b f n r t` (vd `\frac`, `\nabla`,
 * `\tan`, `\to`, `\bar`, `\rho`) vẫn được JSON.parse hiểu (sai) thành ký tự
 * điều khiển (form feed/newline/tab...) + phần chữ còn lại, mà hàm này không
 * phát hiện được — về bản chất KHÔNG thể phân biệt chắc chắn với 1 dấu xuống
 * dòng/tab thật sự đã được escape đúng cách (vd trong solution_latex nhiều
 * bước), nên cố "sửa" theo hướng ngược lại sẽ làm hỏng đúng những chỗ đang
 * chạy tốt. Cách giảm rủi ro này chủ yếu nằm ở prompt (dặn AI escape đúng
 * ngay từ đầu), hàm này chỉ đảm bảo KHÔNG mất trắng cả đợt câu hỏi khi AI
 * escape sai theo kiểu dễ phát hiện (phần lớn các trường hợp thực tế).
 */
export function sanitizeJsonEscapes(raw: string): string {
  const validEscapes = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next !== undefined && validEscapes.has(next)) {
        out += ch + next;
        i++;
      } else {
        out += "\\\\";
      }
      continue;
    }
    if (ch === '"') {
      inString = false;
    }
    out += ch;
  }
  return out;
}

/** Bóc khối JSON ra khỏi câu trả lời của AI, kể cả khi AI bọc trong ```json ... ``` */
export function extractJsonBlock(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const jsonMatch = candidate.match(/[[{][\s\S]*[\]}]/);
  const jsonText = jsonMatch ? jsonMatch[0] : candidate;
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    // Không parse được ngay — thử tự sửa lỗi escape backslash thường gặp ở
    // công thức LaTeX trước khi bỏ cuộc (xem sanitizeJsonEscapes ở trên).
    try {
      return JSON.parse(sanitizeJsonEscapes(jsonText));
    } catch {
      throw err; // báo đúng lỗi gốc nếu sửa tự động cũng không cứu được
    }
  }
}

export interface LessonSuggestion {
  lesson_id: string | null;
  lesson_name: string | null;
  reasoning: string;
}

/**
 * Gợi ý Bài phù hợp nhất cho 1 câu hỏi, CHỈ chọn trong danh sách Bài đã có
 * sẵn (không tự bịa Bài mới) — tránh việc mỗi lần AI phân loại ra một kiểu
 * khác nhau, làm hỏng tính nhất quán của ngân hàng câu hỏi. Trước đây gọi là
 * suggestQuestionType/"dạng bài" — đổi tên theo migration_016.
 */
export async function suggestQuestionLesson(
  questionContentLatex: string,
  existingLessons: Lesson[],
): Promise<LessonSuggestion> {
  if (existingLessons.length === 0) {
    return {
      lesson_id: null,
      lesson_name: null,
      reasoning: "Chưa có Bài nào trong hệ thống để gợi ý.",
    };
  }

  const lessonList = existingLessons
    .map((l) => `- id="${l.id}": ${l.name}${l.description ? " — " + l.description : ""}`)
    .join("\n");

  const prompt = `Bạn là trợ lý phân loại đề Toán THPT (Việt Nam). Dưới đây là danh sách các "Bài" (theo phân phối chương trình) đã có sẵn:
${lessonList}

Câu hỏi cần phân loại (viết bằng LaTeX):
"""
${questionContentLatex}
"""

Hãy chọn ĐÚNG MỘT Bài phù hợp nhất trong danh sách trên (không tự tạo Bài mới).
Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác:
{"id": "<id của Bài đã chọn>", "reasoning": "<giải thích ngắn gọn 1 câu bằng tiếng Việt>"}
Nếu không Bài nào phù hợp, trả về {"id": null, "reasoning": "..."}`;

  const raw = await callGemini(prompt);
  if (!raw) {
    return {
      lesson_id: null,
      lesson_name: null,
      reasoning: "Không gọi được AI (kiểm tra API key hoặc kết nối mạng).",
    };
  }

  try {
    const parsed = extractJsonBlock(raw) as {
      id: string | null;
      reasoning: string;
    };
    const matched = existingLessons.find((l) => l.id === parsed.id);
    return {
      lesson_id: matched?.id ?? null,
      lesson_name: matched?.name ?? null,
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return {
      lesson_id: null,
      lesson_name: null,
      reasoning: "AI trả về định dạng không đọc được, cần gán Bài thủ công.",
    };
  }
}

export interface TopicSuggestion {
  topic_id: string | null;
  topic_name: string | null;
  reasoning: string;
}

/**
 * Gợi ý CHƯƠNG phù hợp nhất cho 1 câu hỏi, CHỈ chọn trong danh sách chương đã
 * có sẵn (6 chương Toán 12 gieo sẵn, hoặc chương giáo viên tự thêm) — tách
 * riêng khỏi suggestQuestionType() vì đây là mức phân loại thô hơn (chương),
 * không cần đợi khung "dạng bài" chi tiết được định nghĩa đầy đủ mới dùng được.
 */
export async function suggestQuestionTopic(
  questionContentLatex: string,
  existingTopics: Topic[],
): Promise<TopicSuggestion> {
  if (existingTopics.length === 0) {
    return {
      topic_id: null,
      topic_name: null,
      reasoning: "Chưa có chương nào trong hệ thống để gợi ý.",
    };
  }

  const topicList = existingTopics
    .map((t) => `- id="${t.id}": ${t.name} (Lớp ${t.grade})`)
    .join("\n");

  const prompt = `Bạn là trợ lý phân loại đề Toán THPT (Việt Nam). Dưới đây là danh sách các "chương" đã có sẵn:
${topicList}

Câu hỏi cần phân loại (viết bằng LaTeX):
"""
${questionContentLatex}
"""

Hãy chọn ĐÚNG MỘT chương phù hợp nhất trong danh sách trên (không tự tạo chương mới).
Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác:
{"id": "<id của chương đã chọn>", "reasoning": "<giải thích ngắn gọn 1 câu bằng tiếng Việt>"}
Nếu không chương nào phù hợp, trả về {"id": null, "reasoning": "..."}`;

  const raw = await callGemini(prompt);
  if (!raw) {
    return {
      topic_id: null,
      topic_name: null,
      reasoning: "Không gọi được AI (kiểm tra API key hoặc kết nối mạng).",
    };
  }

  try {
    const parsed = extractJsonBlock(raw) as {
      id: string | null;
      reasoning: string;
    };
    const matched = existingTopics.find((t) => t.id === parsed.id);
    return {
      topic_id: matched?.id ?? null,
      topic_name: matched?.name ?? null,
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return {
      topic_id: null,
      topic_name: null,
      reasoning: "AI trả về định dạng không đọc được, cần gán chương thủ công.",
    };
  }
}

/** Tìm chương khớp tên AI trả về (không phân biệt hoa/thường, bỏ khoảng trắng thừa) — tách hàm riêng để test được. */
export function matchTopicByName(
  name: string | null | undefined,
  topics: Topic[],
): string | null {
  if (!name?.trim()) return null;
  const normalized = name.trim().toLowerCase();
  return topics.find((t) => t.name.trim().toLowerCase() === normalized)?.id ?? null;
}

/** Tìm Bài khớp tên AI trả về, CHỈ trong phạm vi 1 chương (topicId) — không
 * phân biệt hoa/thường, bỏ khoảng trắng thừa. topicId null (chưa xác định
 * được chương) luôn trả về null — tách hàm riêng để test được (migration_016). */
export function matchLessonByName(
  name: string | null | undefined,
  topicId: string | null,
  lessons: Lesson[],
): string | null {
  if (!name?.trim() || !topicId) return null;
  const normalized = name.trim().toLowerCase();
  return (
    lessons.find((l) => l.topic_id === topicId && l.name.trim().toLowerCase() === normalized)?.id ??
    null
  );
}

export interface StudentStatsForAI {
  studentName: string;
  periodLabel: string;
  totalAttempts: number;
  averageScore: number | null;
  scoreTrend: { examTitle: string; date: string; score: number }[];
  /**
   * ĐỔI 24/08/2026 (audit "check full"): trước đây gọi là `topicStats`, gộp
   * theo "dạng bài" (question_type_id) — nhưng field này hầu như LUÔN RỖNG
   * trong thực tế vì question_type_id chưa được giáo viên gán cho câu hỏi
   * nào cả (xem lý do đầy đủ ở chapterStats.ts/TeacherDashboard.tsx). Hệ quả
   * là mọi báo cáo phụ huynh tạo ra trước đây đều thiếu hẳn phần "dạng bài
   * mạnh/cần luyện" mà không ai để ý vì không có lỗi nào hiện ra. Đổi sang
   * gộp theo CHƯƠNG (topic_id) — đã có dữ liệu thật vì được gán khi nhập đề
   * — và đổi luôn tên field để không ai nhầm lại lần nữa.
   */
  chapterStats: { chapter_name: string; accuracyPercent: number }[];
}

/** Sinh đoạn nhận xét ngắn cho báo cáo định kỳ, dựa trên số liệu đã tính sẵn. */
export async function generateReportSummary(
  stats: StudentStatsForAI,
): Promise<string> {
  const chapterLines = stats.chapterStats
    .map((c) => `- ${c.chapter_name}: đúng ${c.accuracyPercent.toFixed(0)}%`)
    .join("\n");
  const trendLines = stats.scoreTrend
    .map((s) => `- ${s.date} (${s.examTitle}): ${s.score.toFixed(2)} điểm`)
    .join("\n");

  const prompt = `Bạn là giáo viên Toán đang viết nhận xét ngắn gọn gửi phụ huynh về học sinh "${stats.studentName}", giai đoạn ${stats.periodLabel}.

Số liệu:
- Số lần kiểm tra: ${stats.totalAttempts}
- Điểm trung bình: ${stats.averageScore?.toFixed(2) ?? "chưa có dữ liệu"}
- Điểm qua các lần kiểm tra:
${trendLines || "(chưa có)"}
- Tỉ lệ đúng theo chương:
${chapterLines || "(chưa có)"}

Viết 1 đoạn nhận xét (3-5 câu) bằng tiếng Việt, giọng văn thân thiện, chuyên nghiệp,
nêu rõ: xu hướng điểm số (tiến bộ/đi ngang/giảm), chương đang mạnh, chương cần
luyện thêm. CHỈ dựa vào số liệu ở trên, không suy diễn thêm thông tin không có.
Không dùng markdown, không dùng emoji.`;

  const text = await callGemini(prompt);
  return (
    text ??
    "Chưa thể tạo nhận xét tự động lúc này. Vui lòng xem số liệu chi tiết bên dưới."
  );
}

// ---------------------------------------------------------------------------
// Tạo đề từ file Word: AI đọc văn bản (đã trích bằng mammoth.js ở wordImport.ts)
// + các hình ảnh nhúng (nếu có), trả về cấu trúc câu hỏi đã LaTeX hoá.
// Giáo viên LUÔN phải xem lại và xác nhận đáp án trước khi xuất bản — AI ở đây
// chỉ hỗ trợ soạn nháp, không tự động công bố đề.
// ---------------------------------------------------------------------------

export interface ParsedPart1Question {
  content_latex: string;
  choices: { A: string; B: string; C: string; D: string };
  correct_choice: "A" | "B" | "C" | "D" | null;
  /** Lời giải chi tiết (LaTeX), nếu đề có ghi sẵn ngay dưới câu hỏi. Không bắt buộc. */
  solution_latex?: string | null;
  /** Tên chương AI gợi ý (khớp đúng tên 1 trong danh sách topics đã gửi) — null nếu không chắc. Ánh xạ sang topic_id bằng matchTopicByName(). */
  topic_name?: string | null;
  /** Tên Bài AI gợi ý, TRONG PHẠM VI chương đã chọn ở topic_name (migration_016)
   * — null nếu chưa chọn được chương hoặc không chắc. Ánh xạ sang lesson_id
   * bằng matchLessonByName(). */
  lesson_name?: string | null;
}
export interface ParsedPart2Question {
  content_latex: string;
  items: { a: string; b: string; c: string; d: string };
  correct: { a: boolean; b: boolean; c: boolean; d: boolean } | null;
  solution_latex?: string | null;
  topic_name?: string | null;
  lesson_name?: string | null;
}
export interface ParsedPart3Question {
  content_latex: string;
  correct_value: string | null;
  points: number;
  solution_latex?: string | null;
  topic_name?: string | null;
  lesson_name?: string | null;
}
export interface ParsedExam {
  part1: ParsedPart1Question[];
  part2: ParsedPart2Question[];
  part3: ParsedPart3Question[];
  warnings: string[];
}

/**
 * Danh sách chương (+ Bài của từng chương, nếu có) gửi kèm prompt + đoạn
 * hướng dẫn gợi ý chương/Bài — dùng chung cho cả 2 prompt (đọc .docx và đọc
 * ảnh PDF) để không lặp lại nội dung. Trống (topics rỗng) thì bỏ qua hẳn yêu
 * cầu này, không ép AI đoán mò khi giáo viên chưa gieo chương nào. GỢI Ý BÀI
 * (thêm migration_016) chỉ thêm vào khi có ít nhất 1 Bài — và luôn đặt SAU
 * gợi ý chương, có nói rõ Bài phải nằm ĐÚNG trong chương đã chọn (khớp với
 * cách matchLessonByName lọc theo topic_id ở phía client).
 */
function classificationBlock(
  topics: Topic[],
  lessons: Lesson[],
): {
  ruleText: string;
  jsonExample: string;
} {
  if (topics.length === 0) return { ruleText: "", jsonExample: "" };
  const topicList = topics.map((t) => `"${t.name}"`).join(", ");
  let ruleText = `\nGỢI Ý CHƯƠNG: với mỗi câu, chọn ĐÚNG MỘT chương phù hợp nhất trong danh sách sau (ghi lại ĐÚNG NGUYÊN VĂN tên chương, không tự bịa chương mới, không dịch/viết tắt khác đi): ${topicList}. Nếu không chương nào phù hợp hoặc không chắc chắn, để "topic_name" là null — không đoán bừa.\n`;
  let jsonExample = `, "topic_name": "..." | null`;

  const lessonsByTopic = new Map<string, Lesson[]>();
  for (const l of lessons) {
    const arr = lessonsByTopic.get(l.topic_id) ?? [];
    arr.push(l);
    lessonsByTopic.set(l.topic_id, arr);
  }
  const lessonBlocks = topics
    .filter((t) => (lessonsByTopic.get(t.id)?.length ?? 0) > 0)
    .map(
      (t) =>
        `  + Chương "${t.name}": ${lessonsByTopic
          .get(t.id)!
          .map((l) => `"${l.name}"`)
          .join(", ")}`,
    )
    .join("\n");
  if (lessonBlocks) {
    ruleText += `\nGỢI Ý BÀI: SAU KHI đã chọn được chương ở trên, chọn tiếp ĐÚNG MỘT Bài phù hợp nhất trong danh sách Bài CỦA ĐÚNG CHƯƠNG ĐÓ (ghi lại ĐÚNG NGUYÊN VĂN tên Bài, không tự bịa Bài mới, không lấy Bài của chương khác):\n${lessonBlocks}\nNếu chưa chọn được chương ở trên, hoặc không Bài nào trong chương đó phù hợp, hoặc không chắc chắn, để "lesson_name" là null — không đoán bừa.\n`;
    jsonExample += `, "lesson_name": "..." | null`;
  }

  return { ruleText, jsonExample };
}

// ---------------------------------------------------------------------------
// Gợi ý Chương/Bài — LƯỢT GỌI AI RIÊNG, CHẠY NỀN (thêm 01/09/2026, việc #4
// trong kế hoạch cải tiến sau khi nghiên cứu Azota). TRƯỚC đây việc này nằm
// CHUNG trong đúng lượt gọi đọc câu hỏi/công thức/đáp án từ ảnh (xem
// buildExamParseFromImagesPrompt/buildExamParsePrompt phía trên) — nghĩa là
// giáo viên phải chờ AI xong CẢ 2 việc mới thấy được màn xem trước, dù việc
// phân loại chương/Bài chỉ là GỢI Ý (giáo viên luôn xem lại/tự chọn ở bước
// xác nhận, không ảnh hưởng gì đến độ chính xác câu hỏi/đáp án).
//
// Cách dùng đúng (xem TeacherExamImport.tsx): gọi classifyExamQuestions()
// SAU KHI đã hiện xong màn xem trước (loadParsed) — CHỈ TEXT (content_latex
// đã có sẵn, không cần gửi lại ảnh), nên rẻ và nhanh hơn hẳn lượt gọi chính.
// Kết quả trả về được ghép vào state hiện có bằng "id" tự đặt, và CHỈ áp dụng
// cho câu nào giáo viên CHƯA tự chọn chương (topic_id vẫn còn null tại thời
// điểm kết quả về) — tránh ghi đè lựa chọn thủ công nếu giáo viên đã lỡ chọn
// tay trong lúc chờ.
// ---------------------------------------------------------------------------

export interface QuestionClassificationInput {
  /** id do phía gọi tự đặt (khuyến nghị dạng "part1-0", "part2-3"...) — dùng để ghép kết quả trả về đúng câu, không phụ thuộc AI có trả đúng thứ tự hay không. */
  id: string;
  content_latex: string;
}

export interface QuestionClassificationResult {
  id: string;
  topic_name: string | null;
  lesson_name: string | null;
}

function buildClassifyQuestionsPrompt(
  topics: Topic[],
  lessons: Lesson[],
  items: QuestionClassificationInput[],
): string {
  const { ruleText, jsonExample } = classificationBlock(topics, lessons);
  const itemsBlock = items
    .map((it) => `- id "${it.id}": ${it.content_latex.replace(/\s+/g, " ").trim().slice(0, 800)}`)
    .join("\n");
  return `Bạn là trợ lý phân loại câu hỏi Toán THPT (Việt Nam, chương trình GDPT 2018) theo Chương/Bài. Dưới đây là danh sách các câu hỏi (chỉ phần nội dung, đã có sẵn công thức LaTeX) đã được số hoá từ trước — nhiệm vụ DUY NHẤT của bạn là gợi ý Chương/Bài cho từng câu, KHÔNG cần đọc/sửa lại nội dung câu hỏi.
${ruleText}
Danh sách câu hỏi (mỗi dòng 1 câu, kèm "id" để bạn trả lời đúng câu đó):
${itemsBlock}

QUAN TRỌNG VỀ ĐỊNH DẠNG JSON: trả lời CHÍNH XÁC theo định dạng JSON sau, đủ 1 phần tử cho MỖI id ở trên (giữ nguyên đúng chuỗi "id" đã cho), không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "classifications": [{"id": "..."${jsonExample}}]
}`;
}

/** Số câu hỏi gộp vào 1 lượt gọi AI khi phân loại Chương/Bài — nhỏ hơn nhiều so với lượt đọc câu hỏi chính (không cần gửi ảnh, chỉ text) nên gộp được nhiều câu hơn hẳn 1 đợt. */
const CLASSIFY_CHUNK_SIZE = 40;
const CLASSIFY_CONCURRENCY = 2;

/**
 * Gợi ý Chương/Bài cho danh sách câu hỏi — CHỈ DÙNG TEXT (content_latex),
 * không gửi ảnh, nên nhẹ và nhanh hơn hẳn lượt đọc đề chính — dùng để chạy
 * NỀN sau khi đã hiện xong màn xem trước (xem giải thích ở đầu khối này).
 * Trả về mảng rỗng nếu không có câu nào hoặc chưa có chương nào (topics rỗng)
 * — im lặng bỏ qua, KHÔNG coi là lỗi, vì đây chỉ là gợi ý phụ thêm, giáo viên
 * vẫn luôn tự chọn được ở màn xem trước dù không có gợi ý AI.
 */
export async function classifyExamQuestions(
  items: QuestionClassificationInput[],
  topics: Topic[],
  lessons: Lesson[],
): Promise<QuestionClassificationResult[]> {
  if (items.length === 0 || topics.length === 0) return [];
  const chunks = chunkArray(items, CLASSIFY_CHUNK_SIZE);
  const chunkResults = await mapWithConcurrency(chunks, CLASSIFY_CONCURRENCY, async (chunk) => {
    let raw: string | null = null;
    try {
      raw = await callGeminiParts([{ text: buildClassifyQuestionsPrompt(topics, lessons, chunk) }], 4096);
      if (!raw) return [];
      const parsed = extractJsonBlock(raw) as { classifications?: QuestionClassificationResult[] };
      return Array.isArray(parsed.classifications) ? parsed.classifications : [];
    } catch (err) {
      // Lỗi ở lượt gợi ý nền KHÔNG được làm hỏng gì cả — chỉ ghi log, câu hỏi
      // liên quan đơn giản là không có gợi ý Chương/Bài, giáo viên tự chọn.
      console.error("Không đọc được JSON khi phân loại Chương/Bài (chạy nền):", err, raw);
      return [];
    }
  });
  return chunkResults.flat();
}

function buildExamParsePrompt(topics: Topic[], lessons: Lesson[]): string {
  // ĐỔI 01/09/2026 (Giai đoạn 1a, việc #4 trong kế hoạch cải tiến): KHÔNG còn
  // nhét yêu cầu gợi ý Chương/Bài vào ĐÚNG lượt gọi AI chính này nữa — tách
  // riêng thành 1 lượt gọi RIÊNG, chạy NỀN sau khi màn xem trước đã hiện ra
  // (xem classifyExamQuestions() bên dưới + nơi gọi ở TeacherExamImport.tsx).
  // Lý do: gợi ý Chương/Bài không quyết định tốc độ giáo viên xem được đề hay
  // không (chỉ là gợi ý, giáo viên luôn xem lại/tự chọn) — trong khi việc gộp
  // chung vào 1 lượt khiến lượt đọc câu hỏi/công thức chính phải "cõng" thêm
  // việc phân loại trước khi trả lời được, kéo dài thời gian chờ mà giáo viên
  // nhìn thấy màn hình trống. `topics`/`lessons` vẫn giữ nguyên trong tham số
  // hàm này để KHÔNG phải sửa các nơi đang gọi buildExamParsePrompt(topics,
  // lessons) — chỉ đơn giản không dùng chúng để tạo ruleText/jsonExample nữa.
  const { ruleText, jsonExample } = classificationBlock([], []);
  return `Bạn là trợ lý số hoá đề thi Toán THPT (Việt Nam, chương trình GDPT 2018). Dưới đây là văn bản trích từ 1 file Word chứa đề thi, cùng với các hình ảnh nhúng trong file (nếu có) được gửi kèm — mỗi hình có placeholder dạng [HINH_n] xuất hiện trong văn bản, hình gửi kèm theo ĐÚNG thứ tự đó.

Đề thi có 3 phần theo cấu trúc chuẩn:
- Phần 1: trắc nghiệm 4 phương án (A, B, C, D), chỉ 1 phương án đúng.
- Phần 2: mỗi câu có 4 ý nhỏ (a, b, c, d), mỗi ý là 1 mệnh đề Đúng/Sai độc lập.
- Phần 3: trả lời ngắn (điền số hoặc chuỗi ngắn), không có phương án cho sẵn.

YÊU CẦU:
1. Xác định đúng từng câu thuộc phần nào, theo đúng thứ tự xuất hiện trong văn bản.
2. Chuyển TOÀN BỘ công thức Toán sang LaTeX, đặt trong cặp dấu $...$ (công thức trong dòng). Không dùng \\[ \\] hay các cú pháp khác.
3. Với mỗi placeholder [HINH_n]: nếu hình đó là 1 công thức Toán (chụp/dán ảnh), hãy đọc và chuyển thành LaTeX chèn thẳng vào đúng vị trí (không giữ lại placeholder). Nếu hình là đồ thị/hình vẽ minh hoạ (không phải công thức đơn thuần), GIỮ NGUYÊN placeholder đó trong content_latex kèm chú thích "(xem hình)" ngay sau — KHÔNG được tự vẽ lại hay đoán nội dung hình.
4. CHỈ điền đáp án đúng (correct_choice / correct / correct_value) khi có bằng chứng rõ ràng trong văn bản — ví dụ phương án được đánh dấu **in đậm** (là quy ước in đậm = đáp án đúng), hoặc có ghi chú "Đáp án:" ngay sau câu. Nếu KHÔNG chắc chắn, để giá trị đó là null — TUYỆT ĐỐI không tự đoán đáp án khi không có căn cứ, vì đoán sai sẽ làm chấm điểm sai cho học sinh.
5. Với Phần 3, "points" là thang điểm của câu đó nếu đề có ghi rõ, nếu không có thì để mặc định 0.5.
6. Nếu đề có ghi lời giải chi tiết ngay dưới mỗi câu (thường thấy ở bản dành cho giáo viên), hãy chuyển lời giải đó sang "solution_latex" (cùng quy ước LaTeX như content_latex, giữ nguyên các bước giải, không tự tóm tắt hay bịa thêm). Nếu đề không có lời giải cho câu nào, để "solution_latex" là null cho câu đó — KHÔNG tự viết lời giải khi đề gốc không có.
7. Liệt kê vào "warnings" (mảng chuỗi tiếng Việt ngắn) bất kỳ điều gì không chắc chắn: câu thiếu công thức nghi do định dạng gốc không đọc được, câu không xác định được phần nào, hình ảnh không rõ nội dung, v.v.
${ruleText}
QUAN TRỌNG VỀ ĐỊNH DẠNG JSON: trong mọi chuỗi (content_latex, solution_latex...), dấu chéo ngược '\' của LaTeX (vd '\frac', '\lim', '\infty', '\left(') PHẢI viết thành HAI dấu chéo ngược liên tiếp '\\' (vd '\\frac', '\\lim', '\\infty') để là JSON hợp lệ — 1 dấu chéo ngược đơn lẻ đứng trước 1 chữ cái sẽ làm hỏng toàn bộ JSON và mất hết câu hỏi trong đợt này. Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "part1": [{"content_latex": "...", "choices": {"A":"...","B":"...","C":"...","D":"..."}, "correct_choice": "A" | null, "solution_latex": "..." | null${jsonExample}}],
  "part2": [{"content_latex": "...", "items": {"a":"...","b":"...","c":"...","d":"..."}, "correct": {"a":true,"b":false,"c":true,"d":false} | null, "solution_latex": "..." | null${jsonExample}}],
  "part3": [{"content_latex": "...", "correct_value": "..." | null, "points": 0.5, "solution_latex": "..." | null${jsonExample}}],
  "warnings": ["..."]
}

Văn bản đề thi (in đậm được đánh dấu bằng **...**):
"""
`;
}

export async function parseExamFromDocument(
  plainText: string,
  images: ExtractedImage[],
  topics: Topic[] = [],
  lessons: Lesson[] = [],
): Promise<ParsedExam | null> {
  const parts: GeminiPart[] = [{ text: buildExamParsePrompt(topics, lessons) + plainText + '\n"""' }];
  for (const img of images) {
    parts.push({ text: `\nHình ảnh cho placeholder ${img.placeholder}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }

  // Nâng lên 16384 cùng lý do với parseExamFromImages (đợt dài dễ bị Google
  // cắt ngang giữa chừng do chạm giới hạn maxOutputTokens cũ 8192).
  const raw = await callGeminiParts(parts, 16384);
  if (!raw) return null;

  try {
    const parsed = extractJsonBlock(raw) as Partial<ParsedExam>;
    return {
      part1: Array.isArray(parsed.part1) ? parsed.part1 : [],
      part2: Array.isArray(parsed.part2) ? parsed.part2 : [],
      part3: Array.isArray(parsed.part3) ? parsed.part3 : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    console.error("Không đọc được JSON từ AI khi phân tích đề:", err, raw);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tạo đề từ file PDF (KHUYẾN NGHỊ — quy trình chính, cập nhật 23/08/2026):
// mỗi trang PDF cung cấp 2 nguồn dữ liệu song song cho AI (xem pdfImport.ts):
//   1. Văn bản THẬT trích trực tiếp từ lớp text của PDF (pdf.js) — chính xác
//      tuyệt đối, không tốn AI. Khi xuất .docx ra PDF, chữ thường vẫn là text
//      thật, CHỈ RIÊNG công thức MathType/Equation Editor (OLE nhị phân) mới
//      bị "in" thành hình ảnh.
//   2. Ảnh render cả trang — AI chỉ cần dùng để đọc công thức đã thành hình,
//      nhận diện hình vẽ minh hoạ, và xác định đáp án qua tín hiệu thị giác.
// Nhờ có sẵn văn bản chính xác làm khung, AI không cần tự OCR lại toàn bộ chữ
// tiếng Việt từ ảnh (nguồn lỗi chính trước đây — sai dấu, sai chữ, hoặc lẫn
// chữ thường vào trong cặp $...$) — chỉ cần đối chiếu + bổ sung phần hình,
// giúp ảnh gửi đi nhẹ hơn, phân tích nhanh hơn, và chính xác hơn hẳn so với
// việc gửi ảnh độ phân giải cao để AI tự đọc hết từ đầu.
// Quy ước nhận diện đáp án học theo cách Azota làm: chấp nhận NHIỀU tín hiệu
// cùng lúc (tô màu, gạch chân, in đậm, dấu *, ghi chú "Đáp án:"...) thay vì
// đòi 1 quy ước cứng — và luôn có bước giáo viên xác nhận lại trước khi xuất
// bản, vì AI đọc ảnh vẫn có thể đọc sai màu/nét mờ.
// ---------------------------------------------------------------------------

function buildExamParseFromImagesPrompt(topics: Topic[], lessons: Lesson[]): string {
  // ĐỔI 01/09/2026 — xem giải thích đầy đủ ở buildExamParsePrompt() phía trên
  // (cùng lý do, cùng thay đổi: gợi ý Chương/Bài tách ra lượt gọi nền riêng).
  const { ruleText, jsonExample } = classificationBlock([], []);
  return `Bạn là trợ lý số hoá đề thi Toán THPT (Việt Nam, chương trình GDPT 2018). Dưới đây là dữ liệu của từng trang 1 file đề thi (PDF), gửi kèm theo ĐÚNG thứ tự trang. Mỗi trang gồm 2 phần:
- "Văn bản trang N (đã trích chính xác 100%, dùng làm CƠ SỞ)": văn bản thật lấy trực tiếp từ file PDF — TIN TƯỞNG HOÀN TOÀN phần chữ tiếng Việt/số/ký hiệu này, KHÔNG cần tự đọc lại từ ảnh, không tự sửa chữ trừ khi rõ ràng bị thiếu do nằm trong công thức/hình. Phần này có thể thiếu chỗ có công thức Toán hoặc hình vẽ (vì công thức MathType/hình vẽ khi xuất PDF chỉ còn là HÌNH ẢNH, không phải chữ).
- Ảnh chụp cả trang ngay sau đó: CHỈ dùng ảnh này để (a) đọc các công thức Toán đã thành hình rồi chuyển sang LaTeX chèn đúng chỗ còn thiếu trong văn bản, (b) nhận diện hình vẽ minh hoạ, (c) xác định đáp án đúng qua tín hiệu thị giác (màu, gạch chân, đậm...) mà văn bản thuần không thể hiện được.

Đề thi có 3 phần theo cấu trúc chuẩn:
- Phần 1: trắc nghiệm 4 phương án (A, B, C, D), chỉ 1 phương án đúng.
- Phần 2: mỗi câu có 4 ý nhỏ (a, b, c, d), mỗi ý là 1 mệnh đề Đúng/Sai độc lập.
- Phần 3: trả lời ngắn (điền số hoặc chuỗi ngắn), không có phương án cho sẵn.

YÊU CẦU:
1. Dựng lại nội dung từng câu bằng cách LẤY NGUYÊN văn bản đã cho làm khung, CHÈN THÊM công thức Toán (đọc từ ảnh ở những chỗ văn bản bị thiếu) dưới dạng LaTeX trong cặp dấu $...$ (công thức trong dòng). Không dùng \\[ \\] hay cú pháp khác. QUAN TRỌNG: cặp dấu $...$ CHỈ bọc phần biểu thức Toán thuần tuý (số, biến, ký hiệu toán học) — chữ tiếng Việt (kể cả có dấu) và văn bản thường (đề bài, mô tả) phải nằm NGOÀI dấu $, không được bọc chung. Nếu bắt buộc phải có chữ tiếng Việt ngay bên trong 1 công thức (ví dụ đơn vị "cm", "giây", hoặc chú thích ngắn), phải bọc riêng phần chữ đó bằng \\text{...} bên trong dấu $. Ví dụ ĐÚNG: "Chiều dài là $x$ cm."; ví dụ SAI: "$Chiều dài là x$ cm.".
2. Bỏ qua các phần lặp lại ở đầu/cuối mỗi trang không phải nội dung đề (tên trường, logo, số trang, watermark) và các dòng ghi nguồn/tác giả kiểu "FB tác giả: ...", "Nguồn: ...", "Sưu tầm: ..." — đây là nhiễu, không đưa vào content_latex hay coi là tín hiệu đáp án.
3. Xác định đáp án đúng dựa trên BẤT KỲ tín hiệu nào sau đây xuất hiện trong ẢNH (văn bản thuần không mang thông tin màu/gạch chân nên phải xem ảnh):
   - Phần 1: phương án được TÔ MÀU NỀN (thường là xanh lá) và/hoặc GẠCH CHÂN, hoặc in đậm, hoặc có dấu "*" cạnh phương án, hoặc có ghi chú "Đáp án: X" ngay sau câu.
   - Phần 2: đáp án Đúng/Sai của từng ý có thể ghi dưới dạng bảng gọn (vd: a-Đ, b-S...) HOẶC dưới dạng văn xuôi trong phần lời giải (vd: "a) Đúng: vì...", "b) Sai: vì...") — đọc kỹ phần lời giải nếu không thấy bảng.
   - Phần 3: đáp số cuối câu có thể ghi bằng nhiều nhãn khác nhau: "Đáp số:", "Đs:", "Đáp án:", hoặc dạng "<key=...>" — coi tất cả các nhãn này là chỉ báo đáp án đúng.
   Nếu xem xét đủ các tín hiệu trên mà vẫn KHÔNG chắc chắn, để giá trị đáp án (correct_choice / correct / correct_value) là null — TUYỆT ĐỐI không tự đoán, vì đoán sai sẽ làm chấm điểm sai cho học sinh.
4. Nếu trang có ghi lời giải chi tiết ngay dưới câu hỏi (thường thấy ở bản dành cho giáo viên), chuyển lời giải đó sang "solution_latex" — giữ nguyên các bước giải, không tự tóm tắt hay bịa thêm. Nếu không có lời giải cho câu nào, để "solution_latex" là null cho câu đó.
5. Nếu câu có hình minh hoạ (đồ thị, bảng biến thiên, hình vẽ...) không phải là công thức Toán đơn thuần: KHÔNG cố mô tả lại hay tự vẽ hình đó bằng LaTeX. Ghi chú "(có hình minh hoạ — cần dán thủ công)" ngay trong content_latex tại vị trí hình xuất hiện, VÀ thêm 1 dòng vào "warnings" nêu rõ câu nào (Phần mấy, thứ tự xuất hiện) có hình cần giáo viên tự dán lại bằng Ctrl+V ở bước xem trước.
6. Với Phần 3, "points" là thang điểm nếu đề ghi rõ, mặc định 0.5 nếu không có.
7. Liệt kê vào "warnings" (mảng chuỗi tiếng Việt ngắn) mọi điều không chắc chắn khác: câu không xác định được thuộc phần nào, chữ mờ/khó đọc, nghi ngờ đọc sai công thức, trang bị thiếu/lệch thứ tự, v.v.
${ruleText}
QUAN TRỌNG VỀ ĐỊNH DẠNG JSON: trong mọi chuỗi (content_latex, solution_latex...), dấu chéo ngược '\' của LaTeX (vd '\frac', '\lim', '\infty', '\left(') PHẢI viết thành HAI dấu chéo ngược liên tiếp '\\' (vd '\\frac', '\\lim', '\\infty') để là JSON hợp lệ — 1 dấu chéo ngược đơn lẻ đứng trước 1 chữ cái sẽ làm hỏng toàn bộ JSON và mất hết câu hỏi trong đợt này. Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "part1": [{"content_latex": "...", "choices": {"A":"...","B":"...","C":"...","D":"..."}, "correct_choice": "A" | null, "solution_latex": "..." | null${jsonExample}}],
  "part2": [{"content_latex": "...", "items": {"a":"...","b":"...","c":"...","d":"..."}, "correct": {"a":true,"b":false,"c":true,"d":false} | null, "solution_latex": "..." | null${jsonExample}}],
  "part3": [{"content_latex": "...", "correct_value": "..." | null, "points": 0.5, "solution_latex": "..." | null${jsonExample}}],
  "warnings": ["..."]
}`;
}

export interface PageImageInput {
  mimeType: string;
  dataBase64: string;
  /** Văn bản thật trích từ lớp text của trang PDF (xem pdfImport.ts) — gửi kèm ảnh để AI dùng làm cơ sở, không cần tự OCR lại phần chữ. */
  pageText?: string;
}

/** Tiền tố đánh dấu 1 dòng warning là lỗi thật của cả đợt (không phải ghi chú nội dung bình thường của AI) — dùng để đếm/lọc bằng máy mà vẫn đọc được bằng mắt. */
export const CHUNK_ERROR_PREFIX = "[LỖI ĐỢT]";

function emptyParsedExamWithError(pageNumbers: number[] | undefined, reason: string): ParsedExam {
  const rangeLabel = pageNumbers?.length
    ? pageNumbers.length === 1
      ? `Trang ${pageNumbers[0]}`
      : `Trang ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`
    : "1 đợt";
  return {
    part1: [],
    part2: [],
    part3: [],
    warnings: [`${CHUNK_ERROR_PREFIX} ${rangeLabel}: ${reason}`],
  };
}

/**
 * Gửi 1 đợt ảnh trang (đã trong giới hạn cho phép) cho Gemini phân tích.
 * LUÔN trả về 1 ParsedExam (không trả null nữa) — nếu đợt này lỗi, trả về đề
 * rỗng kèm 1 dòng "warnings" ghi rõ lý do (thay vì mất trắng thông tin lỗi),
 * để giáo viên biết chính xác chuyện gì xảy ra thay vì chỉ thấy "có lỗi"
 * chung chung, và để các đợt khác vẫn gộp kết quả bình thường.
 */
export async function parseExamFromImages(
  pageImages: PageImageInput[],
  pageNumbers?: number[],
  topics: Topic[] = [],
  lessons: Lesson[] = [],
  // PHASE 0 (01/09/2026) — 2 tham số OPTIONAL cuối, chỉ dùng để đo benchmark
  // khi Thầy Tường tự bật debug (xem importBenchmark.ts). Không truyền gì thì
  // hàm chạy y hệt trước đây.
  benchmark?: ImportBenchmarkRecorder,
  benchmarkLabel?: string,
  // THÊM 01/09/2026 — Giai đoạn 1a: khung Phần/Câu đã dò được BẰNG QUY TẮC
  // (xem examGrammar.ts) cho ĐÚNG các trang trong đợt này, CHỈ truyền khi dò
  // chắc chắn (structureConfident = true) trên toàn bộ đề — xem
  // parseExamFromPdfPages. Khi có, chèn thêm 1 khối văn bản vào prompt để AI
  // đỡ phải tự tìm ranh giới câu, chỉ cần điền công thức/đáp án đúng khung có
  // sẵn — không đổi bất kỳ hành vi nào khác của prompt gốc.
  structureHint?: DetectedQuestion[],
): Promise<ParsedExam> {
  const parts: GeminiPart[] = [{ text: buildExamParseFromImagesPrompt(topics, lessons) }];
  if (structureHint && structureHint.length > 0) {
    parts.push({ text: buildStructureScaffold(structureHint) });
  }
  pageImages.forEach((img, i) => {
    const label = pageNumbers?.[i] ?? i + 1;
    const textBlock = img.pageText?.trim()
      ? img.pageText.trim()
      : "(trang này không trích được văn bản — đọc hoàn toàn từ ảnh)";
    parts.push({
      text: `\nVăn bản trang ${label} (đã trích chính xác 100%, dùng làm CƠ SỞ):\n"""\n${textBlock}\n"""\nẢnh chụp trang ${label}:`,
    });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  });

  // THÊM 25/08/2026: nâng từ 8192 lên 16384 — gặp thật trường hợp 1 đợt 6
  // trang đề (nhiều câu Phần 1/2/3 + lời giải LaTeX) vượt quá 8192 token, bị
  // Google cắt ngang giữa chừng (finishReason "MAX_TOKENS") làm JSON hỏng,
  // mất trắng cả đợt dù nội dung AI đọc được thực ra đúng. Cả 2 model đều hỗ
  // trợ tới 65536 token/lượt trả lời nên còn nhiều dư địa để nâng thêm nếu
  // vẫn gặp lại.
  const { text: raw, errorMessage, truncated } = await callGeminiPartsDetailed(
    parts,
    16384,
    1,
    GEMINI_MODEL,
    GEMINI_MAX_ATTEMPTS,
    false,
    benchmark,
    benchmarkLabel,
  );
  if (!raw) {
    return emptyParsedExamWithError(pageNumbers, errorMessage ?? "AI không trả lời.");
  }

  try {
    const jsonParseStart = nowMs();
    const parsed = extractJsonBlock(raw) as Partial<ParsedExam>;
    benchmark?.recordJsonParse(nowMs() - jsonParseStart);
    return {
      part1: Array.isArray(parsed.part1) ? parsed.part1 : [],
      part2: Array.isArray(parsed.part2) ? parsed.part2 : [],
      part3: Array.isArray(parsed.part3) ? parsed.part3 : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    console.error("Không đọc được JSON từ AI khi phân tích ảnh trang PDF:", err, raw);
    return emptyParsedExamWithError(
      pageNumbers,
      truncated
        ? "AI bị cắt ngang do vượt giới hạn độ dài phản hồi (đợt này có quá nhiều câu/công thức dài) — thử lại, hoặc báo lại nếu vẫn lặp lại nhiều lần."
        : "AI trả lời nhưng không đúng định dạng JSON mong đợi.",
    );
  }
}

/** Gộp nhiều kết quả phân tích (nhiều đợt gửi) thành 1 đề duy nhất, giữ đúng thứ tự đợt. */
export function mergeParsedExams(results: ParsedExam[]): ParsedExam {
  return results.reduce<ParsedExam>(
    (acc, r) => ({
      part1: [...acc.part1, ...r.part1],
      part2: [...acc.part2, ...r.part2],
      part3: [...acc.part3, ...r.part3],
      warnings: [...acc.warnings, ...r.warnings],
    }),
    { part1: [], part2: [], part3: [], warnings: [] },
  );
}

/** Trả về true nếu kết quả 1 đợt là ĐỢT LỖI (có warning gắn tiền tố CHUNK_ERROR_PREFIX) — dùng để quyết định đợt nào cần gọi lại AI khi thử lại 1 phần (xem planChunkRetries). */
export function isChunkResultFailed(result: ParsedExam): boolean {
  return result.warnings.some((w) => w.startsWith(CHUNK_ERROR_PREFIX));
}

/**
 * Lập kế hoạch gọi lại AI khi THỬ LẠI SAU KHI CÓ ĐỢT LỖI (thêm 31/08/2026):
 * trả về mảng boolean cùng độ dài `chunkCount`, true tại vị trí CẦN gọi lại
 * AI (chưa từng chạy, hoặc lần trước bị lỗi), false tại vị trí có thể tái sử
 * dụng nguyên kết quả cũ (đã đọc thành công) — đỡ tốn thêm thời gian VÀ hạn
 * mức 20 lượt gọi/ngày của free tier cho những đợt vốn đã đúng. Hàm thuần,
 * tách riêng để unit-test không cần mạng thật.
 */
export function planChunkRetries(
  chunkCount: number,
  previousResults?: (ParsedExam | undefined)[],
): boolean[] {
  return Array.from({ length: chunkCount }, (_, i) => {
    const prev = previousResults?.[i];
    if (!prev) return true;
    return isChunkResultFailed(prev);
  });
}

/**
 * Số đợt (chunk) được phép gọi AI ĐỒNG THỜI khi tạo đề từ PDF, thay vì chạy
 * TUẦN TỰ từng đợt một như trước 31/08/2026 (đợt sau phải chờ đợt trước xong
 * hẳn mới bắt đầu — cộng dồn thời gian chờ của MỌI đợt, kể cả khi 1 đợt bị
 * chậm/phải thử lại do 503). CHƯA kiểm chứng được giới hạn RPM (request/phút)
 * thật của gói Gemini free tier từ sandbox (giới hạn mạng — xem mục 6 tài
 * liệu đề xuất kỹ thuật), nên chọn 2 làm mức an toàn/vừa phải: giảm đáng kể
 * thời gian chờ với đề nhiều đợt mà không dội quá nhiều request cùng lúc dễ
 * gây thêm lỗi 429. Có thể thử nâng lên 3 nếu thực tế vẫn ổn định.
 */
const PDF_CHUNK_CONCURRENCY = 2;

export interface ParseFromPdfResult {
  /** null CHỈ khi không có đợt nào thành công (0 câu hỏi nào đọc được) — xem "chunkErrors" để biết lý do cụ thể từng đợt. */
  parsed: ParsedExam | null;
  /** Số đợt (chunk) gọi AI bị lỗi — 0 nghĩa là mọi đợt đều thành công. */
  failedChunks: number;
  totalChunks: number;
  /** Lý do cụ thể của từng đợt bị lỗi (đã bóc khỏi CHUNK_ERROR_PREFIX), để hiện thẳng cho giáo viên thay vì chỉ nói chung chung "có lỗi". */
  chunkErrors: string[];
  /** Kết quả THÔ của từng đợt, theo đúng thứ tự — truyền lại vào `previousResults` của lần gọi sau để THỬ LẠI CHỈ ĐÚNG CÁC ĐỢT LỖI (xem planChunkRetries). */
  chunkResults: ParsedExam[];
}

/**
 * Phân tích đề từ danh sách ảnh trang PDF, tự chia thành nhiều đợt gọi AI
 * (mặc định 6 trang/đợt — nhỏ hơn hẳn 1 lần gọi cho cả đề dài, để mỗi đợt trả
 * lời nhanh hơn, đỡ có cảm giác "đứng hình" lâu, và nếu 1 đợt bị lỗi/timeout
 * thì các đợt còn lại vẫn tiếp tục chạy thay vì mất trắng toàn bộ).
 *
 * ĐỔI 31/08/2026: các đợt giờ chạy ĐỒNG THỜI tối đa PDF_CHUNK_CONCURRENCY đợt
 * 1 lúc (worker pool qua mapWithConcurrency), thay vì tuần tự từng đợt một
 * như trước — giảm đáng kể tổng thời gian chờ với đề nhiều đợt (vd. đề 3 đợt,
 * mỗi đợt ~20-40s: trước ~60-120s cộng dồn, giờ gần bằng thời gian 1 đợt chậm
 * nhất trong 2 đợt chạy cùng lúc). Ghép kết quả các đợt lại theo ĐÚNG thứ tự
 * trang bất kể đợt nào xong trước (mapWithConcurrency đảm bảo thứ tự). Nếu đề
 * dài phải chia đợt, 1 câu hỏi lỡ nằm vắt ngang ranh giới 2 trang ở đúng điểm
 * chia có thể bị đọc thiếu — trường hợp này hiếm nhưng giáo viên vẫn cần xem
 * lại ở bước xác nhận.
 *
 * `previousResults` (thêm 31/08/2026): truyền vào `chunkResults` của LẦN GỌI
 * TRƯỚC (nếu có) để THỬ LẠI CHỈ ĐÚNG CÁC ĐỢT LỖI — đợt nào lần trước đã đọc
 * thành công được tái sử dụng nguyên vẹn, không gọi lại AI (xem planChunkRetries).
 */
export async function parseExamFromPdfPages(
  pageImages: PageImageInput[],
  chunkSize = 6,
  onProgress?: (done: number, total: number) => void,
  topics: Topic[] = [],
  lessons: Lesson[] = [],
  previousResults?: (ParsedExam | undefined)[],
  // PHASE 0 (01/09/2026) — optional, chỉ để ghi benchmark (xem importBenchmark.ts). Không truyền gì thì chạy y hệt trước đây.
  benchmark?: ImportBenchmarkRecorder,
): Promise<ParseFromPdfResult> {
  const pageNumberChunks = chunkArray(
    pageImages.map((_, i) => i + 1),
    chunkSize,
  );
  const imageChunks = chunkArray(pageImages, chunkSize);
  const retryPlan = planChunkRetries(imageChunks.length, previousResults);

  // THÊM 01/09/2026 — Giai đoạn 1a: dò cấu trúc đề (Phần/Câu/nhãn đáp án) MỘT
  // LẦN DUY NHẤT trên TOÀN BỘ các trang, TRƯỚC khi chia đợt — bắt buộc phải
  // dò trên toàn văn bản (không phải từng đợt riêng) vì 1 câu có thể vắt
  // ngang ranh giới 2 đợt, và việc đánh giá "structureConfident" phải xét
  // toàn đề để an toàn (xem examGrammar.ts). Nếu dò KHÔNG chắc chắn (thiếu
  // nhãn đáp án ở bất kỳ đâu, sai thứ tự Phần, v.v.) thì bỏ qua hoàn toàn —
  // mọi đợt gọi AI chạy y hệt hành vi trước đây, không có scaffold nào được
  // chèn vào prompt.
  const structurePages: StructurePage[] = pageImages.map((img, i) => ({
    pageNumber: i + 1,
    pageText: img.pageText ?? "",
  }));
  const structure = detectExamStructure(structurePages);
  benchmark?.recordStructureConfidence(structure.structureConfident);
  const allDetectedQuestions: DetectedQuestion[] = structure.structureConfident
    ? structure.sections.flatMap((s) => s.questions)
    : [];

  let doneCount = 0;
  const results = await mapWithConcurrency(imageChunks, PDF_CHUNK_CONCURRENCY, async (chunk, i) => {
    let r: ParsedExam;
    if (retryPlan[i]) {
      const chunkPageNumbers = pageNumberChunks[i];
      const structureHint =
        allDetectedQuestions.length > 0
          ? allDetectedQuestions.filter((q) => chunkPageNumbers.includes(q.pageNumber))
          : undefined;
      r = await parseExamFromImages(
        chunk,
        chunkPageNumbers,
        topics,
        lessons,
        benchmark,
        `batch-${i + 1}`,
        structureHint,
      );
    } else {
      // planChunkRetries chỉ trả false khi previousResults[i] tồn tại VÀ đã
      // thành công ở lần gọi trước — an toàn tái sử dụng, không gọi lại AI.
      r = previousResults?.[i] as ParsedExam;
    }
    doneCount += 1;
    onProgress?.(doneCount, imageChunks.length);
    return r;
  });

  const chunkErrors = results
    .flatMap((r) => r.warnings)
    .filter((w) => w.startsWith(CHUNK_ERROR_PREFIX))
    .map((w) => w.slice(CHUNK_ERROR_PREFIX.length).trim());
  const failedChunks = chunkErrors.length;

  const merged = mergeParsedExams(results);
  // Bóc các dòng "[LỖI ĐỢT] ..." ra khỏi warnings hiện cho giáo viên — thông
  // tin lỗi đã có sẵn (đọc được) trong chunkErrors, không cần lộ tiền tố kỹ
  // thuật này ra màn hình xem trước.
  merged.warnings = merged.warnings.filter((w) => !w.startsWith(CHUNK_ERROR_PREFIX));
  const totalQuestions = merged.part1.length + merged.part2.length + merged.part3.length;

  if (totalQuestions === 0 && failedChunks > 0) {
    // Không đợt nào đọc được câu hỏi nào — coi là thất bại toàn bộ, để giáo
    // viên biết ngay thay vì thấy màn hình xem trước trống trơn khó hiểu.
    return { parsed: null, failedChunks, totalChunks: imageChunks.length, chunkErrors, chunkResults: results };
  }
  if (failedChunks > 0) {
    merged.warnings = [
      `${failedChunks}/${imageChunks.length} đợt gọi AI bị lỗi — 1 số trang có thể chưa được phân tích, kiểm tra lại số câu trước khi xuất bản: ${chunkErrors.join(" | ")}`,
      ...merged.warnings,
    ];
  }
  return { parsed: merged, failedChunks, totalChunks: imageChunks.length, chunkErrors, chunkResults: results };
}

// ---------------------------------------------------------------------------
// Bước A (Learning Lab, chốt 24/08/2026) — xây taxonomy "dạng bài" từ tài liệu
// tham khảo giáo viên tự soạn ("tài liệu dạng bài tập") — KHÁC hẳn đề thi ở
// trên: tài liệu này thường trình bày lý thuyết rồi đến mục phân loại với các
// tiêu đề "Dạng 1: ...", "Dạng 2: ..." kèm phương pháp giải + bài tập ví dụ đã
// có lời giải, còn đề thi thật (upload ở TeacherExamImport) thì KHÔNG mang
// thông tin dạng bài. AI ở đây chỉ TRÍCH XUẤT danh sách dạng đã có sẵn trong
// tài liệu (không tự bịa dạng mới) — giáo viên luôn xem lại/sửa/xoá từng dạng
// trước khi ghi vào question_types (đúng nguyên tắc "AI gợi ý, giáo viên
// duyệt" xuyên suốt hệ thống, giống hệt cách xác nhận chương ở
// TeacherQuestionBank.tsx). Dùng lại đúng cơ chế 2 nguồn dữ liệu song song
// (văn bản thật từ pdf.js + ảnh từng trang) và cách chia đợt/báo lỗi theo đợt
// như parseExamFromImages ở trên, vì đây cũng là nội dung Toán có công thức/
// bảng biến thiên cần đọc từ ảnh, và tài liệu có thể dài nhiều trang.
// ---------------------------------------------------------------------------

export interface ExtractedQuestionTypeCandidate {
  name: string;
  description: string;
  /** Tóm tắt cực ngắn 1 ví dụ tiêu biểu của dạng này trong tài liệu (không phải lời giải đầy đủ) — giúp giáo viên nhận ra ngay dạng khi duyệt. null nếu tài liệu không có ví dụ rõ ràng. */
  example_summary: string | null;
}

export interface ExtractedTaxonomy {
  candidates: ExtractedQuestionTypeCandidate[];
  warnings: string[];
}

function buildQuestionTypeExtractionPrompt(topicName: string | null): string {
  return `Bạn là trợ lý biên tập tài liệu Toán THPT (Việt Nam, chương trình GDPT 2018). Dưới đây là dữ liệu từng trang của 1 tài liệu "dạng bài tập" do giáo viên tự soạn${topicName ? ` cho chương "${topicName}"` : ""} — KHÁC với đề thi, tài liệu này thường trình bày: phần lý thuyết, rồi đến phần phân loại theo "Dạng 1: ...", "Dạng 2: ..." kèm phương pháp giải và bài tập ví dụ đã có lời giải.

Mỗi trang gồm 2 phần: văn bản thật trích từ lớp text của PDF (tin tưởng hoàn toàn phần chữ), và ảnh chụp cả trang ngay sau đó (chỉ dùng để đọc công thức/bảng biến thiên đã thành hình và phần văn bản bị thiếu).

NHIỆM VỤ: liệt kê TOÀN BỘ các "dạng bài" xuất hiện trong tài liệu này. Với mỗi dạng:
1. "name": tên dạng — LẤY NGUYÊN VĂN nếu tài liệu có ghi rõ tiêu đề kiểu "Dạng N: ..." (bỏ phần số thứ tự "Dạng N:", chỉ giữ tên). Nếu tài liệu KHÔNG có tiêu đề "Dạng..." rõ ràng, tự nhóm các bài tập có chung cách giải/phương pháp thành 1 dạng rồi đặt tên ngắn gọn, đúng cách gọi thường dùng khi dạy.
2. "description": mô tả ngắn gọn (1-2 câu) đặc điểm nhận diện dạng này — dựa theo phần "phương pháp giải" nếu tài liệu có ghi, không tự bịa phương pháp không có trong tài liệu.
3. "example_summary": tóm tắt CỰC NGẮN (1 câu) 1 bài tập ví dụ tiêu biểu của dạng này trong tài liệu (không cần chép lại đề đầy đủ hay lời giải) — hoặc null nếu tài liệu không có ví dụ rõ ràng cho dạng đó.

QUAN TRỌNG: chỉ liệt kê dạng bài THẬT SỰ CÓ trong tài liệu này — không suy diễn thêm dạng không xuất hiện. Nếu tài liệu chỉ có 1 dạng duy nhất (thường gặp khi file được đặt tên kiểu "Bài X_Dạng Y..."), trả về đúng 1 phần tử trong "candidates".

Liệt kê vào "warnings" (mảng chuỗi tiếng Việt ngắn) bất kỳ điều gì không chắc chắn: tài liệu trình bày không rõ ranh giới giữa các dạng, thiếu phần phương pháp giải, trang bị thiếu/mờ, v.v.

QUAN TRỌNG VỀ ĐỊNH DẠNG JSON: dấu chéo ngược '\' của LaTeX (nếu xuất hiện trong description/example_summary) PHẢI viết thành HAI dấu chéo ngược liên tiếp '\\' để là JSON hợp lệ. Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "candidates": [{"name": "...", "description": "...", "example_summary": "..." | null}],
  "warnings": ["..."]
}`;
}

/** Trích taxonomy dạng bài từ 1 đợt trang PDF (đã trong giới hạn cho phép) — cùng cách báo lỗi-theo-đợt như parseExamFromImages, để 1 đợt lỗi không làm mất trắng các đợt còn lại. */
export async function extractQuestionTypesFromImages(
  pageImages: PageImageInput[],
  topicName: string | null = null,
  pageNumbers?: number[],
): Promise<ExtractedTaxonomy> {
  const parts: GeminiPart[] = [{ text: buildQuestionTypeExtractionPrompt(topicName) }];
  pageImages.forEach((img, i) => {
    const label = pageNumbers?.[i] ?? i + 1;
    const textBlock = img.pageText?.trim()
      ? img.pageText.trim()
      : "(trang này không trích được văn bản — đọc hoàn toàn từ ảnh)";
    parts.push({
      text: `\nVăn bản trang ${label} (đã trích chính xác 100%, dùng làm CƠ SỞ):\n"""\n${textBlock}\n"""\nẢnh chụp trang ${label}:`,
    });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  });

  const rangeLabel = pageNumbers?.length
    ? pageNumbers.length === 1
      ? `Trang ${pageNumbers[0]}`
      : `Trang ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}`
    : "1 đợt";

  // Nâng từ 4096 lên 8192 cùng lý do với parseExamFromImages (đợt dài dễ bị
  // cắt ngang do chạm giới hạn maxOutputTokens) — tài liệu dạng bài thường
  // ngắn hơn đề thi nhưng vẫn có thể dài nếu gộp nhiều dạng/ví dụ trong 1 file.
  const { text: raw, errorMessage, truncated } = await callGeminiPartsDetailed(parts, 8192);
  if (!raw) {
    return {
      candidates: [],
      warnings: [`${CHUNK_ERROR_PREFIX} ${rangeLabel}: ${errorMessage ?? "AI không trả lời."}`],
    };
  }

  try {
    const parsed = extractJsonBlock(raw) as Partial<ExtractedTaxonomy>;
    return {
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    console.error("Không đọc được JSON từ AI khi trích taxonomy dạng bài:", err, raw);
    return {
      candidates: [],
      warnings: [
        `${CHUNK_ERROR_PREFIX} ${rangeLabel}: ${
          truncated
            ? "AI bị cắt ngang do vượt giới hạn độ dài phản hồi."
            : "AI trả lời nhưng không đúng định dạng JSON mong đợi."
        }`,
      ],
    };
  }
}

/** Gộp nhiều kết quả trích taxonomy (nhiều đợt gửi) thành 1 danh sách duy nhất, giữ đúng thứ tự đợt — KHÔNG tự khử trùng lặp ở đây, việc gộp/loại trùng tên dạng do giáo viên quyết định ở bước duyệt trên UI. */
export function mergeExtractedTaxonomies(results: ExtractedTaxonomy[]): ExtractedTaxonomy {
  return results.reduce<ExtractedTaxonomy>(
    (acc, r) => ({
      candidates: [...acc.candidates, ...r.candidates],
      warnings: [...acc.warnings, ...r.warnings],
    }),
    { candidates: [], warnings: [] },
  );
}

export interface ExtractQuestionTypesResult {
  /** null CHỈ khi không đợt nào thành công (0 dạng nào đọc được) — xem "chunkErrors" để biết lý do cụ thể từng đợt. */
  taxonomy: ExtractedTaxonomy | null;
  failedChunks: number;
  totalChunks: number;
  chunkErrors: string[];
}

/**
 * Trích taxonomy dạng bài từ toàn bộ tài liệu (nhiều trang PDF), tự chia đợt
 * giống hệt parseExamFromPdfPages. Tài liệu dạng bài tập thường ngắn hơn hẳn 1
 * đề thi (mỗi file thường ứng với 1 dạng) nên phần lớn chỉ cần 1 đợt duy nhất,
 * nhưng vẫn chia đợt để an toàn với tài liệu dài hơn (nhiều dạng gộp 1 file).
 */
export async function extractQuestionTypesFromPdfPages(
  pageImages: PageImageInput[],
  topicName: string | null = null,
  chunkSize = 10,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractQuestionTypesResult> {
  const pageNumberChunks = chunkArray(
    pageImages.map((_, i) => i + 1),
    chunkSize,
  );
  const imageChunks = chunkArray(pageImages, chunkSize);

  const results: ExtractedTaxonomy[] = [];
  for (let i = 0; i < imageChunks.length; i++) {
    const r = await extractQuestionTypesFromImages(imageChunks[i], topicName, pageNumberChunks[i]);
    results.push(r);
    onProgress?.(i + 1, imageChunks.length);
  }

  const chunkErrors = results
    .flatMap((r) => r.warnings)
    .filter((w) => w.startsWith(CHUNK_ERROR_PREFIX))
    .map((w) => w.slice(CHUNK_ERROR_PREFIX.length).trim());
  const failedChunks = chunkErrors.length;

  const merged = mergeExtractedTaxonomies(results);
  merged.warnings = merged.warnings.filter((w) => !w.startsWith(CHUNK_ERROR_PREFIX));

  if (merged.candidates.length === 0 && failedChunks > 0) {
    return { taxonomy: null, failedChunks, totalChunks: imageChunks.length, chunkErrors };
  }
  if (failedChunks > 0) {
    merged.warnings = [
      `${failedChunks}/${imageChunks.length} đợt gọi AI bị lỗi — kiểm tra lại danh sách dạng trước khi lưu: ${chunkErrors.join(" | ")}`,
      ...merged.warnings,
    ];
  }
  return { taxonomy: merged, failedChunks, totalChunks: imageChunks.length, chunkErrors };
}

/** Đường dự phòng đọc từ .docx (mammoth.js) — cùng nguyên tắc như parseExamFromDocument, ưu tiên dùng đường PDF ở trên khi có thể vì chính xác hơn với công thức/bảng biến thiên. */
export async function extractQuestionTypesFromDocument(
  plainText: string,
  images: ExtractedImage[],
  topicName: string | null = null,
): Promise<ExtractedTaxonomy> {
  const parts: GeminiPart[] = [
    {
      text:
        buildQuestionTypeExtractionPrompt(topicName) +
        `\n\nVăn bản tài liệu (in đậm được đánh dấu bằng **...**):\n"""\n` +
        plainText +
        '\n"""',
    },
  ];
  for (const img of images) {
    parts.push({ text: `\nHình ảnh cho placeholder ${img.placeholder}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }

  const { text: raw, errorMessage, truncated } = await callGeminiPartsDetailed(parts, 8192);
  if (!raw) {
    return { candidates: [], warnings: [errorMessage ?? "AI không trả lời."] };
  }
  try {
    const parsed = extractJsonBlock(raw) as Partial<ExtractedTaxonomy>;
    return {
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    console.error("Không đọc được JSON từ AI khi trích taxonomy dạng bài (docx):", err, raw);
    return {
      candidates: [],
      warnings: [
        truncated
          ? "AI bị cắt ngang do vượt giới hạn độ dài phản hồi."
          : "AI trả lời nhưng không đúng định dạng JSON mong đợi.",
      ],
    };
  }
}
