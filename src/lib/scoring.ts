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

// ---------------------------------------------------------------------------
// Tính điểm LINH HOẠT (Đợt 3, mục 2) — cho các đề không theo cấu trúc chuẩn
// THPT (kiểm tra 15 phút, kiểm tra thường xuyên...). CÁC HÀM BAREM CHUẨN Ở
// TRÊN GIỮ NGUYÊN, KHÔNG SỬA GÌ — mọi hàm dưới đây là hàm MỚI, chỉ được gọi
// khi exams.scoring_mode = 'tuy_chinh' (xem resolveExamScoring +
// src/lib/api.ts submitAttempt).
// ---------------------------------------------------------------------------

export interface Part2SubPoints {
  a: number;
  b: number;
  c: number;
  d: number;
}

/**
 * Chấm 1 câu Phần 1 với ĐIỂM TỐI ĐA TUỲ CHỈNH — cùng logic đúng/sai như
 * scorePart1Question ở trên, chỉ khác điểm thưởng khi đúng là `maxPoints`
 * bất kỳ thay vì cố định 0.25đ.
 */
export function scorePart1Custom(
  correctAnswer: Part1Answer,
  studentAnswer: Part1Answer | null | undefined,
  maxPoints: number,
): number {
  if (!studentAnswer) return 0;
  return studentAnswer === correctAnswer ? maxPoints : 0;
}

/**
 * Chấm 1 câu Phần 2 ở chế độ THỦ CÔNG — cộng điểm riêng từng ý đúng
 * (subPoints), KHÔNG dùng bảng tỉ lệ cố định PART2_SCORE_TABLE (bảng đó là
 * barem chính thức THPT, chỉ áp dụng ở chế độ chuẩn).
 */
export function scorePart2Custom(
  correctAnswer: Part2SubAnswers,
  studentAnswer: Partial<Part2SubAnswers> | null | undefined,
  subPoints: Part2SubPoints,
): { correctCount: 0 | 1 | 2 | 3 | 4; score: number } {
  const keys: (keyof Part2SubAnswers)[] = ["a", "b", "c", "d"];
  let correctCount = 0;
  let score = 0;
  for (const k of keys) {
    const studentVal = studentAnswer?.[k] ?? null;
    if (studentVal !== null && studentVal === correctAnswer[k]) {
      correctCount++;
      score += subPoints[k];
    }
  }
  return { correctCount: correctCount as 0 | 1 | 2 | 3 | 4, score: Math.round(score * 100) / 100 };
}

/**
 * Chấm 1 câu Phần 2 ở chế độ TỰ ĐỘNG (chia đều 10đ theo số câu, không nhập
 * điểm riêng từng ý) — đơn giản hoá thành "đúng cả 4 ý mới được trọn điểm
 * câu, còn lại 0đ" (không có điểm từng phần), vì chế độ tự động vốn dành cho
 * những đề đơn giản, không cần chấm chi tiết theo ý. Dùng lại đúng phần đếm
 * `correctCount` của scorePart2Question (chỉ thay công thức tính điểm).
 */
export function scorePart2AllOrNothing(
  correctAnswer: Part2SubAnswers,
  studentAnswer: Partial<Part2SubAnswers> | null | undefined,
  maxPoints: number,
): { correctCount: 0 | 1 | 2 | 3 | 4; score: number } {
  const { correctCount } = scorePart2Question(correctAnswer, studentAnswer);
  return { correctCount, score: correctCount === 4 ? maxPoints : 0 };
}

export type ScoringMode = "chuan_thpt" | "tuy_chinh";
export type CustomScoringMethod = "tu_dong" | "thu_cong" | null;

export interface ExamQuestionForScoring {
  question_id: string;
  part: 1 | 2 | 3;
  default_points: number | null;
  custom_points: number | null;
  custom_part2_points: Part2SubPoints | null;
}

export interface ResolvedQuestionScoring {
  maxScore: number;
  /** Chỉ có ý nghĩa với Phần 2 — khác null nghĩa là chấm THỦ CÔNG theo từng ý
   * (scorePart2Custom); null nghĩa là dùng bảng tỉ lệ chuẩn THPT (chế độ
   * chuẩn) hoặc chấm trọn/không (chế độ tự động). */
  part2SubPoints: Part2SubPoints | null;
}

/**
 * Tính điểm tối đa (và, riêng Phần 2, điểm từng ý nếu có) cho MỌI câu trong
 * 1 đề — dùng CHUNG cho lúc chấm điểm thật (api.submitAttempt) lẫn lúc chỉ
 * cần xem trước ở giao diện soạn đề. Ở chế độ "chuan_thpt" (mặc định, MỌI đề
 * tạo trước Đợt 3), kết quả GIỐNG HỆT barem cũ (0.25đ/câu Phần 1, tối đa
 * 1.0đ Phần 2 theo bảng tỉ lệ, default_points Phần 3) — không đổi hành vi
 * chấm điểm hiện có cho các đề đã tồn tại.
 */
export function resolveExamScoring(
  scoringMode: ScoringMode,
  customScoringMethod: CustomScoringMethod,
  examQuestions: ExamQuestionForScoring[],
): Map<string, ResolvedQuestionScoring> {
  const result = new Map<string, ResolvedQuestionScoring>();

  if (scoringMode !== "tuy_chinh") {
    for (const eq of examQuestions) {
      result.set(eq.question_id, {
        maxScore:
          eq.part === 1 ? PART1_POINTS_PER_QUESTION : eq.part === 2 ? 1 : eq.default_points ?? 0.5,
        part2SubPoints: null,
      });
    }
    return result;
  }

  if (customScoringMethod === "tu_dong") {
    const per = examQuestions.length > 0 ? Math.round((10 / examQuestions.length) * 100) / 100 : 0;
    for (const eq of examQuestions) {
      result.set(eq.question_id, { maxScore: per, part2SubPoints: null });
    }
    return result;
  }

  // "thu_cong" (hoặc chưa chọn cụ thể — coi như thủ công, câu chưa nhập điểm = 0đ)
  for (const eq of examQuestions) {
    if (eq.part === 2 && eq.custom_part2_points) {
      const p = eq.custom_part2_points;
      result.set(eq.question_id, {
        maxScore: Math.round((p.a + p.b + p.c + p.d) * 100) / 100,
        part2SubPoints: p,
      });
    } else {
      result.set(eq.question_id, { maxScore: eq.custom_points ?? 0, part2SubPoints: null });
    }
  }
  return result;
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
