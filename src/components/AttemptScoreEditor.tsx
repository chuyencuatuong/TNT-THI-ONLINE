import { useMemo, useState } from "react";
import * as api from "../lib/api";
import { combineScores, scoreQuestionWithAnswer } from "../lib/scoring";
import { MathText } from "./MathText";
import { Part1Question } from "./Part1Question";
import { Part2Question } from "./Part2Question";
import { Part3Question } from "./Part3Question";
import type { Part1Answer, Part2Answer, Part3Answer } from "../lib/types";

/**
 * Màn hình "Sửa điểm" cho giáo viên (14/09/2026) — dùng khi có trục trặc
 * khách quan khiến học sinh không điền được đáp án, hoặc đáp án ghi nhận
 * không đúng thứ các em thật sự chọn.
 *
 * NGUYÊN TẮC: giáo viên sửa ĐÁP ÁN của đúng câu bị trục trặc, không gõ thẳng
 * tổng điểm. Hệ thống chấm lại bằng đúng bộ máy chấm lúc nộp bài
 * (scoreQuestionWithAnswer) nên "năng lực theo Chương/Bài", phần chẩn đoán và
 * nhật ký câu sai đều tự khớp theo — xem api.regradeAttempt.
 *
 * Tổng điểm mới được XEM TRƯỚC ngay tại đây bằng CHÍNH hàm chấm đó (không
 * phải công thức xấp xỉ riêng của giao diện), nên con số giáo viên thấy trước
 * khi lưu luôn bằng con số sẽ được ghi vào CSDL.
 *
 * Đáp án gốc học sinh đã điền KHÔNG bị ghi đè (nằm ở question_responses.
 * final_answer, log thô ở answer_events) — luôn đối chiếu lại được.
 */

type AnyAnswer = Part1Answer | Partial<Part2Answer> | Part3Answer;

function formatAnswer(part: 1 | 2 | 3, answer: unknown): string {
  if (answer === null || answer === undefined) return "(bỏ trống)";
  if (part === 1) return (answer as Part1Answer).choice ?? "(bỏ trống)";
  if (part === 3) {
    const v = (answer as Part3Answer).value;
    return v === "" || v === undefined ? "(bỏ trống)" : v;
  }
  const a = answer as Partial<Part2Answer>;
  const keys: ("a" | "b" | "c" | "d")[] = ["a", "b", "c", "d"];
  const parts = keys.map((k) => `${k}: ${a[k] === undefined ? "—" : a[k] ? "Đ" : "S"}`);
  return parts.join(" · ");
}

export function AttemptScoreEditor({
  attemptId,
  examId,
  studentId,
  teacherId,
  data,
  onSaved,
  onCancel,
}: {
  attemptId: string;
  examId: string;
  studentId: string;
  teacherId: string;
  data: api.AttemptEditingData;
  onSaved: (result: api.RegradeAttemptResult) => void;
  onCancel: () => void;
}) {
  // question_id -> đáp án mới. Chỉ chứa những câu giáo viên ĐỘNG TỚI trong
  // lần này; câu không có ở đây thì giữ nguyên hiện trạng (kể cả phần đã sửa
  // ở lần trước). Giá trị null = bỏ phần sửa, quay về đáp án gốc của HS.
  const [edits, setEdits] = useState<Record<string, AnyAnswer | null>>({});
  const [reason, setReason] = useState("");
  const [onlyWrong, setOnlyWrong] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Đáp án đang áp dụng cho 1 câu, sau khi tính cả phần vừa sửa chưa lưu. */
  function currentAnswerOf(item: api.AttemptEditableItem): unknown {
    if (Object.prototype.hasOwnProperty.call(edits, item.question_id)) {
      return edits[item.question_id] ?? item.studentAnswer;
    }
    return item.effectiveAnswer;
  }

  /** Câu này đang có đáp án khác với đáp án gốc học sinh đã điền hay không. */
  function isOverridden(item: api.AttemptEditableItem): boolean {
    if (Object.prototype.hasOwnProperty.call(edits, item.question_id)) {
      return edits[item.question_id] !== null;
    }
    return item.teacherAnswer !== null;
  }

  // Điểm xem trước — tính bằng ĐÚNG hàm chấm của hệ thống.
  const preview = useMemo(() => {
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    const perQuestion = new Map<string, number>();
    for (const item of data.items) {
      const { score } = scoreQuestionWithAnswer(
        item.question,
        currentAnswerOf(item),
        item.resolved,
        data.isCustomScoring,
      );
      perQuestion.set(item.question_id, score);
      if (item.part === 1) p1 += score;
      else if (item.part === 2) p2 += score;
      else p3 += score;
    }
    return { totals: combineScores(p1, p2, p3), perQuestion };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, edits]);

  const currentTotal = useMemo(
    () => combineScores(
      data.items.filter((i) => i.part === 1).reduce((s, i) => s + i.score, 0),
      data.items.filter((i) => i.part === 2).reduce((s, i) => s + i.score, 0),
      data.items.filter((i) => i.part === 3).reduce((s, i) => s + i.score, 0),
    ).totalScore,
    [data],
  );

  const delta = Math.round((preview.totals.totalScore - currentTotal) * 100) / 100;
  const touchedCount = Object.keys(edits).length;
  const visibleItems = onlyWrong
    ? data.items.filter(
        (i) => (preview.perQuestion.get(i.question_id) ?? 0) < i.maxScore || isOverridden(i),
      )
    : data.items;

  function setAnswer(questionId: string, value: AnyAnswer) {
    setEdits((prev) => ({ ...prev, [questionId]: value }));
  }

  /** Đặt câu này thành ĐÚNG HOÀN TOÀN — thao tác hay dùng nhất: câu bị lỗi
   * kỹ thuật, giáo viên xác nhận học sinh đáng ra được trọn điểm. */
  function markFullyCorrect(item: api.AttemptEditableItem) {
    setAnswer(item.question_id, item.question.correct_answer as AnyAnswer);
  }

  /** Bỏ phần sửa, trả câu về đúng đáp án gốc học sinh đã điền. */
  function resetToStudent(item: api.AttemptEditableItem) {
    setEdits((prev) => ({ ...prev, [item.question_id]: null }));
  }

  async function handleSave() {
    if (!reason.trim()) {
      setError("Vui lòng ghi lý do điều chỉnh — học sinh sẽ đọc được lý do này.");
      return;
    }
    if (touchedCount === 0) {
      setError("Chưa sửa câu nào.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.regradeAttempt({
        attemptId,
        examId,
        studentId,
        teacherId,
        reason: reason.trim(),
        edits: edits as Record<string, unknown>,
      });
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được, vui lòng thử lại.");
      setSaving(false);
    }
  }

  return (
    <div className="score-editor">
      <div className="score-editor-head">
        <div>
          <div className="score-editor-title">Sửa điểm bài làm</div>
          <div className="empty-hint" style={{ padding: 0 }}>
            Sửa lại đáp án của câu bị trục trặc, hệ thống sẽ tự chấm lại. Đáp án gốc học sinh đã
            điền vẫn được giữ nguyên để đối chiếu.
          </div>
        </div>
        <div className="score-editor-preview">
          <span className="score-editor-preview-old">{currentTotal.toFixed(2)}</span>
          <span className="score-editor-preview-arrow">→</span>
          <span className="score-editor-preview-new">{preview.totals.totalScore.toFixed(2)}</span>
          {delta !== 0 && (
            <span className={`score-editor-delta score-editor-delta--${delta > 0 ? "up" : "down"}`}>
              {delta > 0 ? "+" : ""}
              {delta.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <label className="score-editor-filter">
        <input
          type="checkbox"
          checked={onlyWrong}
          onChange={(e) => setOnlyWrong(e.target.checked)}
        />
        Chỉ hiện câu chưa trọn điểm ({visibleItems.length}/{data.items.length} câu)
      </label>

      {visibleItems.length === 0 ? (
        <p className="empty-hint">Bài này đúng trọn vẹn mọi câu — không có gì để sửa.</p>
      ) : (
        <div className="score-editor-list">
          {visibleItems.map((item) => {
            const answer = currentAnswerOf(item);
            const newScore = preview.perQuestion.get(item.question_id) ?? 0;
            const overridden = isOverridden(item);
            const number = item.order_index + 1;
            return (
              <div
                key={item.question_id}
                className={`score-editor-item${overridden ? " score-editor-item--edited" : ""}`}
              >
                {item.part === 1 && (
                  <Part1Question
                    number={number}
                    question={item.question}
                    value={(answer as Part1Answer | null) ?? null}
                    onChange={(v) => setAnswer(item.question_id, v)}
                  />
                )}
                {item.part === 2 && (
                  <Part2Question
                    number={number}
                    question={item.question}
                    value={(answer as Partial<Part2Answer> | null) ?? null}
                    onChange={(v) => setAnswer(item.question_id, v)}
                  />
                )}
                {item.part === 3 && (
                  <Part3Question
                    number={number}
                    question={item.question}
                    value={(answer as Part3Answer | null) ?? null}
                    onChange={(v) => setAnswer(item.question_id, v)}
                  />
                )}

                <div className="score-editor-item-foot">
                  <div className="score-editor-facts">
                    <span>
                      Học sinh điền: <strong>{formatAnswer(item.part, item.studentAnswer)}</strong>
                    </span>
                    <span>
                      Đáp án đúng:{" "}
                      <strong>{formatAnswer(item.part, item.question.correct_answer)}</strong>
                    </span>
                    <span
                      className={`score-editor-points${
                        newScore >= item.maxScore ? " score-editor-points--full" : ""
                      }`}
                    >
                      {newScore.toFixed(2)}/{item.maxScore.toFixed(2)} đ
                    </span>
                    {overridden && <span className="score-editor-badge">Đã sửa</span>}
                  </div>
                  <div className="score-editor-item-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => markFullyCorrect(item)}
                      disabled={newScore >= item.maxScore}
                    >
                      Cho trọn điểm
                    </button>
                    {overridden && (
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => resetToStudent(item)}
                      >
                        Bỏ sửa
                      </button>
                    )}
                  </div>
                </div>

                {item.question.solution_latex && (
                  <details className="score-editor-solution">
                    <summary>Xem lời giải</summary>
                    <MathText text={item.question.solution_latex} />
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="score-editor-save">
        <label className="score-editor-reason">
          <span>
            Lý do điều chỉnh <span className="score-editor-required">(bắt buộc)</span>
          </span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: Máy của em bị treo ở câu 12-14, không bấm chọn được đáp án."
          />
          <span className="empty-hint" style={{ padding: 0 }}>
            Học sinh sẽ đọc được lý do này ở trang kết quả.
          </span>
        </label>

        {error && <div className="score-editor-error">{error}</div>}

        <div className="score-editor-buttons">
          <button
            className="btn-primary"
            onClick={() => void handleSave()}
            disabled={saving || touchedCount === 0}
          >
            {saving
              ? "Đang lưu..."
              : `Lưu & chấm lại (${touchedCount} câu → ${preview.totals.totalScore.toFixed(2)} đ)`}
          </button>
          <button className="btn-link" onClick={onCancel} disabled={saving}>
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}
