import { DISTRACTOR_ERROR_TYPE_LABELS } from "../lib/errorIntelligence";
import type {
  DistractorErrorType,
  Part1Answer,
  Part1Options,
  QuestionOptionRationaleRow,
  QuestionRow,
} from "../lib/types";
import { MathText } from "./MathText";

/**
 * Phần soạn nhãn lỗi cho 3 phương án nhiễu của 1 câu Phần 1 — dùng CHUNG cho
 * Ngân hàng câu hỏi (DistractorRationaleEditor) và trang Gắn nhãn lỗi nhanh
 * (TeacherRationaleQueue). Component "câm" (controlled): chỉ hiển thị + báo
 * thay đổi, việc tải/lưu do nơi dùng quyết định.
 */

export const EDITABLE_ERROR_TYPES: DistractorErrorType[] = ["conceptual", "procedural", "calculation", "careless"];
export const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export interface RationaleDraftRow {
  option_key: string;
  /** "" = CHƯA CHỌN — cố ý không mặc định "Lỗi khái niệm", để không có nhãn nào
   * được xác nhận mà thầy chưa thực sự chọn. */
  error_type: DistractorErrorType | "";
  pattern_label: string;
  rationale_text: string;
  ai_suggested: boolean;
}

export interface LabelOption {
  label: string;
  errorType: DistractorErrorType;
  count: number;
}

export function correctKeyOf(question: Pick<QuestionRow, "correct_answer">): string {
  return (question.correct_answer as Part1Answer).choice;
}

export function wrongKeysOf(question: Pick<QuestionRow, "correct_answer">): string[] {
  const correct = correctKeyOf(question);
  return OPTION_KEYS.filter((k) => k !== correct);
}

/** Nháp từ các dòng đã lưu (đã xác nhận hoặc nháp AI) — thiếu phương án nào thì tạo dòng trống. */
export function draftsFromRows(
  question: Pick<QuestionRow, "correct_answer">,
  rows: QuestionOptionRationaleRow[],
): RationaleDraftRow[] {
  return wrongKeysOf(question).map((key) => {
    const r = rows.find((x) => x.option_key === key);
    return {
      option_key: key,
      error_type: r && r.error_type !== "n_a" ? r.error_type : "",
      pattern_label: r?.pattern_label ?? "",
      rationale_text: r?.rationale_text ?? "",
      ai_suggested: r?.ai_suggested ?? false,
    };
  });
}

/** 3 dòng điền sẵn cùng 1 nhãn (Gợi ý nhanh) hoặc để trống. */
export function blankDrafts(
  question: Pick<QuestionRow, "correct_answer">,
  fill: LabelOption | null = null,
): RationaleDraftRow[] {
  return wrongKeysOf(question).map((key) => ({
    option_key: key,
    error_type: fill?.errorType ?? "",
    pattern_label: fill?.label ?? "",
    rationale_text: "",
    ai_suggested: false,
  }));
}

/** Đủ 4 dòng để lưu (phương án đúng ghi 'n_a'). */
export function toSaveRows(question: Pick<QuestionRow, "correct_answer">, drafts: RationaleDraftRow[]) {
  const correct = correctKeyOf(question);
  return OPTION_KEYS.map((key) => {
    if (key === correct) {
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
      error_type: (d?.error_type || "n_a") as DistractorErrorType,
      pattern_label: d?.pattern_label.trim() || null,
      rationale_text: d?.rationale_text.trim() || null,
      ai_suggested: d?.ai_suggested ?? false,
    };
  });
}

/** Các phương án chưa chọn loại lỗi — phải rỗng mới cho bấm "Xác nhận". */
export function missingErrorTypes(drafts: RationaleDraftRow[]): string[] {
  return drafts.filter((d) => !d.error_type).map((d) => d.option_key);
}

/** Danh sách nhãn ĐÃ XÁC NHẬN (dùng nhiều nhất trước) — nguồn cho menu chọn nhãn. */
export function labelOptionsFromRows(rows: QuestionOptionRationaleRow[]): LabelOption[] {
  const map = new Map<string, { count: number; types: Map<DistractorErrorType, number> }>();
  for (const r of rows) {
    if (!r.verified_by_teacher || !r.pattern_label || r.is_correct || r.error_type === "n_a") continue;
    const e = map.get(r.pattern_label) ?? { count: 0, types: new Map() };
    e.count += 1;
    e.types.set(r.error_type, (e.types.get(r.error_type) ?? 0) + 1);
    map.set(r.pattern_label, e);
  }
  return Array.from(map.entries())
    .map(([label, e]) => ({
      label,
      count: e.count,
      errorType: Array.from(e.types.entries()).sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function RationaleRowsEditor({
  question,
  drafts,
  labelOptions,
  choiceCounts,
  onChange,
  disabled = false,
}: {
  question: QuestionRow;
  drafts: RationaleDraftRow[];
  labelOptions: LabelOption[];
  choiceCounts?: Record<string, number>;
  onChange: (optionKey: string, patch: Partial<RationaleDraftRow>) => void;
  disabled?: boolean;
}) {
  const choices = (question.options as Part1Options).choices;
  return (
    <div className="li-rows">
      <div className="li-row-head">
        <span />
        <span>Phương án nhiễu</span>
        <span>Loại lỗi</span>
        <span>Nhãn ngắn (tái dùng)</span>
        <span>Mô tả học sinh sai ở đâu</span>
      </div>
      {drafts.map((d) => (
        <div key={d.option_key} className="li-row">
          <span className="li-key">{d.option_key}</span>
          <div className="li-row-option">
            <MathText text={choices[d.option_key as keyof typeof choices] ?? ""} />
            <span className="li-row-count">
              {choiceCounts ? `${choiceCounts[d.option_key] ?? 0} lượt chọn` : ""}
              {d.ai_suggested ? `${choiceCounts ? " · " : ""}nháp AI` : ""}
            </span>
          </div>
          <select
            value={d.error_type}
            disabled={disabled}
            onChange={(e) => onChange(d.option_key, { error_type: e.target.value as DistractorErrorType | "" })}
            style={d.error_type ? undefined : { borderColor: "var(--color-clay)" }}
          >
            <option value="">— Chọn loại lỗi —</option>
            {EDITABLE_ERROR_TYPES.map((t) => (
              <option key={t} value={t}>
                {DISTRACTOR_ERROR_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <div className="li-label-field">
            {labelOptions.length > 0 && (
              <select
                value=""
                disabled={disabled}
                onChange={(e) => {
                  const picked = labelOptions.find((o) => o.label === e.target.value);
                  if (picked) onChange(d.option_key, { pattern_label: picked.label, error_type: picked.errorType });
                }}
              >
                <option value="">— Chọn nhãn đã có —</option>
                {labelOptions.map((o) => (
                  <option key={o.label} value={o.label}>
                    {o.label} ({o.count})
                  </option>
                ))}
              </select>
            )}
            <input
              type="text"
              value={d.pattern_label}
              disabled={disabled}
              placeholder="vd: Quên điều kiện xác định"
              onChange={(e) => onChange(d.option_key, { pattern_label: e.target.value })}
            />
          </div>
          <input
            type="text"
            value={d.rationale_text}
            disabled={disabled}
            placeholder="Không bắt buộc"
            onChange={(e) => onChange(d.option_key, { rationale_text: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
