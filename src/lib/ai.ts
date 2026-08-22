/**
 * Tích hợp AI (Gemini) — gọi thẳng từ trình duyệt bằng free tier.
 * Hai việc AI hỗ trợ, đúng như yêu cầu ban đầu:
 *  1) Gợi ý gán dạng bài khi giáo viên nhập câu hỏi mới (giáo viên luôn là người
 *     duyệt/xác nhận cuối cùng — AI không tự ý ghi đè ngân hàng câu hỏi).
 *  2) Tổng hợp nhận xét bằng lời cho báo cáo định kỳ, dựa trên số liệu đã tính sẵn
 *     (AI không tự tính điểm, chỉ diễn giải số liệu thành lời văn).
 */

import type { QuestionType } from "./types";
import type { ExtractedImage } from "./wordImport";
import { chunkArray } from "./chunk";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;
// Cho phép ghi đè bằng biến môi trường VITE_GEMINI_MODEL mà không cần sửa code
// — hữu ích vì tên model Gemini đổi khá thường xuyên (bản mặc định bên dưới
// chỉ chính xác tại thời điểm viết, nên kiểm tra lại tên model khả dụng cho
// API key của bạn tại Google AI Studio nếu gặp lỗi 404 khi gọi AI).
const GEMINI_MODEL =
  (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || "gemini-3.7-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
 */
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRY_DELAYS_MS = [3000, 8000];

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
}

async function callGeminiPartsDetailed(
  parts: GeminiPart[],
  maxOutputTokens: number,
  attempt = 1,
): Promise<GeminiCallResult> {
  if (!GEMINI_API_KEY) {
    return { text: null, errorMessage: "Thiếu VITE_GEMINI_API_KEY — chưa cấu hình API key cho AI." };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const bodyText = await res.text();
      console.error("Gemini API lỗi:", res.status, bodyText);
      const retriable = (res.status === 503 || res.status === 429 || res.status >= 500) && attempt < GEMINI_MAX_ATTEMPTS;
      if (retriable) {
        await sleep(GEMINI_RETRY_DELAYS_MS[attempt - 1] ?? 8000);
        return callGeminiPartsDetailed(parts, maxOutputTokens, attempt + 1);
      }
      return { text: null, errorMessage: describeGeminiHttpError(res.status) };
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text as
      | string
      | undefined;
    if (!text?.trim()) {
      return { text: null, errorMessage: "AI trả lời rỗng, không có nội dung để đọc." };
    }
    return { text: text.trim(), errorMessage: null };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      if (attempt < GEMINI_MAX_ATTEMPTS) {
        return callGeminiPartsDetailed(parts, maxOutputTokens, attempt + 1);
      }
      return {
        text: null,
        errorMessage: `Gọi AI quá ${GEMINI_TIMEOUT_MS / 1000}s không có phản hồi (đã thử lại ${GEMINI_MAX_ATTEMPTS} lần) — có thể do mạng chậm hoặc ảnh gửi lên quá nặng.`,
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
): Promise<string | null> {
  const { text } = await callGeminiPartsDetailed(parts, maxOutputTokens);
  return text;
}

async function callGemini(prompt: string): Promise<string | null> {
  return callGeminiParts([{ text: prompt }], 500);
}

/** Bóc khối JSON ra khỏi câu trả lời của AI, kể cả khi AI bọc trong ```json ... ``` */
export function extractJsonBlock(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const jsonMatch = candidate.match(/[[{][\s\S]*[\]}]/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : candidate);
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

  const raw = await callGemini(prompt);
  if (!raw) {
    return {
      question_type_id: null,
      type_name: null,
      reasoning: "Không gọi được AI (kiểm tra API key hoặc kết nối mạng).",
    };
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as {
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

export interface StudentStatsForAI {
  studentName: string;
  periodLabel: string;
  totalAttempts: number;
  averageScore: number | null;
  scoreTrend: { examTitle: string; date: string; score: number }[];
  topicStats: { type_name: string; accuracyPercent: number }[];
}

/** Sinh đoạn nhận xét ngắn cho báo cáo định kỳ, dựa trên số liệu đã tính sẵn. */
export async function generateReportSummary(
  stats: StudentStatsForAI,
): Promise<string> {
  const topicLines = stats.topicStats
    .map((t) => `- ${t.type_name}: đúng ${t.accuracyPercent.toFixed(0)}%`)
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
- Tỉ lệ đúng theo dạng bài:
${topicLines || "(chưa có)"}

Viết 1 đoạn nhận xét (3-5 câu) bằng tiếng Việt, giọng văn thân thiện, chuyên nghiệp,
nêu rõ: xu hướng điểm số (tiến bộ/đi ngang/giảm), dạng bài đang mạnh, dạng bài cần
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
}
export interface ParsedPart2Question {
  content_latex: string;
  items: { a: string; b: string; c: string; d: string };
  correct: { a: boolean; b: boolean; c: boolean; d: boolean } | null;
  solution_latex?: string | null;
}
export interface ParsedPart3Question {
  content_latex: string;
  correct_value: string | null;
  points: number;
  solution_latex?: string | null;
}
export interface ParsedExam {
  part1: ParsedPart1Question[];
  part2: ParsedPart2Question[];
  part3: ParsedPart3Question[];
  warnings: string[];
}

const EXAM_PARSE_PROMPT = `Bạn là trợ lý số hoá đề thi Toán THPT (Việt Nam, chương trình GDPT 2018). Dưới đây là văn bản trích từ 1 file Word chứa đề thi, cùng với các hình ảnh nhúng trong file (nếu có) được gửi kèm — mỗi hình có placeholder dạng [HINH_n] xuất hiện trong văn bản, hình gửi kèm theo ĐÚNG thứ tự đó.

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

Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "part1": [{"content_latex": "...", "choices": {"A":"...","B":"...","C":"...","D":"..."}, "correct_choice": "A" | null, "solution_latex": "..." | null}],
  "part2": [{"content_latex": "...", "items": {"a":"...","b":"...","c":"...","d":"..."}, "correct": {"a":true,"b":false,"c":true,"d":false} | null, "solution_latex": "..." | null}],
  "part3": [{"content_latex": "...", "correct_value": "..." | null, "points": 0.5, "solution_latex": "..." | null}],
  "warnings": ["..."]
}

Văn bản đề thi (in đậm được đánh dấu bằng **...**):
"""
`;

export async function parseExamFromDocument(
  plainText: string,
  images: ExtractedImage[],
): Promise<ParsedExam | null> {
  const parts: GeminiPart[] = [{ text: EXAM_PARSE_PROMPT + plainText + '\n"""' }];
  for (const img of images) {
    parts.push({ text: `\nHình ảnh cho placeholder ${img.placeholder}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  }

  const raw = await callGeminiParts(parts, 8192);
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
// Tạo đề từ file PDF (KHUYẾN NGHỊ — quy trình chính từ 22/08/2026): mỗi trang
// PDF được render thành 1 ảnh ngay trên trình duyệt (xem pdfImport.ts), rồi
// gửi thẳng cho Gemini đọc bằng khả năng đa phương thức (multimodal) — né
// hoàn toàn giới hạn không đọc được công thức MathType/OLE của mammoth.js.
// Quy ước nhận diện đáp án học theo cách Azota làm: chấp nhận NHIỀU tín hiệu
// cùng lúc (tô màu, gạch chân, in đậm, dấu *, ghi chú "Đáp án:"...) thay vì
// đòi 1 quy ước cứng — và luôn có bước giáo viên xác nhận lại trước khi xuất
// bản, vì AI đọc ảnh vẫn có thể đọc sai màu/nét mờ.
// ---------------------------------------------------------------------------

const EXAM_PARSE_FROM_IMAGES_PROMPT = `Bạn là trợ lý số hoá đề thi Toán THPT (Việt Nam, chương trình GDPT 2018). Dưới đây là ảnh chụp lần lượt từng trang của 1 file đề thi (PDF), gửi kèm theo ĐÚNG thứ tự trang (mỗi ảnh có ghi chú "Trang N" ngay trước).

Đề thi có 3 phần theo cấu trúc chuẩn:
- Phần 1: trắc nghiệm 4 phương án (A, B, C, D), chỉ 1 phương án đúng.
- Phần 2: mỗi câu có 4 ý nhỏ (a, b, c, d), mỗi ý là 1 mệnh đề Đúng/Sai độc lập.
- Phần 3: trả lời ngắn (điền số hoặc chuỗi ngắn), không có phương án cho sẵn.

YÊU CẦU:
1. Đọc trực tiếp từ ảnh, kể cả công thức Toán gõ bằng MathType/Equation Editor — khi xuất ra PDF các công thức này hiển thị đúng như bản gốc dù công cụ đọc văn bản thường không đọc được. Chuyển TOÀN BỘ công thức sang LaTeX, đặt trong cặp dấu $...$ (công thức trong dòng). Không dùng \\[ \\] hay cú pháp khác. QUAN TRỌNG: cặp dấu $...$ CHỈ bọc phần biểu thức Toán thuần tuý (số, biến, ký hiệu toán học) — chữ tiếng Việt (kể cả có dấu) và văn bản thường (đề bài, mô tả) phải nằm NGOÀI dấu $, không được bọc chung. Nếu bắt buộc phải có chữ tiếng Việt ngay bên trong 1 công thức (ví dụ đơn vị "cm", "giây", hoặc chú thích ngắn), phải bọc riêng phần chữ đó bằng \\text{...} bên trong dấu $. Ví dụ ĐÚNG: "Chiều dài là $x$ cm."; ví dụ SAI: "$Chiều dài là x$ cm.".
2. Bỏ qua các phần lặp lại ở đầu/cuối mỗi trang không phải nội dung đề (tên trường, logo, số trang, watermark) và các dòng ghi nguồn/tác giả kiểu "FB tác giả: ...", "Nguồn: ...", "Sưu tầm: ..." — đây là nhiễu, không đưa vào content_latex hay coi là tín hiệu đáp án.
3. Xác định đáp án đúng dựa trên BẤT KỲ tín hiệu nào sau đây xuất hiện trong ảnh (không chỉ 1 quy ước cố định, vì mỗi đề có thể trình bày khác nhau):
   - Phần 1: phương án được TÔ MÀU NỀN (thường là xanh lá) và/hoặc GẠCH CHÂN, hoặc in đậm, hoặc có dấu "*" cạnh phương án, hoặc có ghi chú "Đáp án: X" ngay sau câu.
   - Phần 2: đáp án Đúng/Sai của từng ý có thể ghi dưới dạng bảng gọn (vd: a-Đ, b-S...) HOẶC dưới dạng văn xuôi trong phần lời giải (vd: "a) Đúng: vì...", "b) Sai: vì...") — đọc kỹ phần lời giải nếu không thấy bảng.
   - Phần 3: đáp số cuối câu có thể ghi bằng nhiều nhãn khác nhau: "Đáp số:", "Đs:", "Đáp án:", hoặc dạng "<key=...>" — coi tất cả các nhãn này là chỉ báo đáp án đúng.
   Nếu xem xét đủ các tín hiệu trên mà vẫn KHÔNG chắc chắn, để giá trị đáp án (correct_choice / correct / correct_value) là null — TUYỆT ĐỐI không tự đoán, vì đoán sai sẽ làm chấm điểm sai cho học sinh.
4. Nếu trang có ghi lời giải chi tiết ngay dưới câu hỏi (thường thấy ở bản dành cho giáo viên), chuyển lời giải đó sang "solution_latex" — giữ nguyên các bước giải, không tự tóm tắt hay bịa thêm. Nếu không có lời giải cho câu nào, để "solution_latex" là null cho câu đó.
5. Nếu câu có hình minh hoạ (đồ thị, bảng biến thiên, hình vẽ...) không phải là công thức Toán đơn thuần: KHÔNG cố mô tả lại hay tự vẽ hình đó bằng LaTeX. Ghi chú "(có hình minh hoạ — cần dán thủ công)" ngay trong content_latex tại vị trí hình xuất hiện, VÀ thêm 1 dòng vào "warnings" nêu rõ câu nào (Phần mấy, thứ tự xuất hiện) có hình cần giáo viên tự dán lại bằng Ctrl+V ở bước xem trước.
6. Với Phần 3, "points" là thang điểm nếu đề ghi rõ, mặc định 0.5 nếu không có.
7. Liệt kê vào "warnings" (mảng chuỗi tiếng Việt ngắn) mọi điều không chắc chắn khác: câu không xác định được thuộc phần nào, chữ mờ/khó đọc, nghi ngờ đọc sai công thức, trang bị thiếu/lệch thứ tự, v.v.

Trả lời CHÍNH XÁC theo định dạng JSON sau, không thêm chữ nào khác ngoài JSON, không dùng markdown code fence:
{
  "part1": [{"content_latex": "...", "choices": {"A":"...","B":"...","C":"...","D":"..."}, "correct_choice": "A" | null, "solution_latex": "..." | null}],
  "part2": [{"content_latex": "...", "items": {"a":"...","b":"...","c":"...","d":"..."}, "correct": {"a":true,"b":false,"c":true,"d":false} | null, "solution_latex": "..." | null}],
  "part3": [{"content_latex": "...", "correct_value": "..." | null, "points": 0.5, "solution_latex": "..." | null}],
  "warnings": ["..."]
}`;

export interface PageImageInput {
  mimeType: string;
  dataBase64: string;
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
): Promise<ParsedExam> {
  const parts: GeminiPart[] = [{ text: EXAM_PARSE_FROM_IMAGES_PROMPT }];
  pageImages.forEach((img, i) => {
    const label = pageNumbers?.[i] ?? i + 1;
    parts.push({ text: `\nTrang ${label}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  });

  const { text: raw, errorMessage } = await callGeminiPartsDetailed(parts, 8192);
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
    return emptyParsedExamWithError(pageNumbers, "AI trả lời nhưng không đúng định dạng JSON mong đợi.");
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
 * Phân tích đề từ danh sách ảnh trang PDF, tự chia thành nhiều đợt gọi AI
 * (mặc định 6 trang/đợt — nhỏ hơn hẳn 1 lần gọi cho cả đề dài, để mỗi đợt trả
 * lời nhanh hơn, đỡ có cảm giác "đứng hình" lâu, và nếu 1 đợt bị lỗi/timeout
 * thì các đợt còn lại vẫn tiếp tục chạy thay vì mất trắng toàn bộ). Ghép kết
 * quả các đợt lại theo thứ tự trang. Nếu đề dài phải chia đợt, 1 câu hỏi lỡ
 * nằm vắt ngang ranh giới 2 trang ở đúng điểm chia có thể bị đọc thiếu —
 * trường hợp này hiếm nhưng giáo viên vẫn cần xem lại ở bước xác nhận.
 */
export async function parseExamFromPdfPages(
  pageImages: PageImageInput[],
  chunkSize = 6,
  onProgress?: (done: number, total: number) => void,
): Promise<ParseFromPdfResult> {
  const pageNumberChunks = chunkArray(
    pageImages.map((_, i) => i + 1),
    chunkSize,
  );
  const imageChunks = chunkArray(pageImages, chunkSize);

  const results: ParsedExam[] = [];
  for (let i = 0; i < imageChunks.length; i++) {
    const r = await parseExamFromImages(imageChunks[i], pageNumberChunks[i]);
    results.push(r);
    onProgress?.(i + 1, imageChunks.length);
  }

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
