import type { Part1Answer, Part1Options, Part2Answer, Part2Options, QuestionRow } from "./types";

/** Fisher–Yates, nhận randomFn để test được (mặc định Math.random). */
function shuffledPermutation<T>(keys: T[], randomFn: () => number): T[] {
  const arr = keys.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Xáo ngẫu nhiên VỊ TRÍ đáp án (Phần 1: A/B/C/D, Phần 2: a/b/c/d) mỗi khi 1
 * câu xuất hiện ở màn hình ÔN TẬP CÂU SAI — để học sinh không thể "đối phó"
 * bằng cách nhớ đúng vị trí đã bấm ở buổi trước rồi bấm lại y hệt vị trí đó
 * cả 3 buổi liên tiếp mà không thực sự hiểu bài (đúng vấn đề người dùng nêu
 * ra khi yêu cầu tính năng này).
 *
 * CHỈ dùng ở màn hình ôn tập — KHÔNG áp dụng cho đề thi thật (ExamTakingPage):
 * đáp án đề thi thật lưu theo đúng nhãn A/B/C/D gốc trong answer_events/
 * question_responses, xáo ở đó sẽ làm sai lệch toàn bộ dữ liệu thống kê đã
 * tích luỹ (thời gian từng câu, lịch sử đổi đáp án...) — không phải mục tiêu
 * của yêu cầu này.
 *
 * Trả về 1 QuestionRow MỚI (không sửa object gốc) với `options` đã hoán vị
 * theo đúng cấu trúc {A,B,C,D}/{a,b,c,d} sẵn có, nên Part1Question/
 * Part2Question dùng lại được nguyên vẹn không cần sửa gì; `correct_answer`
 * trong bản mới cũng được tính lại đúng theo vị trí mới.
 */
export function shuffleQuestionForReview(
  question: QuestionRow,
  randomFn: () => number = Math.random,
): QuestionRow {
  if (question.part === 1) {
    const keys: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];
    const perm = shuffledPermutation(keys, randomFn); // vị trí i hiển thị nội dung gốc của perm[i]
    const oldOptions = question.options as Part1Options;
    const oldCorrect = (question.correct_answer as Part1Answer).choice;
    const newChoices = {} as Part1Options["choices"];
    let newCorrect: "A" | "B" | "C" | "D" = oldCorrect;
    keys.forEach((label, i) => {
      newChoices[label] = oldOptions.choices[perm[i]];
      if (perm[i] === oldCorrect) newCorrect = label;
    });
    return {
      ...question,
      options: { choices: newChoices },
      correct_answer: { choice: newCorrect } as Part1Answer,
    };
  }

  if (question.part === 2) {
    const keys: ("a" | "b" | "c" | "d")[] = ["a", "b", "c", "d"];
    const perm = shuffledPermutation(keys, randomFn);
    const oldOptions = question.options as Part2Options;
    const oldCorrect = question.correct_answer as Part2Answer;
    const newItems = {} as Part2Options["items"];
    const newCorrect = {} as Part2Answer;
    keys.forEach((label, i) => {
      newItems[label] = oldOptions.items[perm[i]];
      newCorrect[label] = oldCorrect[perm[i]];
    });
    return {
      ...question,
      options: { items: newItems },
      correct_answer: newCorrect,
    };
  }

  // Phần 3 (trả lời ngắn) không có vị trí đáp án nào để xáo trộn.
  return question;
}
