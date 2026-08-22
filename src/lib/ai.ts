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

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;
const GEMINI_MODEL = "gemini-2.0-flash";
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
function extractJsonBlock(raw: string): unknown {
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
