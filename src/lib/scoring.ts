/**
 * Bộ máy chấm điểm cho đề thi 3 phần theo định dạng THPT (chương trình GDPT 2018).
 *
 * Phần 1: Trắc nghiệm 4 phương án — mỗi câu đúng 0.25 điểm (mặc định 12 câu = 3.0 điểm).
 * Phần 2: Đúng/sai — mỗi câu có 4 ý (a,b,c,d), chấm điểm theo SỐ Ý ĐÚNG trong câu đó:
 *         đúng 1 ý = 0.1đ, đúng 2 ý = 0.25đ, đúng 3 ý = 0.5đ, đúng 4 ý (cả câu) = 1.0đ.
 *         Đây là barem chính thức hiện hành — không suy diễn, không làm tròn khác đi.
 * Phần 3: Trả lời ngắn — so khớp đáp án cuối cùng, có chuẩn hoá số thập phân.
 *
 * Toàn bộ hàm ở đây là hàm thuần (pure function), không phụ thuộc DB/mạng,
 * để dễ kiểm chứng độc lập bằng unit test trước khi ráp vào giao diện.
 */

export type Part1Answer = "A" | "B" | "C" | "D";

export interface Part2SubAnswers {
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
}

/** Điểm cho mỗi câu Phần 1 (đơn vị: điểm/câu). */
export const PART1_POINTS_PER_QUESTION = 0.25;

/** Bảng điểm chính thức Phần 2 theo số ý đúng trong 1 câu (4 ý). */
export const PART2_SCORE_TABLE: Record<0 | 1 | 2 | 3 | 4, number> = {
  0: 0,
  1: 0.1,
  2: 0.25,
  3: 0.5,
  4: 1,
};

/** Chấm 1 câu Phần 1. Trả về 0.25 nếu đúng, 0 nếu sai hoặc bỏ trống. */
export function scorePart1Question(
  correctAnswer: Part1Answer,
  studentAnswer: Part1Answer | null | undefined,
): number {
  if (!studentAnswer) return 0;
  return studentAnswer === correctAnswer ? PART1_POINTS_PER_QUESTION : 0;
}

/**
 * Chấm 1 câu Phần 2 (4 ý đúng/sai).
 * studentAnswer thiếu ý nào (undefined/null) được coi là trả lời sai ý đó,
 * không phải bỏ qua — vì đề bài yêu cầu học sinh chọn Đúng/Sai cho cả 4 ý.
 */
export function scorePart2Question(
  correctAnswer: Part2SubAnswers,
  studentAnswer: Partial<Part2SubAnswers> | null | undefined,
): { correctCount: 0 | 1 | 2 | 3 | 4; score: number } {
  const keys: (keyof Part2SubAnswers)[] = ["a", "b", "c", "d"];
  let correctCount = 0;
  for (const k of keys) {
    const studentVal = studentAnswer?.[k] ?? null;
    if (studentVal !== null && studentVal === correctAnswer[k]) {
      correctCount++;
    }
  }
  const count = correctCount as 0 | 1 | 2 | 3 | 4;
  return { correctCount: count, score: PART2_SCORE_TABLE[count] };
}

/**
 * Chuẩn hoá đáp án Phần 3 để so khớp: bỏ khoảng trắng thừa, đổi dấu phẩy
 * thập phân sang dấu chấm, bỏ số 0 vô nghĩa ở cuối để "12.50" == "12.5".
 * Nếu cả hai giá trị là số hợp lệ thì so sánh bằng số (an toàn hơn so sánh chuỗi).
 */
export function normalizeShortAnswer(raw: string): string {
  return raw.trim().replace(",", ".").replace(/\s+/g, "");
}

export function scorePart3Question(
  correctAnswer: string,
  studentAnswer: string | null | undefined,
  points: number,
  numericTolerance = 1e-6,
): number {
  if (!studentAnswer) return 0;
  const correctNorm = normalizeShortAnswer(correctAnswer);
  const studentNorm = normalizeShortAnswer(studentAnswer);

  const correctNum = Number(correctNorm);
  const studentNum = Number(studentNorm);
  const bothNumeric = !Number.isNaN(correctNum) && !Number.isNaN(studentNum);

  const isMatch = bothNumeric
    ? Math.abs(correctNum - studentNum) <= numericTolerance
    : correctNorm.toLowerCase() === studentNorm.toLowerCase();

  return isMatch ? points : 0;
}

export interface ExamScoreBreakdown {
  part1Score: number;
  part2Score: number;
  part3Score: number;
  totalScore: number;
}

/** Cộng điểm 3 phần, làm tròn 2 chữ số thập phân để tránh lỗi cộng dồn số thực. */
export function combineScores(
  part1Score: number,
  part2Score: number,
  part3Score: number,
): ExamScoreBreakdown {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const part1 = round2(part1Score);
  const part2 = round2(part2Score);
  const part3 = round2(part3Score);
  return {
    part1Score: part1,
    part2Score: part2,
    part3Score: part3,
    totalScore: round2(part1 + part2 + part3),
  };
}
