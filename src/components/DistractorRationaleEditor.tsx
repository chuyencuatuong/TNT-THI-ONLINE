import { useState } from "react";
import * as api from "../lib/api";
import { suggestOptionRationale } from "../lib/ai";
import { DISTRACTOR_ERROR_TYPE_LABELS } from "../lib/errorIntelligence";
import type {
  DistractorErrorType,
  Part1Answer,
  Part1Options,
  QuestionOptionRationaleRow,
  QuestionRow,
} from "../lib/types";

const ERROR_TYPES: DistractorErrorType[] = ["procedural", "conceptual", "calculation", "careless"];
const ALL_OPTION_KEYS = ["A", "B", "C", "D"] as const;

interface DraftRow {
  option_key: string;
  error_type: DistractorErrorType;
  pattern_label: string;
  rationale_text: string;
  ai_suggested: boolean;
}

/**
 * Gắn nhãn lỗi cho từng phương án nhiễu của 1 câu Phần 1 — AI soạn nháp từ
 * solution_latex, giáo viên sửa/xác nhận (migration_019, Đợt 1). Chỉ hiện cho
 * câu Phần 1 (Phần 2/3 không có phương án nhiễu rời rạc, xem tài liệu kiến
 * trúc v2 mục 2.5).
 */
export function DistractorRationaleEditor({ question }: { question: QuestionRow }) {
  const [existing, setExisting] = useState<QuestionOptionRationaleRow[] | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const rows = await api.listOptionRationale(question.id);
      setExisting(rows);
      if (rows.length > 0) {
        setDrafts(
          rows
            .filter((r) => !r.is_correct)
            .map((r) => ({
              option_key: r.option_key ?? "",
              error_type: r.error_type === "n_a" ? "conceptual" : r.error_type,
              pattern_label: r.pattern_label ?? "",
              rationale_text: r.rationale_text ?? "",
              ai_suggested: r.ai_suggested,
            })),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    setAiError(null);
    try {
      const existingLabels = question.lesson_id
        ? await api.listPatternLabelsForLesson(question.lesson_id)
        : [];
      const { suggestions, errorMessage } = await suggestOptionRationale(question, existingLabels);
      if (errorMessage) {
        setAiError(errorMessage);
        return;
      }
      setDrafts(
        suggestions
          .filter((s) => !s.is_correct)
          .map((s) => ({
            option_key: s.option_key,
            error_type: s.error_type === "n_a" ? "conceptual" : s.error_type,
            pattern_label: s.pattern_label ?? "",
            rationale_text: s.rationale_text,
            ai_suggested: true,
          })),
      );
    } finally {
      setAiLoading(false);
    }
  }

  function updateDraft(optionKey: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => prev?.map((d) => (d.option_key === optionKey ? { ...d, ...patch } : d)) ?? null);
  }

  async function handleConfirm() {
    if (!drafts) return;
    setSaving(true);
    try {
      const correctChoice = (question.correct_answer as Part1Answer).choice;
      const rows = ALL_OPTION_KEYS.map((key) => {
        if (key === correctChoice) {
          return {
            option_key: key as string,
            is_correct: true,
            error_type: "n_a" as DistractorErrorType,
            pattern_label: null,
            rationale_text: null,
            ai_suggested: false,
          };
        }
        const d = drafts.find((x) => x.option_key === key);
        return {
          option_key: key as string,
          is_correct: false,
          error_type: d?.error_type ?? ("n_a" as DistractorErrorType),
          pattern_label: d?.pattern_label.trim() || null,
          rationale_text: d?.rationale_text.trim() || null,
          ai_suggested: d?.ai_suggested ?? false,
        };
      });
      await api.upsertOptionRationale(question.id, rows);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (question.part !== 1) return null;
  const options = (question.options as Part1Options).choices;

  return (
    <div className="rationale-editor">
      {existing === null ? (
        <button type="button" className="btn-link" onClick={load} disabled={loading}>
          {loading ? "Đang tải..." : "Gắn nhãn lỗi cho phương án nhiễu"}
        </button>
      ) : (
        <div className="inline-create-box">
          <div className="option-row">
            <button type="button" className="btn-secondary" onClick={handleAiSuggest} disabled={aiLoading}>
              {aiLoading ? "Đang hỏi AI..." : "Gợi ý bằng AI"}
            </button>
            {existing.length > 0 && (
              <span className="tag tag--muted">
                {existing.every((r) => r.verified_by_teacher) ? "Đã xác nhận" : "Có nháp chưa xác nhận"}
              </span>
            )}
          </div>
          {aiError && <p className="ai-hint">{aiError}</p>}
          {drafts && drafts.length > 0 ? (
            <>
              {drafts.map((d) => (
                <div key={d.option_key} className="option-row">
                  <span className="tag">{d.option_key}</span>
                  <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {options[d.option_key as "A" | "B" | "C" | "D"]}
                  </span>
                  <select
                    value={d.error_type}
                    onChange={(e) => updateDraft(d.option_key, { error_type: e.target.value as DistractorErrorType })}
                  >
                    {ERROR_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {DISTRACTOR_ERROR_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={d.pattern_label}
                    onChange={(e) => updateDraft(d.option_key, { pattern_label: e.target.value })}
                    placeholder="Nhãn ngắn (vd: Quên đổi cận)"
                    style={{ minWidth: 160 }}
                  />
                  <input
                    type="text"
                    value={d.rationale_text}
                    onChange={(e) => updateDraft(d.option_key, { rationale_text: e.target.value })}
                    placeholder="Mô tả đầy đủ"
                    style={{ minWidth: 220 }}
                  />
                  {d.ai_suggested && <span className="tag tag--muted">AI gợi ý</span>}
                </div>
              ))}
              <button type="button" className="btn-primary" onClick={handleConfirm} disabled={saving}>
                {saving ? "Đang lưu..." : "Xác nhận"}
              </button>
            </>
          ) : (
            !aiLoading && <p className="empty-hint">Chưa có nhãn nào — bấm &quot;Gợi ý bằng AI&quot; để bắt đầu.</p>
          )}
        </div>
      )}
    </div>
  );
}
