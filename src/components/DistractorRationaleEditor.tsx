import { useState } from "react";
import * as api from "../lib/api";
import { suggestOptionRationale } from "../lib/ai";
import type { QuestionOptionRationaleRow, QuestionRow } from "../lib/types";
import {
  blankDrafts,
  draftsFromRows,
  missingErrorTypes,
  RationaleRowsEditor,
  toSaveRows,
  type LabelOption,
  type RationaleDraftRow,
} from "./RationaleRowsEditor";

export type RationaleUiStatus = "verified" | "draft" | "none";

export const RATIONALE_STATUS_LABEL: Record<RationaleUiStatus, string> = {
  verified: "✓ Đã xác nhận",
  draft: "Nháp AI — chờ xác nhận",
  none: "Chưa gắn nhãn",
};

function statusOf(rows: QuestionOptionRationaleRow[]): RationaleUiStatus {
  if (rows.length === 0) return "none";
  return rows.every((r) => r.verified_by_teacher) ? "verified" : "draft";
}

/**
 * Gắn nhãn lỗi cho phương án nhiễu của 1 câu Phần 1, mở ngay trong Ngân hàng
 * câu hỏi. Muốn gắn NHANH nhiều câu (ưu tiên câu học sinh sai nhiều, AI soạn
 * nháp theo lô) dùng trang "Gắn nhãn lỗi" (TeacherRationaleQueue.tsx) — 2 nơi
 * dùng chung phần soạn nhãn RationaleRowsEditor.
 */
export function DistractorRationaleEditor({
  question,
  onStatusChange,
}: {
  question: QuestionRow;
  onStatusChange?: (status: RationaleUiStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<QuestionOptionRationaleRow[]>([]);
  const [labelOptions, setLabelOptions] = useState<LabelOption[]>([]);
  const [drafts, setDrafts] = useState<RationaleDraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const [existing, stats] = await Promise.all([
        api.listOptionRationale(question.id),
        question.lesson_id ? api.listPatternLabelStatsForLesson(question.lesson_id) : Promise.resolve([]),
      ]);
      setRows(existing);
      const options = stats.map((s) => ({ label: s.pattern_label, errorType: s.error_type, count: s.count }));
      const seen = new Set<string>();
      setLabelOptions(options.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true))));
      setDrafts(existing.length > 0 ? draftsFromRows(question, existing) : blankDrafts(question));
      setOpen(true);
    } catch (err) {
      setMessage(
        api.isMissingTableError(err)
          ? "Chưa chạy migration_019_error_intelligence_core.sql trên Supabase — xem hướng dẫn trong tài liệu."
          : `Không tải được nhãn lỗi: ${(err as Error).message}`,
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleAi() {
    setAiLoading(true);
    setMessage(null);
    try {
      const { suggestions, errorMessage } = await suggestOptionRationale(
        question,
        labelOptions.map((o) => o.label),
      );
      if (errorMessage) {
        setMessage(errorMessage);
        return;
      }
      setSavedAt(null);
      setDrafts((prev) =>
        prev.map((d) => {
          const s = suggestions.find((x) => x.option_key === d.option_key && !x.is_correct);
          return s
            ? {
                ...d,
                error_type: s.error_type === "n_a" ? "" : s.error_type,
                pattern_label: s.pattern_label ?? "",
                rationale_text: s.rationale_text,
                ai_suggested: true,
              }
            : d;
        }),
      );
    } finally {
      setAiLoading(false);
    }
  }

  async function handleConfirm() {
    const missing = missingErrorTypes(drafts);
    if (missing.length > 0) {
      setMessage(`Chọn loại lỗi cho phương án ${missing.join(", ")} trước khi xác nhận.`);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.upsertOptionRationale(question.id, toSaveRows(question, drafts), { verified: true });
      const fresh = await api.listOptionRationale(question.id);
      setRows(fresh);
      setSavedAt(new Date());
      onStatusChange?.(statusOf(fresh));
    } catch (err) {
      setMessage(`Lưu thất bại: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (question.part !== 1) return null;

  if (!open) {
    return (
      <div className="rationale-editor">
        <button type="button" className="btn-link" onClick={load} disabled={loading}>
          {loading ? "Đang tải..." : "Gắn nhãn lỗi cho phương án nhiễu"}
        </button>
        {message && <p className="ai-hint">{message}</p>}
      </div>
    );
  }

  const status = statusOf(rows);
  return (
    <div className="li-panel">
      <div className="li-toolbar">
        <span className={`li-status li-status--${status}`}>{RATIONALE_STATUS_LABEL[status]}</span>
        {savedAt && (
          <span className="li-status li-status--verified">
            Đã lưu lúc {savedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {labelOptions.length > 0 && (
          <button
            type="button"
            className="btn-link"
            onClick={() => {
              setSavedAt(null);
              setDrafts(blankDrafts(question, labelOptions[0]));
            }}
          >
            Gợi ý nhanh (nhãn phổ biến nhất)
          </button>
        )}
        <button type="button" className="btn-link" onClick={handleAi} disabled={aiLoading}>
          {aiLoading ? "AI đang soạn..." : "AI soạn nháp"}
        </button>
        <button type="button" className="btn-link" onClick={() => setOpen(false)}>
          Thu gọn
        </button>
      </div>
      {message && <p className="ai-hint">{message}</p>}
      <RationaleRowsEditor
        question={question}
        drafts={drafts}
        labelOptions={labelOptions}
        disabled={saving}
        onChange={(key, patch) => {
          setSavedAt(null);
          setDrafts((prev) => prev.map((d) => (d.option_key === key ? { ...d, ...patch } : d)));
        }}
      />
      <div className="li-actions">
        <button type="button" className="btn-primary" onClick={handleConfirm} disabled={saving}>
          {saving ? "Đang lưu..." : status === "verified" ? "Lưu thay đổi" : "Xác nhận"}
        </button>
        <span className="li-summary-line">
          Chỉ nhãn đã xác nhận mới được dùng để chẩn đoán học sinh (áp dụng cả cho bài đã làm trước đây).
        </span>
      </div>
    </div>
  );
}
