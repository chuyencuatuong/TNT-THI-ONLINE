import { MathText } from "./MathText";
import type { Part2Answer, Part2Options, QuestionRow } from "../lib/types";

const SUB_KEYS: ("a" | "b" | "c" | "d")[] = ["a", "b", "c", "d"];

export function Part2Question({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: QuestionRow;
  value: Partial<Part2Answer> | null;
  onChange: (value: Partial<Part2Answer>) => void;
}) {
  const options = question.options as Part2Options;

  function setSub(key: "a" | "b" | "c" | "d", val: boolean) {
    onChange({ ...(value ?? {}), [key]: val });
  }

  return (
    <div className="question-card">
      <div className="question-header">
        Câu {index + 1}. <MathText text={question.content_latex} />
      </div>
      {question.image_url && (
        <img className="question-image" src={question.image_url} alt="" />
      )}
      <table className="truefalse-table">
        <thead>
          <tr>
            <th>Ý</th>
            <th>Nội dung</th>
            <th>Đúng</th>
            <th>Sai</th>
          </tr>
        </thead>
        <tbody>
          {SUB_KEYS.map((key) => (
            <tr key={key}>
              <td className="truefalse-label">{key})</td>
              <td>
                <MathText text={options.items[key]} />
              </td>
              <td className="truefalse-radio">
                <input
                  type="radio"
                  name={`q-${question.id}-${key}`}
                  checked={value?.[key] === true}
                  onChange={() => setSub(key, true)}
                />
              </td>
              <td className="truefalse-radio">
                <input
                  type="radio"
                  name={`q-${question.id}-${key}`}
                  checked={value?.[key] === false}
                  onChange={() => setSub(key, false)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
