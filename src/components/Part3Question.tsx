import { MathText } from "./MathText";
import type { Part3Answer, QuestionRow } from "../lib/types";

export function Part3Question({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: QuestionRow;
  value: Part3Answer | null;
  onChange: (value: Part3Answer) => void;
}) {
  return (
    <div className="question-card">
      <div className="question-header">
        Câu {index + 1}. <MathText text={question.content_latex} />
      </div>
      {question.image_url && (
        <img className="question-image" src={question.image_url} alt="" />
      )}
      <input
        className="short-answer-input"
        type="text"
        placeholder="Nhập đáp án..."
        value={value?.value ?? ""}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    </div>
  );
}
