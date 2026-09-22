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
 * Gắn nhãn lỗi cho từng phương án nhiễu của 1 câu Phần 1 (migration_019,
 * Đợt 1). Đường vào chính là "Gợi ý nhanh" — điền sẵn nhãn dùng nhiều nhất
 * cho Bài này từ dữ liệu đã có, KHÔNG gọi AI, không giới hạn số lần dùng.
 * "Gợi ý bằng AI" là tuỳ chọn thêm (soạn mô tả chi tiết hơn dựa vào
 * solution_latex) nhưng dùng CHUNG hạn mức Gemini free tier (20 lượt/ngày)
 * với các tính năng AI khác trong hệ thống — xem ghi chú model trong ai.ts.
 *
 * Sửa 22/09/2026 theo phản hồi thực tế của Thầy Tường: trước đó (1) bắt
 * buộc gọi AI thành công mới vào được chế độ sửa — hạn mức AI hết là không
 * gắn nhãn được luôn; (2) pattern_label chỉ có ô gõ tay tự do, không có menu
 * chọn nhãn có sẵn, dễ gõ lệch chính tả cùng 1 lỗi (vd "Quên đổi cận" vs
 * "quên đổi cận") — làm gãy việc đếm theo pattern_label ở "Progress Story"
 * (Đợt 5) vì đó là đếm CHUỖI CHÍNH XÁC, không gộp mờ theo AI.
 */
export function DistractorRationaleEditor({ question }: { question: QuestionRow }) {
  const [existing, setExisting] = useState<QuestionOptionRationaleRow[] | null>(null);
  const [labelStats, setLabelStats] = useState<api.PatternLabelStat[]>([]);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rows, stats] = await Promise.all([
        api.listOptionRationale(question.id),
        question.lesson_id
          ? api.listPatternLabelStatsForLesson(question.lesson_id)
          : Promise.resolve([] as api.PatternLabelStat[]),
      ]);
      setExisting(rows);
      setLabelStats(stats);
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

  // Nhãn duy nhất, xếp theo số lần dùng nhiều nhất trước — nguồn cho dropdown
  // "chọn nhãn có sẵn" và cho "Gợi ý nhanh" bên dưới.
  const uniqueLabels: { label: string; error_type: DistractorErrorType; count: number }[] = [];
  {
    const seen = new Set<string>();
    for (const s of labelStats) {
      if (seen.has(s.pattern_label)) continue;
      seen.add(s.pattern_label);
      uniqueLabels.push({ label: s.pattern_label, error_type: s.error_type, count: s.count });
    }
  }

  function nonCorrectKeys(): string[] {
    const correctChoice = (question.correct_answer as Part1Answer).choice;
    return ALL_OPTION_KEYS.filter((k) => k !== correctChoice);
  }

  /** Điền sẵn nháp từ nhãn dùng NHIỀU NHẤT cho Bài này — thuần dữ liệu đã
   * tải sẵn ở load(), không gọi AI, không tốn hạn mức, dùng bao nhiêu lần
   * cũng được. Nếu Bài chưa có nhãn nào trước đó, vẫn tạo 3 dòng trống để
   * giáo viên gõ tay/chọn từ dropdown — quan trọng là LUÔN vào được chế độ
   * sửa mà không cần chờ AI. */
  function handleQuickStart() {
    const top = labelStats[0];
    setDrafts(
      nonCorrectKeys().map((key) => ({
        option_key: key,
        error_type: top?.error_type ?? "conceptual",
        pattern_label: top?.pattern_label ?? "",
        rationale_text: "",
        ai_suggested: false,
      })),
    );
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    setAiError(null);
    try {
      const existingLabels = uniqueLabels.map((u) => u.label);
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
          {drafts === null && (
            <>
              <div className="option-row">
                <button type="button" className="btn-primary" onClick={handleQuickStart}>
                  Gợi ý nhanh (không cần AI)
                </button>
                <button type="button" className="btn-secondary" onClick={handleAiSuggest} disabled={aiLoading}>
                  {aiLoading ? "Đang hỏi AI..." : "Gợi ý bằng AI"}
                </button>
                {existing.length > 0 && (
                  <span className="tag tag--muted">
                    {existing.every((r) => r.verified_by_teacher) ? "Đã xác nhận" : "Có nháp chưa xác nhận"}
                  </span>
                )}
              </div>
              <p className="ai-hint">
                &quot;Gợi ý nhanh&quot; điền sẵn nhãn dùng nhiều nhất cho Bài này (dựa vào các câu đã gắn nhãn
                trước đó), dùng bao nhiêu lần cũng được. &quot;Gợi ý bằng AI&quot; soạn mô tả chi tiết hơn nhưng
                dùng chung hạn mức Gemini miễn phí (20 lượt/ngày) với các tính năng AI khác — nên để dành, không
                dùng cho gắn nhãn hàng loạt.
              </p>
            </>
          )}
          {aiError && <p className="ai-hint">{aiError}</p>}
          {drafts && drafts.length > 0 && (
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
                  <select
                    value=""
                    onChange={(e) => {
                      const label = e.target.value;
                      if (!label) return;
                      const stat = uniqueLabels.find((u) => u.label === label);
                      updateDraft(d.option_key, {
                        pattern_label: label,
                        error_type: stat?.error_type ?? d.error_type,
                      });
                    }}
                    style={{ minWidth: 130 }}
                  >
                    <option value="">-- Nhãn có sẵn --</option>
                    {uniqueLabels.map((u) => (
                      <option key={u.label} value={u.label}>
                        {u.label} ({u.count})
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
          )}
        </div>
      )}
    </div>
  );
}
