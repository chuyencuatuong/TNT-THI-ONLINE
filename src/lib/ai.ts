/**
 * Tích hợp AI (Gemini) — gọi thẳng từ trình duyệt bằng free tier.
 * Hai việc AI hỗ trợ, đúng như yêu cầu ban đầu:
 *  1) Gợi ý gán dạng bài khi giáo viên nhập câu hỏi mới (giáo viên luôn là người
 *     duyệt/xác nhận cuối cùng — AI không tự ý ghi đè ngân hàng câu hỏi).
 *  2) Tổng hợp nhận xét bằng lời cho báo cáo định kỳ, dựa trên số liệu đã tính sẵn
 *     (AI không tự tính điểm, chỉ diễn giải số liệu thành lời văn).
 */

import type { QuestionType } from "./types";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as
  | string
  | undefined;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(prompt: string): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn("Thiếu VITE_GEMINI_API_KEY — bỏ qua bước gọi AI.");
    return null;
  }
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
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
