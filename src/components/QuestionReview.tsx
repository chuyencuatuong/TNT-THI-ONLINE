import { MathText } from "./MathText";
import type {
  Part1Answer,
  Part1Options,
  Part2Answer,
  Part2Options,
  Part3Answer,
  QuestionRow,
} from "../lib/types";

const SUB_KEYS: ("a" | "b" | "c" | "d")[] = ["a", "b", "c", "d"];

/**
 * Hiển thị lại 1 câu hỏi SAU KHI học sinh đã nộp bài: đáp án học sinh đã chọn,
 * đáp án đúng, chỗ nào sai/thiếu, và lời giải chi tiết (nếu giáo viên đã nhập).
 * Không dùng để hiển thị lúc đang làm bài — xem Part1/2/3Question.tsx cho lúc đó.
 */
export function QuestionReview({
  number,
  question,
  finalAnswer,
  score,
  maxScore,
}: {
  number: number;
  question: QuestionRow;
  finalAnswer: unknown;
  score: number;
  maxScore: number;
}) {
  const isFullyCorrect = maxScore > 0 && score >= maxScore - 0.005;
  const isPartial = score > 0.005 && !isFullyCorrect;
  const statusClass = isFullyCorrect
    ? "question-review--correct"
    : isPartial
      ? "question-review--partial"
      : "question-review--wrong";
  const statusLabel = isFullyCorrect ? "Đúng" : isPartial ? "Đúng một phần" : "Sai";

  return (
    <div className={`question-card question-review ${statusClass}`}>
      <div className="question-header question-review-header">
        <span>
          Câu {number}. <MathText text={question.content_latex} />
        </span>
        <span className={`badge question-review-badge ${statusClass}`}>
          {statusLabel} · {score.toFixed(2)}/{maxScore.toFixed(2)} điểm
        </span>
      </div>
      {question.image_url && (
        <img className="question-image" src={question.image_url} alt="" />
      )}

      {question.part === 1 && (
        <Part1Review question={question} finalAnswer={finalAnswer as Part1Answer | null} />
      )}
      {question.part === 2 && (
        <Part2Review
          question={question}
          finalAnswer={finalAnswer as Partial<Part2Answer> | null}
        />
      )}
      {question.part === 3 && (
        <Part3Review question={question} finalAnswer={finalAnswer as Part3Answer | null} />
      )}

      {question.solution_latex && (
        <div className="question-solution">
          <div className="question-solution-title">Lời giải chi tiết</div>
          <MathText text={question.solution_latex} />
        </div>
      )}
    </div>
  );
}

function Part1Review({
  question,
  finalAnswer,
}: {
  question: QuestionRow;
  finalAnswer: Part1Answer | null;
}) {
  const options = question.options as Part1Options;
  const correct = (question.correct_answer as Part1Answer).choice;
  const studentChoice = finalAnswer?.choice ?? null;
  const choices: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

  return (
    <div className="choice-list">
      {choices.map((c) => {
        const isCorrectChoice = c === correct;
        const isStudentChoice = c === studentChoice;
        return (
          <div
            key={c}
            className={[
              "choice-item",
              "choice-item--readonly",
              isCorrectChoice ? "choice-item--correct-answer" : "",
              isStudentChoice && !isCorrectChoice ? "choice-item--wrong-answer" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="choice-letter">{c}</span>
            <MathText text={options.choices[c]} />
            {isStudentChoice && <span className="choice-tag">Học sinh chọn</span>}
            {isCorrectChoice && (
              <span className="choice-tag choice-tag--correct">Đáp án đúng</span>
            )}
          </div>
        );
      })}
      {!studentChoice && <p className="empty-hint">Học sinh không chọn đáp án nào.</p>}
    </div>
  );
}

function Part2Review({
  question,
  finalAnswer,
}: {
  question: QuestionRow;
  finalAnswer: Partial<Part2Answer> | null;
}) {
  const options = question.options as Part2Options;
  const correct = question.correct_answer as Part2Answer;
  const studentAnswer = finalAnswer ?? {};

  return (
    <table className="truefalse-table truefalse-table--review">
      <thead>
        <tr>
          <th>Ý</th>
          <th>Nội dung</th>
          <th>HS chọn</th>
          <th>Đáp án đúng</th>
        </tr>
      </thead>
      <tbody>
        {SUB_KEYS.map((key) => {
          const studentVal = studentAnswer[key];
          const correctVal = correct[key];
          const answered = studentVal !== undefined;
          const isMatch = answered && studentVal === correctVal;
          return (
            <tr
              key={key}
              className={!answered ? "" : isMatch ? "truefalse-row--correct" : "truefalse-row--wrong"}
            >
              <td className="truefalse-label">{key})</td>
              <td>
                <MathText text={options.items[key]} />
              </td>
              <td>{!answered ? "— (bỏ trống)" : studentVal ? "Đúng" : "Sai"}</td>
              <td>{correctVal ? "Đúng" : "Sai"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Part3Review({
  question,
  finalAnswer,
}: {
  question: QuestionRow;
  finalAnswer: Part3Answer | null;
}) {
  const correct = question.correct_answer as Part3Answer;
  const studentValue = finalAnswer?.value ?? null;

  return (
    <div className="short-answer-review">
      <p>
        <strong>Học sinh trả lời:</strong>{" "}
        {studentValue ? studentValue : <em>(bỏ trống)</em>}
      </p>
      <p>
        <strong>Đáp án đúng:</strong> {correct.value}
      </p>
    </div>
  );
}
