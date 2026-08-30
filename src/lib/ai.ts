/**
 * Tích hợp AI (Gemini) — gọi thẳng từ trình duyệt bằng free tier.
 * Hai việc AI hỗ trợ, đúng như yêu cầu ban đầu:
 *  1) Gợi ý gán dạng bài khi giáo viên nhập câu hỏi mới (giáo viên luôn là người
 *     duyệt/xác nhận cuối cùng — AI không tự ý ghi đè ngân hàng câu hỏi).
 *  2) Tổng hợp nhận xét bằng lời cho báo cáo định kỳ, dựa trên số liệu đã tính sẵn
 *     (AI không tự tính điểm, chỉ diễn giải số liệu thành lời văn).
 */

import type { QuestionType, Topic } from "./types";
import { chunkArray } from "./chunk";
import { mapWithConcurrency } from "./concurrency";

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
// ĐỔI LẠI 30/08/2026 (ĐỔI VAI TRÒ 2 MODEL): thực tế dùng nhiều lần cho thấy
// "gemini-3.7-flash" gần như LUÔN trả 503 UNAVAILABLE ở gói miễn phí — nghĩa
// là mỗi đợt phân tích đều phải đốt 3 lần gọi hỏng + ~11 giây chờ giữa các
// lần rồi mới chịu chuyển sang model dự phòng. Đó là thời gian chờ VÔ ÍCH
// cộng vào MỌI đợt, và là nguyên nhân chính khiến import 1 đề mất vài phút.
// Model thật sự chạy được là "3.6-flash" (vốn đang nằm ở vai dự phòng), nên
// đảo vai trò: "3.6-flash" làm CHÍNH, "3.7-flash" lùi về dự phòng (vẫn giữ
// vì hạn mức free tier tính RIÊNG từng model — khi 3.6 hết lượt/ngày thì 3.7
// còn nguyên lượt của nó, đáng thử nốt trước khi báo lỗi hẳn).
const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || "gemini-3.6-flash";
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
  "gemini-3.7-flash";

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
// GIẢM 30/08/2026: 90s là quá dài. Vì các đợt giờ chạy SONG SONG (xem
// parseExamFromPdfPages) và mỗi đợt chỉ còn 4 trang + KHÔNG trích lời giải,
// 1 đợt bình thường trả lời trong ~10-20s. Đợt nào quá 45s gần như chắc chắn
// là đã hỏng/treo, chờ tiếp chỉ tốn thời gian — huỷ sớm rồi thử lại nhanh
// tổng cộng vẫn nhanh hơn ngồi đợi hết 90s.
const GEMINI_TIMEOUT_MS = 45_000;

/**
 * Google thỉnh thoảng trả lỗi 503 "quá tải" hoặc 429 "vượt giới hạn tốc độ"
 * — đây là lỗi TẠM THỜI theo đúng thông báo của Google, tự thử lại sau vài
 * giây thường sẽ qua. Không thử lại quá nhiều lần để tránh treo lâu vô ích.
 */
const GEMINI_MAX_ATTEMPTS = 3;
// GIẢM 30/08/2026: từ [3000, 8000] xuống [1200, 3000]. Chờ 11 giây cho MỖI
// đợt trước khi chịu đổi model là quá đắt khi model chính đang hỏng hàng
// loạt; 503 do quá tải tức thời thường qua ngay ở nhịp thử lại kế tiếp, chờ
// lâu hơn không làm tăng tỉ lệ thành công tương xứng.
const GEMINI_RETRY_DELAYS_MS = [1200, 3000];
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
}

/**
 * Các mảnh có thể có trong 1 câu trả lời của Gemini. Model đời mới có thể trả
 * về NHIỀU mảnh, và mảnh "suy nghĩ nội bộ" (thought) không phải nội dung trả
 * lời — xem extractCandidateText() ngay bên dưới.
 */
export interface GeminiCandidatePart {
  text?: string;
  thought?: boolean;
}
export interface GeminiCandidate {
  content?: { parts?: GeminiCandidatePart[] };
  finishReason?: string;
}

/**
 * SỬA LỖI 30/08/2026 — đây là nguyên nhân thật của lỗi "AI trả lời rỗng,
 * không có nội dung để đọc" làm MẤT TRẮNG cả 1 đợt (6 trang đề) dù Google trả
 * về HTTP 200 bình thường.
 *
 * Code cũ đọc đúng MỘT chỗ duy nhất: candidates[0].content.parts[0].text.
 * Cách đọc đó chỉ đúng với model đời cũ luôn trả về đúng 1 mảnh văn bản. Model
 * đời mới (dòng 3.x có cơ chế "thinking") có thể trả về:
 *   - nhiều mảnh văn bản liên tiếp, cần GHÉP lại mới thành câu trả lời đầy đủ;
 *   - hoặc mảnh đầu tiên là phần "suy nghĩ" (thought: true) chứ không phải nội
 *     dung, thậm chí là mảnh KHÔNG có khoá text nào cả.
 * Cả 2 trường hợp đều làm parts[0].text ra rỗng → code cũ kết luận "AI trả
 * lời rỗng" và VỨT NGUYÊN ĐỢT, dù dữ liệu thật vẫn nằm ở các mảnh sau.
 *
 * Hàm này ghép TOÀN BỘ mảnh văn bản (bỏ qua mảnh suy nghĩ nội bộ) theo đúng
 * thứ tự. Tách thành hàm thuần để unit-test được mà không cần gọi API thật.
 */
export function extractCandidateText(candidate: GeminiCandidate | undefined): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p?.thought !== true && typeof p?.text === "string")
    .map((p) => p.text as string)
    .join("")
    .trim();
}

/**
 * Diễn giải finishReason khi Google dừng câu trả lời vì lý do KHÁC "xong bình
 * thường" (STOP) và "quá dài" (MAX_TOKENS). Code cũ không đọc trường này nên
 * mọi trường hợp bị chặn đều hiện ra cùng một câu "AI trả lời rỗng" vô nghĩa,
 * không có cách nào biết vì sao để mà xử lý.
 * retriable=false nghĩa là thử lại y hệt cũng vô ích (bị chặn nội dung), đừng
 * tốn thêm thời gian chờ.
 */
function describeFinishReason(
  reason: string | undefined,
): { message: string; retriable: boolean } | null {
  switch (reason) {
    case "SAFETY":
      return {
        message:
          "Google chặn câu trả lời vì bộ lọc an toàn (SAFETY) — thường do 1 trang có hình/chữ bị hiểu nhầm. Thử tách riêng các trang đó ra rồi tải lại.",
        retriable: false,
      };
    case "RECITATION":
      return {
        message:
          "Google chặn câu trả lời vì nghi trùng nguồn có bản quyền (RECITATION) — thử lại, nếu vẫn lặp lại thì tách nhỏ file ra.",
        retriable: false,
      };
    case "PROHIBITED_CONTENT":
    case "BLOCKLIST":
    case "SPII":
      return {
        message: `Google chặn câu trả lời cho đợt này (${reason}).`,
        retriable: false,
      };
    case "OTHER":
      return {
        message: "Google dừng câu trả lời không rõ lý do (OTHER) — thường là lỗi tạm thời.",
        retriable: true,
      };
    default:
      return null;
  }
}

interface GeminiCallOptions {
  /** Lần thử thứ mấy cho lỗi HTTP tạm thời (503/timeout) ở model hiện tại. */
  attempt?: number;
  model?: string;
  /**
   * Số lần thử tối đa CHO MODEL HIỆN TẠI của lệnh gọi này (không tính đợt dự
   * phòng riêng) — model dự phòng dùng số lần thử ít hơn
   * (GEMINI_FALLBACK_MAX_ATTEMPTS) để không kéo dài gấp đôi thời gian chờ khi
   * cả 2 model đều đang có vấn đề.
   */
  maxAttemptsForModel?: number;
  /** true khi lệnh gọi này đã là đợt dùng model dự phòng — để không dự phòng lồng dự phòng (chỉ đổi model đúng 1 lần). */
  isFallback?: boolean;
  /**
   * true (mặc định) = gửi kèm 2 tuỳ chọn mới giúp nhanh và chắc hơn hẳn:
   * thinkingConfig.thinkingBudget = 0 và responseMimeType application/json
   * (xem chỗ dùng bên dưới). Tự đặt lại thành false và gọi lại đúng 1 lần nếu
   * Google trả 400 — phòng trường hợp model đang cấu hình không hiểu 2 tuỳ
   * chọn này, để không làm chết hẳn đường import chỉ vì tên model thay đổi.
   */
  useModernConfig?: boolean;
  /** Số lần đã thử lại RIÊNG cho trường hợp trả lời rỗng (khác hẳn lỗi HTTP). */
  emptyRetry?: number;
  /**
   * true = lệnh gọi này MONG ĐỢI câu trả lời là JSON, nên bật chế độ JSON
   * thuần của Google (responseMimeType). MẶC ĐỊNH false vì KHÔNG phải lệnh
   * gọi nào cũng cần JSON: generateReportSummary() xin về 1 ĐOẠN VĂN nhận xét
   * gửi phụ huynh — ép nó trả JSON thì hỏng hẳn tính năng đó. Chỉ bật ở các
   * chỗ thật sự đọc kết quả bằng JSON.parse().
   */
  expectJson?: boolean;
}

/**
 * Trả lời rỗng gần như luôn là trục trặc nhất thời phía Google (đợt y hệt gọi
 * lại thường ra kết quả bình thường). Code cũ KHÔNG thử lại lần nào trong
 * trường hợp này — mất trắng nguyên đợt. Cho thử lại, nhưng chỉ 1 lần để
 * không kéo dài thời gian chờ.
 */
const GEMINI_MAX_EMPTY_RETRIES = 1;

async function callGeminiPartsDetailed(
  parts: GeminiPart[],
  maxOutputTokens: number,
  opts: GeminiCallOptions = {},
): Promise<GeminiCallResult> {
  const {
    attempt = 1,
    model = GEMINI_MODEL,
    maxAttemptsForModel = GEMINI_MAX_ATTEMPTS,
    isFallback = false,
    useModernConfig = true,
    emptyRetry = 0,
    expectJson = false,
  } = opts;

  if (!GEMINI_API_KEY) {
    return { text: null, errorMessage: "Thiếu VITE_GEMINI_API_KEY — chưa cấu hình API key cho AI." };
  }

  /** Gọi lại chính hàm này với model dự phòng — gom 1 chỗ vì có 3 nhánh cần dùng. */
  const retryWithFallbackModel = () =>
    callGeminiPartsDetailed(parts, maxOutputTokens, {
      model: GEMINI_FALLBACK_MODEL,
      maxAttemptsForModel: GEMINI_FALLBACK_MAX_ATTEMPTS,
      isFallback: true,
      useModernConfig,
      expectJson,
    });
  const canFallBack = !isFallback && model !== GEMINI_FALLBACK_MODEL;

  const generationConfig: Record<string, unknown> = { temperature: 0.2, maxOutputTokens };
  if (useModernConfig) {
    // TẮT HẲN "THINKING" (30/08/2026) — thay đổi có tác động lớn nhất tới tốc
    // độ. Model dòng 3.x mặc định tự "suy nghĩ" trước khi trả lời: phần suy
    // nghĩ đó vừa CHIẾM THỜI GIAN (thường gấp 2-3 lần thời gian trả lời), vừa
    // ĂN VÀO chính hạn mức maxOutputTokens gửi lên — nên có trường hợp model
    // nghĩ hết sạch token rồi không còn chỗ viết câu trả lời, trả về đúng một
    // câu trả lời RỖNG (chính là lỗi đã gặp). Việc ở đây là bóc dữ liệu có
    // cấu trúc từ văn bản + ảnh đã cho sẵn, không phải bài toán cần suy luận
    // nhiều bước — tắt thinking gần như không ảnh hưởng chất lượng mà nhanh
    // hơn hẳn.
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
    // BẮT TRẢ VỀ JSON THUẦN (30/08/2026), chỉ ở những lệnh gọi thật sự đọc
    // kết quả bằng JSON.parse (xem GeminiCallOptions.expectJson): Google tự
    // đảm bảo đầu ra là JSON hợp lệ, không bọc trong code fence, không kèm
    // lời dẫn "Đây là kết quả:..." — bỏ được phần lớn rủi ro hỏng JSON khiến
    // mất cả đợt. extractJsonBlock() và sanitizeJsonEscapes() vẫn giữ nguyên
    // làm lưới an toàn cho đường dự phòng (useModernConfig=false) và cho
    // model không tôn trọng tuỳ chọn này.
    if (expectJson) generationConfig.responseMimeType = "application/json";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(`${geminiEndpoint(model)}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text();
      console.error(`Gemini API lỗi (model ${model}):`, res.status, bodyText);
      // 400 khi đang bật tuỳ chọn mới: nhiều khả năng model này không hiểu
      // thinkingConfig/responseMimeType. Gọi lại đúng 1 lần với cấu hình tối
      // giản trước khi kết luận là lỗi thật — xem GeminiCallOptions.useModernConfig.
      if (res.status === 400 && useModernConfig) {
        console.warn(
          `Model "${model}" từ chối tuỳ chọn thinkingConfig/responseMimeType (lỗi 400) — gọi lại với cấu hình tối giản.`,
        );
        return callGeminiPartsDetailed(parts, maxOutputTokens, {
          ...opts,
          attempt: 1,
          model,
          useModernConfig: false,
        });
      }
      // 503/5xx là quá tải TẠM THỜI phía Google — đáng thử lại cùng model vài
      // giây sau, thường sẽ qua.
      // 429 (RESOURCE_EXHAUSTED) THỰC TẾ gặp 25/08/2026 lại là hết hạn mức
      // THEO NGÀY (quotaId "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
      // response còn kèm retryDelay ~30-45s) — đợi tại chỗ rồi gọi lại CÙNG
      // model gần như chắc chắn vẫn lỗi (chỉ tốn thêm thời gian chờ vô ích),
      // nên KHÔNG thử lại cùng model khi gặp 429, chuyển thẳng sang model dự
      // phòng (hạn mức free tier tính RIÊNG theo từng model).
      const serverOverload = res.status === 503 || res.status >= 500;
      const quotaExhausted = res.status === 429;
      if (serverOverload && attempt < maxAttemptsForModel) {
        await sleep(GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 3000);
        return callGeminiPartsDetailed(parts, maxOutputTokens, {
          ...opts,
          attempt: attempt + 1,
          model,
        });
      }
      if (canFallBack && (serverOverload || quotaExhausted)) {
        console.warn(
          `Model "${model}" ${quotaExhausted ? "hết hạn mức/ngày" : "quá tải"} sau ${attempt} lần thử — tự chuyển sang model dự phòng "${GEMINI_FALLBACK_MODEL}".`,
        );
        return retryWithFallbackModel();
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
    const candidate = json?.candidates?.[0] as GeminiCandidate | undefined;
    // Ghép TOÀN BỘ mảnh văn bản thay vì chỉ đọc parts[0] — xem extractCandidateText().
    const text = extractCandidateText(candidate);
    const finishReason = candidate?.finishReason;
    // "MAX_TOKENS" = Gemini dừng sinh chữ giữa chừng vì chạm giới hạn
    // maxOutputTokens gửi lên — xem GeminiCallResult.truncated ở trên.
    const truncated = finishReason === "MAX_TOKENS";

    if (text) return { text, errorMessage: null, truncated };

    // --- Từ đây trở xuống: Google trả 200 nhưng không có chữ nào đọc được ---
    // In nguyên văn phần trả về để lần sau còn truy được nguyên nhân thật, thay
    // vì chỉ thấy đúng 1 dòng "AI trả lời rỗng" không có manh mối nào.
    console.error(
      `Gemini (model ${model}) trả về 200 nhưng không có nội dung. finishReason=${finishReason ?? "(không có)"}. Nguyên văn:`,
      JSON.stringify(json)?.slice(0, 2000),
      json?.promptFeedback,
    );

    if (truncated) {
      return {
        text: null,
        errorMessage:
          "AI bị dừng ngang do vượt giới hạn độ dài phản hồi (MAX_TOKENS) trước khi viết được nội dung nào — đợt này có thể quá dài, thử lại hoặc chia nhỏ hơn.",
        truncated: true,
      };
    }

    const blocked = describeFinishReason(finishReason);
    if (blocked && !blocked.retriable) {
      // Bị chặn nội dung — thử lại y hệt cũng vô ích, nhưng model KHÁC có
      // ngưỡng lọc khác nên vẫn đáng thử đúng 1 lần ở model dự phòng.
      if (canFallBack) return retryWithFallbackModel();
      return { text: null, errorMessage: blocked.message };
    }

    // Rỗng không rõ lý do (hoặc finishReason OTHER): coi như trục trặc nhất
    // thời — thử lại rồi mới đổi model, thay vì vứt nguyên đợt như code cũ.
    if (emptyRetry < GEMINI_MAX_EMPTY_RETRIES) {
      console.warn(`Gọi lại model "${model}" vì lần trước trả lời rỗng.`);
      await sleep(1000);
      return callGeminiPartsDetailed(parts, maxOutputTokens, {
        ...opts,
        attempt: 1,
        model,
        emptyRetry: emptyRetry + 1,
      });
    }
    if (canFallBack) {
      console.warn(
        `Model "${model}" liên tục trả lời rỗng — chuyển sang model dự phòng "${GEMINI_FALLBACK_MODEL}".`,
      );
      return retryWithFallbackModel();
    }
    return {
      text: null,
      errorMessage: `${blocked?.message ?? "AI trả lời rỗng, không có nội dung để đọc"} (đã thử lại và đã thử cả model dự phòng "${GEMINI_FALLBACK_MODEL}").`,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (attempt < maxAttemptsForModel) {
        return callGeminiPartsDetailed(parts, maxOutputTokens, {
          ...opts,
          attempt: attempt + 1,
          model,
        });
      }
      if (canFallBack) {
        console.warn(
          `Model "${model}" liên tục timeout sau ${attempt} lần thử — tự chuyển sang model dự phòng "${GEMINI_FALLBACK_MODEL}".`,
        );
        return retryWithFallbackModel();
      }
      return {
        text: null,
        errorMessage: `Gọi AI quá ${GEMINI_TIMEOUT_MS / 1000}s không có phản hồi (đã thử lại ${maxAttemptsForModel} lần${isFallback ? " với model dự phòng" : ""}) — có thể do mạng chậm hoặc ảnh gửi lên quá nặng.`,
      };
    }
    console.error("Gọi Gemini thất bại:", err);
    return { text: null, errorMessage: "Lỗi kết nối mạng khi gọi AI — kiểm tra lại internet rồi thử lại." };
  } finally {
    clearTimeout(timeoutId);
  }
}


async function callGeminiParts(
  parts: GeminiPart[],
  maxOutputTokens = 500,
  expectJson = false,
): Promise<string | null> {
  const { text } = await callGeminiPartsDetailed(parts, maxOutputTokens, { expectJson });
  return text;
}

/** expectJson: xem GeminiCallOptions.expectJson — phải để false cho lệnh xin về văn xuôi. */
async function callGemini(prompt: string, expectJson = false): Promise<string | null> {
  return callGeminiParts([{ text: prompt }], 500, expectJson);
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

export interface TypeSuggestion {
  question_type_id: string | null;
  type_name: string | null;
  reasoning: string;
}

/**
 * Gợi ý dạng bài phù hợp nhất cho 1 câu hỏi, CHỈ chọn trong danh sách dạng bài
 * đã có sẵn (không tự bịa dạng mới) — tránh việc mỗi lần AI phân loại ra một
 * kiểu khác nhau, làm hỏng tính nhất quán của ngân hàng câu hỏi.
 */
export async function suggestQuestionType(
  questionContentLatex: string,
  existingTypes: QuestionType[],
): Promise<TypeSuggestion> {
  if (existingTypes.length === 0) {
    return {
      question_type_id: null,
      type_name: null,
      reasoning: "Chưa có dạng bài nào trong hệ thống để gợi ý.",
    };
  }

  const typeList = existingTypes
    .map((t) => `- id="${t.id}": ${t.name}${t.description ? " — " + t.description : ""}`)
    .join("\n");

  const prompt = `Bạn là trợ lý phân loại đề Toán THPT (Việt Nam). Dưới đây là danh sách các "dạng bài" đã được giáo viên định nghĩa sẵn:
${typeList}

Câu hỏi cần phân loại (viết bằng LaTeX):
"""
${questionContentLatex}
"""

Hãy chọn ĐÚNG MỘT dạng bài phù hợp nhất trong danh sách trên (không tự tạo dạng mới).
Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác:
{"id": "<id của dạng bài đã chọn>", "reasoning": "<giải thích ngắn gọn 1 câu bằng tiếng Việt>"}
Nếu không dạng nào phù hợp, trả về {"id": null, "reasoning": "..."}`;

  const raw = await callGemini(prompt, true);
  if (!raw) {
    return {
      question_type_id: null,
      type_name: null,
      reasoning: "Không gọi được AI (kiểm tra API key hoặc kết nối mạng).",
    };
  }

  try {
    const parsed = extractJsonBlock(raw) as {
      id: string | null;
      reasoning: string;
    };
    const matched = existingTypes.find((t) => t.id === parsed.id);
    return {
      question_type_id: matched?.id ?? null,
      type_name: matched?.name ?? null,
      reasoning: parsed.reasoning ?? "",
    };
  } catch {
    return {
      question_type_id: null,
      type_name: null,
      reasoning: "AI trả về định dạng không đọc được, cần gán dạng bài thủ công.",
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

  const raw = await callGemini(prompt, true);
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
// Cấu trúc 1 đề thi sau khi AI đọc xong. Giáo viên LUÔN phải xem lại và xác
// nhận đáp án trước khi xuất bản — AI ở đây chỉ hỗ trợ soạn nháp, không tự
// động công bố đề.
//
// BỎ 30/08/2026: đường đọc thẳng file .docx (parseExamFromDocument +
// wordImport.ts + mammoth.js) đã gỡ hẳn. Lý do: chính thư viện mammoth KHÔNG
// đọc được công thức gõ bằng Equation/MathType (định dạng OMML/OLE) — nó bỏ
// qua ÂM THẦM, nên đề nào cũng thiếu công thức và giáo viên phải gõ tay lại,
// tức là đường này chưa bao giờ dùng được thật cho đề Toán. Giữ lại chỉ tổ
// làm rối màn hình chọn file và bắt mọi người tải thêm 1 thư viện nặng.
// Đường DUY NHẤT giờ là PDF (xem parseExamFromPdfPages bên dưới) — vốn đã là
// đường khuyến nghị, và xử lý công thức tốt hơn hẳn.
// ---------------------------------------------------------------------------

export interface ParsedPart1Question {
  content_latex: string;
  choices: { A: string; B: string; C: string; D: string };
  correct_choice: "A" | "B" | "C" | "D" | null;
  /**
   * Lời giải chi tiết (LaTeX). BỎ 30/08/2026 khỏi phần AI trích: AI KHÔNG còn
   * điền trường này nữa (luôn để trống), giáo viên tự nhập ở màn hình xem
   * trước — xem ghi chú ở buildExamParseFromImagesPrompt(). Vẫn giữ trường ở
   * đây vì đường "dán JSON đã xử lý sẵn" có thể có, và vì cột solution_latex
   * trong CSDL vẫn dùng bình thường cho phần nhập tay.
   */
  solution_latex?: string | null;
  /** Tên chương AI gợi ý (khớp đúng tên 1 trong danh sách topics đã gửi) — null nếu không chắc. Ánh xạ sang topic_id bằng matchTopicByName(). */
  topic_name?: string | null;
}
export interface ParsedPart2Question {
  content_latex: string;
  items: { a: string; b: string; c: string; d: string };
  correct: { a: boolean; b: boolean; c: boolean; d: boolean } | null;
  solution_latex?: string | null;
  topic_name?: string | null;
}
export interface ParsedPart3Question {
  content_latex: string;
  correct_value: string | null;
  points: number;
  solution_latex?: string | null;
  topic_name?: string | null;
}
export interface ParsedExam {
  part1: ParsedPart1Question[];
  part2: ParsedPart2Question[];
  part3: ParsedPart3Question[];
  warnings: string[];
}

/**
 * Danh sách chương gửi kèm prompt + đoạn hướng dẫn gợi ý chương — dùng chung
 * cho prompt đọc ảnh PDF và prompt trích dạng bài, để không lặp lại nội dung.
 * Trống (topics rỗng) thì bỏ qua hẳn yêu cầu này, không ép AI đoán mò khi
 * giáo viên chưa gieo chương nào.
 */
function topicClassificationBlock(topics: Topic[]): {
  ruleText: string;
  jsonExample: string;
} {
  if (topics.length === 0) return { ruleText: "", jsonExample: "" };
  const topicList = topics.map((t) => `"${t.name}"`).join(", ");
  return {
    ruleText: `\nGỢI Ý CHƯƠNG: với mỗi câu, chọn ĐÚNG MỘT chương phù hợp nhất trong danh sách sau (ghi lại ĐÚNG NGUYÊN VĂN tên chương, không tự bịa chương mới, không dịch/viết tắt khác đi): ${topicList}. Nếu không chương nào phù hợp hoặc không chắc chắn, để "topic_name" là null — không đoán bừa.\n`,
    jsonExample: `, "topic_name": "..." | null`,
  };
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

/**
 * BỎ TRÍCH LỜI GIẢI (30/08/2026) — quyết định của Thầy, nhằm giảm tải:
 * "solution_latex" là trường TỐN TOKEN NHẤT trong cả câu trả lời (1 lời giải
 * Toán viết bằng LaTeX thường dài gấp 2-3 lần chính nội dung câu hỏi, mà mỗi
 * đợt lại có hàng chục câu). Đây chính là nguyên nhân số 1 khiến Google cắt
 * ngang giữa chừng vì chạm maxOutputTokens (finishReason MAX_TOKENS) làm JSON
 * hỏng và mất trắng cả đợt, đồng thời cũng là phần kéo dài thời gian trả lời
 * nhiều nhất. Bỏ đi thì mỗi đợt trả lời ngắn hơn nhiều lần → nhanh và chắc
 * hơn hẳn.
 *
 * NHƯNG vẫn phải NHẬN DIỆN ĐÁP ÁN ĐÚNG như cũ (yêu cầu rõ của Thầy): với
 * nhiều đề, đáp án CHỈ xuất hiện ở cuối phần lời giải chứ không đánh dấu trên
 * phương án — nên prompt vẫn bắt AI ĐỌC lời giải để lấy đáp án, chỉ cấm CHÉP
 * LẠI lời giải vào câu trả lời (xem mục 4 bên dưới). Giáo viên nhập lời giải
 * bằng tay ở màn hình xem trước, nơi đã hỗ trợ LaTeX + dán ảnh Ctrl+V.
 */
function buildExamParseFromImagesPrompt(topics: Topic[]): string {
  const { ruleText, jsonExample } = topicClassificationBlock(topics);
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
4. QUAN TRỌNG — nếu trang có ghi LỜI GIẢI chi tiết dưới câu hỏi (thường thấy ở bản dành cho giáo viên): hãy ĐỌC KỸ lời giải đó để lấy ĐÁP ÁN ĐÚNG ở mục 3 (rất nhiều đề chỉ ghi đáp án ở cuối lời giải, không đánh dấu gì trên phương án). NHƯNG TUYỆT ĐỐI KHÔNG chép lại nội dung lời giải vào câu trả lời — không có trường nào để chứa nó. Chỉ lấy KẾT LUẬN (đáp án), bỏ toàn bộ các bước giải.
5. Nếu câu có hình minh hoạ (đồ thị, bảng biến thiên, hình vẽ...) không phải là công thức Toán đơn thuần: KHÔNG cố mô tả lại hay tự vẽ hình đó bằng LaTeX. Ghi chú "(có hình minh hoạ — cần dán thủ công)" ngay trong content_latex tại vị trí hình xuất hiện, VÀ thêm 1 dòng vào "warnings" nêu rõ câu nào (Phần mấy, thứ tự xuất hiện) có hình cần giáo viên tự dán lại bằng Ctrl+V ở bước xem trước.
6. Với Phần 3, "points" là thang điểm nếu đề ghi rõ, mặc định 0.5 nếu không có.
7. Liệt kê vào "warnings" (mảng chuỗi tiếng Việt ngắn) mọi điều không chắc chắn khác: câu không xác định được thuộc phần nào, chữ mờ/khó đọc, nghi ngờ đọc sai công thức, trang bị thiếu/lệch thứ tự, v.v.
${ruleText}
QUAN TRỌNG VỀ ĐỊNH DẠNG JSON: trong mọi chuỗi (content_latex, solution_latex...), dấu chéo ngược '\' của LaTeX (vd '\frac', '\lim', '\infty', '\left(') PHẢI viết thành HAI dấu chéo ngược liên tiếp '\\' (vd '\\frac', '\\lim', '\\infty') để là JSON hợp lệ — 1 dấu chéo ngược đơn lẻ đứng trước 1 chữ cái sẽ làm hỏng toàn bộ JSON và mất hết câu hỏi trong đợt này. Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "part1": [{"content_latex": "...", "choices": {"A":"...","B":"...","C":"...","D":"..."}, "correct_choice": "A" | null${jsonExample}}],
  "part2": [{"content_latex": "...", "items": {"a":"...","b":"...","c":"...","d":"..."}, "correct": {"a":true,"b":false,"c":true,"d":false} | null${jsonExample}}],
  "part3": [{"content_latex": "...", "correct_value": "..." | null, "points": 0.5${jsonExample}}],
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
const CHUNK_ERROR_PREFIX = "[LỖI ĐỢT]";

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
  /**
   * THÊM 30/08/2026 — dùng nội bộ khi tự gọi lại lần 2 vì lần 1 đọc JSON
   * hỏng. Trước đây JSON hỏng là mất trắng cả đợt ngay lần đầu, dù chỉ cần
   * hỏi lại 1 lần là thường ra kết quả đúng (AI sinh chữ có tính ngẫu nhiên,
   * lần sau không lặp lại đúng chỗ sai đó). Chỉ cho thử lại 1 lần để không
   * kéo dài thời gian chờ.
   */
  isJsonRetry = false,
): Promise<ParsedExam> {
  const parts: GeminiPart[] = [{ text: buildExamParseFromImagesPrompt(topics) }];
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
  // GIỮ NGUYÊN 16384 (30/08/2026) dù đợt giờ chỉ còn 4 trang và không còn
  // trích lời giải: đây là mức TRẦN, không phải lượng token thật sự tiêu tốn
  // — đặt cao không làm chậm hay tốn thêm gì, chỉ để chắc chắn không bao giờ
  // chạm trần nữa. Việc tắt "thinking" ở callGeminiPartsDetailed() cũng đã
  // giải phóng toàn bộ hạn mức này cho phần nội dung thật.
  const { text: raw, errorMessage, truncated } = await callGeminiPartsDetailed(parts, 16384, {
    expectJson: true,
  });
  if (!raw) {
    return emptyParsedExamWithError(pageNumbers, errorMessage ?? "AI không trả lời.");
  }

  try {
    const parsed = extractJsonBlock(raw) as Partial<ParsedExam>;
    return {
      part1: Array.isArray(parsed.part1) ? parsed.part1 : [],
      part2: Array.isArray(parsed.part2) ? parsed.part2 : [],
      part3: Array.isArray(parsed.part3) ? parsed.part3 : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (err) {
    console.error("Không đọc được JSON từ AI khi phân tích ảnh trang PDF:", err, raw);
    // Hỏi lại đúng 1 lần trước khi bỏ cuộc — xem tham số isJsonRetry ở trên.
    // Không thử lại khi bị CẮT NGANG do quá dài (truncated): lỗi đó lặp lại y
    // hệt vì nguyên nhân là độ dài đợt, hỏi lại chỉ tốn thêm thời gian.
    if (!isJsonRetry && !truncated) {
      console.warn("Gọi lại đợt này 1 lần nữa vì JSON lần trước không đọc được.");
      return parseExamFromImages(pageImages, pageNumbers, topics, true);
    }
    return emptyParsedExamWithError(
      pageNumbers,
      truncated
        ? "AI bị cắt ngang do vượt giới hạn độ dài phản hồi (đợt này có quá nhiều câu/công thức dài) — thử lại, hoặc báo lại nếu vẫn lặp lại nhiều lần."
        : "AI trả lời nhưng không đúng định dạng JSON mong đợi (đã tự hỏi lại 1 lần).",
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

export interface ParseFromPdfResult {
  /** null CHỈ khi không có đợt nào thành công (0 câu hỏi nào đọc được) — xem "chunkErrors" để biết lý do cụ thể từng đợt. */
  parsed: ParsedExam | null;
  /** Số đợt (chunk) gọi AI bị lỗi — 0 nghĩa là mọi đợt đều thành công. */
  failedChunks: number;
  totalChunks: number;
  /** Lý do cụ thể của từng đợt bị lỗi (đã bóc khỏi CHUNK_ERROR_PREFIX), để hiện thẳng cho giáo viên thay vì chỉ nói chung chung "có lỗi". */
  chunkErrors: string[];
}

/**
 * Số đợt gọi AI được chạy CÙNG LÚC. Xem giải thích đầy đủ vì sao phải giới
 * hạn (chứ không bắn hết 1 lượt) ở mapWithConcurrency() trong concurrency.ts.
 * Chọn 3: đủ để 1 đề 12-16 trang xong trong 1 lượt chờ duy nhất, mà vẫn cách
 * xa hạn mức lượt/phút của gói miễn phí.
 */
const EXAM_PARSE_CONCURRENCY = 3;

/**
 * Phân tích đề từ danh sách ảnh trang PDF, tự chia thành nhiều đợt gọi AI rồi
 * ghép kết quả lại theo đúng thứ tự trang. Nếu 1 đợt bị lỗi/timeout thì các
 * đợt còn lại vẫn có kết quả bình thường thay vì mất trắng toàn bộ.
 *
 * ĐỔI 30/08/2026 (2 thay đổi, đều nhằm rút thời gian chờ xuống dưới 1 phút):
 *  1. Các đợt giờ chạy SONG SONG (tối đa EXAM_PARSE_CONCURRENCY đợt cùng lúc)
 *     thay vì tuần tự. Trước đây đợi xong đợt 1 mới bắt đầu đợt 2, nên tổng
 *     thời gian là TỔNG các đợt; giờ chỉ còn xấp xỉ đợt chậm nhất.
 *  2. Mặc định 4 trang/đợt thay vì 6. Đợt nhỏ hơn thì mỗi câu trả lời ngắn
 *     hơn → về nhanh hơn, và khi có nhiều đợt chạy song song thì chia nhỏ
 *     cũng đồng nghĩa tận dụng được nhiều làn hơn. Đổi lại là nhiều lượt gọi
 *     hơn, nhưng vẫn trong hạn mức.
 *
 * LƯU Ý CÒN LẠI (không đổi): 1 câu hỏi lỡ nằm vắt ngang đúng ranh giới chia
 * đợt có thể bị đọc thiếu — hiếm, nhưng giáo viên vẫn cần xem lại số câu ở
 * bước xác nhận.
 */
export async function parseExamFromPdfPages(
  pageImages: PageImageInput[],
  chunkSize = 4,
  onProgress?: (done: number, total: number) => void,
  topics: Topic[] = [],
): Promise<ParseFromPdfResult> {
  const pageNumberChunks = chunkArray(
    pageImages.map((_, i) => i + 1),
    chunkSize,
  );
  const imageChunks = chunkArray(pageImages, chunkSize);

  // Đếm số đợt ĐÃ XONG để báo tiến độ. Chạy song song nên các đợt không xong
  // theo thứ tự — dùng biến đếm tăng dần thay vì chỉ số vòng lặp, nếu không
  // thanh tiến độ sẽ nhảy lung tung (vd. "3/4" rồi tụt về "2/4").
  let doneCount = 0;
  const results = await mapWithConcurrency(
    imageChunks,
    EXAM_PARSE_CONCURRENCY,
    async (chunk, i) => {
      const r = await parseExamFromImages(chunk, pageNumberChunks[i], topics);
      doneCount += 1;
      onProgress?.(doneCount, imageChunks.length);
      return r;
    },
  );

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
    return { parsed: null, failedChunks, totalChunks: imageChunks.length, chunkErrors };
  }
  if (failedChunks > 0) {
    merged.warnings = [
      `${failedChunks}/${imageChunks.length} đợt gọi AI bị lỗi — 1 số trang có thể chưa được phân tích, kiểm tra lại số câu trước khi xuất bản: ${chunkErrors.join(" | ")}`,
      ...merged.warnings,
    ];
  }
  return { parsed: merged, failedChunks, totalChunks: imageChunks.length, chunkErrors };
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
  const { text: raw, errorMessage, truncated } = await callGeminiPartsDetailed(parts, 8192, {
    expectJson: true,
  });
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

  // Chạy song song có giới hạn, cùng lý do và cùng cách đếm tiến độ như
  // parseExamFromPdfPages() ở trên.
  let doneCount = 0;
  const results = await mapWithConcurrency(
    imageChunks,
    EXAM_PARSE_CONCURRENCY,
    async (chunk, i) => {
      const r = await extractQuestionTypesFromImages(chunk, topicName, pageNumberChunks[i]);
      doneCount += 1;
      onProgress?.(doneCount, imageChunks.length);
      return r;
    },
  );

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
