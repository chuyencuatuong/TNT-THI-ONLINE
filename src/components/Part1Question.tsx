import { MathText } from "./MathText";
import type { Part1Answer, Part1Options, QuestionRow } from "../lib/types";

export function Part1Question({
  number,
  question,
  value,
  onChange,
}: {
  number: number;
  question: QuestionRow;
  value: Part1Answer | null;
  onChange: (value: Part1Answer) => void;
}) {
  const options = question.options as Part1Options;
  const choices: ("A" | "B" | "C" | "D")[] = ["A", "B", "C", "D"];

  return (
    <div className="question-card">
      <div className="question-header">
        Câu {number}. <MathText text={question.content_latex} />
      </div>
      {question.image_url && (
        <img className="question-image" src={question.image_url} alt="" />
      )}
      <div className="choice-list">
        {choices.map((c) => (
          <label
            key={c}
            className={`choice-item ${value?.choice === c ? "choice-item--selected" : ""}`}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              checked={value?.choice === c}
              onChange={() => onChange({ choice: c })}
            />
            <span className="choice-letter">{c}</span>
            <MathText text={options.choices[c]} />
          </label>
        ))}
      </div>
    </div>
  );
}
