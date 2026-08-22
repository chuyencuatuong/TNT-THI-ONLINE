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

async function callGeminiParts(
  parts: GeminiPart[],
  maxOutputTokens = 500,
): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn("Thiếu VITE_GEMINI_API_KEY — bỏ qua bước gọi AI.");
    return null;
  }
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens },
      }),
    });
    if (!res.ok) {
      console.error("Gemini API lỗi:", res.status, await res.text());
      return null;
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text as
      | string
      | undefined;
    return text?.trim() ?? null;
  } catch (err) {
    console.error("Gọi Gemini thất bại:", err);
    return null;
  }
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
1. Đọc trực tiếp từ ảnh, kể cả công thức Toán gõ bằng MathType/Equation Editor — khi xuất ra PDF các công thức này hiển thị đúng như bản gốc dù công cụ đọc văn bản thường không đọc được. Chuyển TOÀN BỘ công thức sang LaTeX, đặt trong cặp dấu $...$ (công thức trong dòng). Không dùng \\[ \\] hay cú pháp khác.
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

/** Gửi 1 đợt ảnh trang (đã trong giới hạn cho phép) cho Gemini phân tích. */
export async function parseExamFromImages(
  pageImages: PageImageInput[],
  pageNumbers?: number[],
): Promise<ParsedExam | null> {
  const parts: GeminiPart[] = [{ text: EXAM_PARSE_FROM_IMAGES_PROMPT }];
  pageImages.forEach((img, i) => {
    const label = pageNumbers?.[i] ?? i + 1;
    parts.push({ text: `\nTrang ${label}:` });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.dataBase64 } });
  });

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
    console.error("Không đọc được JSON từ AI khi phân tích ảnh trang PDF:", err, raw);
    return null;
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
  parsed: ParsedExam | null;
  /** Số đợt (chunk) gọi AI bị lỗi/không đọc được — 0 nghĩa là mọi đợt đều thành công. */
  failedChunks: number;
  totalChunks: number;
}

/**
 * Phân tích đề từ danh sách ảnh trang PDF, tự chia thành nhiều đợt gọi AI nếu
 * đề quá dài (tránh 1 lần gọi quá nặng). Ghép kết quả các đợt lại theo thứ tự
 * trang. Nếu đề dài phải chia đợt, 1 câu hỏi lỡ nằm vắt ngang ranh giới 2 trang
 * ở đúng điểm chia có thể bị đọc thiếu — trường hợp này hiếm (chunk mặc định
 * đủ lớn cho hầu hết đề thi) nhưng giáo viên vẫn cần xem lại ở bước xác nhận.
 */
export async function parseExamFromPdfPages(
  pageImages: PageImageInput[],
  chunkSize = 12,
): Promise<ParseFromPdfResult> {
  const pageNumberChunks = chunkArray(
    pageImages.map((_, i) => i + 1),
    chunkSize,
  );
  const imageChunks = chunkArray(pageImages, chunkSize);

  const results: ParsedExam[] = [];
  let failedChunks = 0;
  for (let i = 0; i < imageChunks.length; i++) {
    const r = await parseExamFromImages(imageChunks[i], pageNumberChunks[i]);
    if (r) results.push(r);
    else failedChunks++;
  }

  if (results.length === 0) {
    return { parsed: null, failedChunks, totalChunks: imageChunks.length };
  }
  const merged = mergeParsedExams(results);
  if (failedChunks > 0) {
    merged.warnings = [
      `${failedChunks}/${imageChunks.length} đợt gọi AI bị lỗi (mất kết nối hoặc AI không trả JSON hợp lệ) — 1 số trang có thể chưa được phân tích, kiểm tra lại số câu trước khi xuất bản.`,
      ...merged.warnings,
    ];
  }
  return { parsed: merged, failedChunks, totalChunks: imageChunks.length };
}
