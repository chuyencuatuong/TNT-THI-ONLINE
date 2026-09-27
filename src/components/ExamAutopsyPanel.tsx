import { useEffect, useState } from "react";
import * as api from "../lib/api";
import {
  buildExamAutopsy,
  ERROR_TYPE_COLOR,
  ERROR_TYPE_SHORT_LABELS,
  summarizePatternRecurrence,
  toPatternOccurrences,
  type ExamAutopsy,
  type RecurringPatternResult,
} from "../lib/errorIntelligence";
import type { ProfileAudience } from "../lib/learningState";

/**
 * Mổ xẻ 1 bài thi (Module 1): điểm mất theo Bài, cụm Error DNA, từng câu sai
 * kèm loại lỗi + mức tin cậy. Tính on-demand từ getStudentLearningBundle —
 * nhãn lỗi thầy xác nhận sau khi học sinh đã thi vẫn hiện ra ở đây.
 */
export function ExamAutopsyPanel({
  studentId,
  attemptId,
  audience,
  questionNumbers,
}: {
  studentId: string;
  attemptId: string;
  audience: ProfileAudience;
  /** question_id -> số thứ tự "Câu n" đúng như lúc làm bài. */
  questionNumbers?: Map<string, number>;
}) {
  const [autopsy, setAutopsy] = useState<ExamAutopsy | null>(null);
  const [recurring, setRecurring] = useState<RecurringPatternResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAutopsy(null);
    setError(null);
    api
      .getStudentLearningBundle(studentId)
      .then((bundle) => {
        if (cancelled) return;
        const facts = bundle.facts.filter((f) => f.attemptId === attemptId);
        const instances = bundle.instances.filter((i) => i.attemptId === attemptId);
        setAutopsy(buildExamAutopsy(facts, instances));
        setRecurring(summarizePatternRecurrence(toPatternOccurrences(bundle.instances)));
      })
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [studentId, attemptId]);

  if (error) return <p className="ai-hint">Không tải được phần mổ xẻ bài thi: {error}</p>;
  if (!autopsy) return <p className="empty-hint">Đang phân tích bài làm...</p>;

  const wrongCount = autopsy.wrongQuestions.length;
  const recurringHere = recurring.filter((r) =>
    autopsy.wrongQuestions.some((w) => w.patternLabel === r.patternLabel),
  );
  const who = audience === "student" ? "Em" : "Học sinh";

  if (autopsy.totalLost === 0) {
    return <p className="li-narrative">Bài làm không mất điểm câu nào — không có lỗi để mổ xẻ.</p>;
  }

  return (
    <div className="li-rows" style={{ gap: 18 }}>
      <section>
        <h3>Điểm bị mất nằm ở đâu</h3>
        <p className="empty-hint">
          {who} mất {autopsy.totalLost} / {autopsy.totalPossible} điểm (quy về barem chuẩn) — gồm {wrongCount} câu sai
          {autopsy.blankCount > 0 ? ` và ${autopsy.blankCount} câu bỏ trống` : ""}.
        </p>
        <div className="table-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Bài</th>
                <th>Điểm mất</th>
                <th>Câu sai</th>
                <th>Bỏ trống</th>
              </tr>
            </thead>
            <tbody>
              {autopsy.scoreLoss.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td>
                    {r.pointsLost} / {r.pointsPossible}
                  </td>
                  <td>{r.wrongCount}</td>
                  <td>{r.blankCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {wrongCount > 0 && (
        <section>
          <h3>Bản chất các lỗi (Error DNA)</h3>
          <div className="li-chips">
            {autopsy.errorDna.map((c) => (
              <span
                key={c.errorType}
                className="li-chip"
                style={{ ["--li-chip-color" as string]: ERROR_TYPE_COLOR[c.errorType] }}
              >
                <strong>{ERROR_TYPE_SHORT_LABELS[c.errorType]}</strong> {c.count} câu ({Math.round(c.share * 100)}%)
                {c.patternLabels.length > 0 && ` · ${c.patternLabels.map((p) => p.label).join(", ")}`}
              </span>
            ))}
          </div>
          <p className="li-summary-line">
            {autopsy.highConfidenceCount}/{wrongCount} câu sai đã xác định được loại lỗi từ nhãn thầy đã duyệt
            {autopsy.highConfidenceCount < wrongCount &&
              " — các câu còn lại sẽ tự cập nhật khi thầy gắn nhãn thêm cho phương án học sinh đã chọn"}
            .
          </p>
          {recurringHere.length > 0 && (
            <div className="li-rows" style={{ marginTop: 8 }}>
              {recurringHere.map((r) => (
                <p key={r.patternLabel} className="li-narrative li-narrative--warn">
                  Lỗi lặp lại: "{r.patternLabel}" đã gặp {r.totalCount} lần trên {r.distinctExamCount} đề khác nhau.
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {wrongCount > 0 && (
        <section>
          <h3>Từng câu sai</h3>
          <div className="diagnosis-list">
            {autopsy.wrongQuestions.map((w) => (
              <div key={w.questionId} className="diagnosis-card">
                <div className="diagnosis-card-header">
                  <span>
                    {questionNumbers?.get(w.questionId) ? `Câu ${questionNumbers.get(w.questionId)}` : "Câu"} · Phần{" "}
                    {w.part}
                    {w.lessonName ? ` · ${w.lessonName}` : ""}
                  </span>
                  <span className="diagnosis-badge" style={{ background: ERROR_TYPE_COLOR[w.errorType] }}>
                    {ERROR_TYPE_SHORT_LABELS[w.errorType]}
                  </span>
                </div>
                {w.part === 1 && w.chosenOption && (
                  <p className="diagnosis-meta">
                    Đã chọn {w.chosenOption} — đáp án đúng {w.correctOption}
                  </p>
                )}
                {w.patternLabel && (
                  <p className="diagnosis-note">
                    <strong>{w.patternLabel}</strong>
                    {w.rationaleText ? ` — ${w.rationaleText}` : ""}
                  </p>
                )}
                <p className="li-summary-line">
                  {w.confidence === "high"
                    ? "Độ tin cậy cao — từ nhãn lỗi thầy đã xác nhận cho phương án này."
                    : w.confidence === "medium"
                      ? `Độ tin cậy trung bình — ${w.reason}`
                      : w.part === 1
                        ? "Phương án này chưa được gắn nhãn lỗi nên chưa xác định được bản chất lỗi."
                        : "Câu Phần 2/3 không có phương án nhiễu để tra nhãn — chỉ nhận diện được lỗi bất cẩn qua thời gian làm."}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
