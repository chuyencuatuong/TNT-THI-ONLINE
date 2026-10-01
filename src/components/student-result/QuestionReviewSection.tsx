import { useEffect, useMemo, useRef, useState } from "react";
import type { AttemptReviewItem } from "../../lib/api";
import type { ErrorInstance } from "../../lib/errorIntelligence";
import { DIFFICULTY_LABELS } from "../../lib/types";
import { QuestionReview } from "../QuestionReview";
import { prefersReducedMotion } from "./useScrollSpy";
import { ERROR_TYPE_META, errorWeightVar } from "./errorTypeMeta";
import { formatPoints } from "./resultFormat";

/**
 * Phân mục 08 — Bản kiểm tra chi tiết (Progressive Disclosure).
 *
 *  - Mỗi câu chỉ là 1 dòng tóm tắt (số câu, phần, mức độ, loại lỗi, trạng
 *    thái, điểm). Nội dung câu hỏi + lời giải KaTeX (QuestionReview) CHỈ được
 *    render khi bấm mở — trang dài 40 câu không phải dựng 40 khối công thức.
 *  - Chip lọc: Toàn bộ / Câu sai / Bỏ trống / Phần I / Phần II / Phần III.
 *  - Nhận lệnh từ bên ngoài qua `command`:
 *      { kind: "open", questionId }  -> bỏ lọc nếu câu đang bị ẩn, mở sẵn câu,
 *                                       cuộn mượt tới giữa màn hình, nhấn sáng 2s
 *                                       (deep-link từ phân mục 03/05).
 *      { kind: "filter", filter }    -> đổi bộ lọc (nút "Ôn lại N câu sai").
 *    `nonce` đổi mỗi lần gửi để bấm lại cùng 1 câu vẫn có tác dụng.
 */

export type ReviewFilter = "all" | "wrong" | "blank" | "part1" | "part2" | "part3";

export type ReviewCommand =
  | { kind: "open"; questionId: string; nonce: number }
  /** Mở sẵn nhiều câu cùng lúc (việc số 1 ở Kế hoạch), cuộn tới câu đầu tiên. */
  | { kind: "open-many"; questionIds: string[]; nonce: number }
  | { kind: "filter"; filter: ReviewFilter; nonce: number };

const FULL_EPS = 0.005;
const PART_ROMAN: Record<1 | 2 | 3, string> = { 1: "I", 2: "II", 3: "III" };
const HIGHLIGHT_CLASS = "student-intelligence-highlight";

type ItemState = "full" | "partial" | "wrong" | "blank";

function stateOf(r: AttemptReviewItem): ItemState {
  if (r.finalAnswer === null || r.finalAnswer === undefined) return "blank";
  if (r.maxScore > 0 && r.score >= r.maxScore - FULL_EPS) return "full";
  return r.score > FULL_EPS ? "partial" : "wrong";
}

const STATE_LABEL: Record<ItemState, string> = {
  full: "Trọn điểm",
  partial: "Đúng một phần",
  wrong: "Chưa đúng",
  blank: "Bỏ trống",
};

function matches(filter: ReviewFilter, r: AttemptReviewItem, s: ItemState): boolean {
  switch (filter) {
    case "all":
      return true;
    case "wrong":
      return s === "partial" || s === "wrong";
    case "blank":
      return s === "blank";
    case "part1":
      return r.part === 1;
    case "part2":
      return r.part === 2;
    case "part3":
      return r.part === 3;
  }
}

const FILTERS: { key: ReviewFilter; label: string }[] = [
  { key: "all", label: "Toàn bộ" },
  { key: "wrong", label: "Câu sai" },
  { key: "blank", label: "Bỏ trống" },
  { key: "part1", label: "Phần I" },
  { key: "part2", label: "Phần II" },
  { key: "part3", label: "Phần III" },
];

function Chevron() {
  return (
    <svg
      className="student-intelligence-chevron"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function QuestionReviewSection({
  items,
  questionNumbers,
  errorByQuestion,
  command,
}: {
  items: AttemptReviewItem[];
  questionNumbers: Map<string, number>;
  /** Loại lỗi của từng câu sai (autopsy.wrongQuestions) — có thể rỗng khi chưa tải. */
  errorByQuestion: Map<string, ErrorInstance>;
  command: ReviewCommand | null;
}) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      items
        .map((r, i) => ({ r, s: stateOf(r), n: questionNumbers.get(r.question_id) ?? i + 1 }))
        .sort((a, b) => a.n - b.n),
    [items, questionNumbers],
  );
  const counts = useMemo(() => {
    const c: Record<ReviewFilter, number> = { all: 0, wrong: 0, blank: 0, part1: 0, part2: 0, part3: 0 };
    for (const { r, s } of rows) for (const f of FILTERS) if (matches(f.key, r, s)) c[f.key] += 1;
    return c;
  }, [rows]);
  const visible = rows.filter(({ r, s }) => matches(filter, r, s));

  // --- Lệnh từ bên ngoài ------------------------------------------------------
  useEffect(() => {
    if (!command) return;
    if (command.kind === "filter") {
      setFilter(command.filter);
      return;
    }
    const ids = command.kind === "open" ? [command.questionId] : command.questionIds;
    const targets = rows.filter((x) => ids.includes(x.r.question_id));
    if (targets.length === 0) return;
    setFilter((f) => (targets.every((t) => matches(f, t.r, t.s)) ? f : "all"));
    setOpen((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setPendingFocus(targets[0].r.question_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce]);

  const focusTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
  }, []);

  // Cuộn tới câu SAU khi câu đã được mở và render (đo đúng vị trí cuối cùng).
  useEffect(() => {
    if (!pendingFocus) return;
    const id = pendingFocus;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`review-q-${id}`);
      if (el) {
        const run = () => {
          el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
          el.querySelector<HTMLButtonElement>(".student-intelligence-qrow-toggle")?.focus({ preventScroll: true });
          el.classList.remove(HIGHLIGHT_CLASS);
          void el.offsetWidth; // khởi động lại animation khi bấm liên tiếp
          el.classList.add(HIGHLIGHT_CLASS);
          window.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), 2100);
        };
        // Ngăn kéo Phụ lục chứa danh sách vừa được mở và còn đang bung ra: đợi bung xong
        // rồi mới cuộn, nếu không trang chưa đủ cao và câu dừng lệch khỏi mép trên.
        const inner = el.closest<HTMLElement>(".student-intelligence-acc-inner");
        if (inner && inner.scrollHeight > inner.clientHeight + 1) {
          if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
          focusTimerRef.current = window.setTimeout(run, 360);
        } else run();
      }
      setPendingFocus(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingFocus, filter, open]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allVisibleOpen = visible.length > 0 && visible.every(({ r }) => open.has(r.question_id));
  const toggleAll = () =>
    setOpen((prev) => {
      const next = new Set(prev);
      for (const { r } of visible) {
        if (allVisibleOpen) next.delete(r.question_id);
        else next.add(r.question_id);
      }
      return next;
    });

  if (items.length === 0) {
    return <div className="student-intelligence-placeholder">Không có câu hỏi nào để xem lại.</div>;
  }

  return (
    <div className="student-intelligence-review">
      <div className="student-intelligence-review-toolbar">
        <div className="student-intelligence-chips" role="group" aria-label="Lọc câu hỏi">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`student-intelligence-chip${filter === f.key ? " is-active" : ""}`}
              aria-pressed={filter === f.key}
              disabled={counts[f.key] === 0 && f.key !== "all"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="student-intelligence-chip-count">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {visible.length > 0 && (
          <button type="button" className="student-intelligence-button student-intelligence-button--quiet" onClick={toggleAll}>
            {allVisibleOpen ? "Thu gọn tất cả" : "Mở tất cả"}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="student-intelligence-quiet">Không có câu nào thuộc bộ lọc này.</p>
      ) : (
        <ol className="student-intelligence-qlist">
          {visible.map(({ r, s, n }) => {
            const isOpen = open.has(r.question_id);
            const err = errorByQuestion.get(r.question_id);
            const panelId = `review-panel-${r.question_id}`;
            const difficulty = r.question.difficulty ? DIFFICULTY_LABELS[r.question.difficulty] : null;
            return (
              <li
                key={r.question_id}
                id={`review-q-${r.question_id}`}
                className={`student-intelligence-qrow is-${s}${isOpen ? " is-open" : ""}`}
              >
                <button
                  type="button"
                  className="student-intelligence-qrow-toggle"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(r.question_id)}
                >
                  <span className="student-intelligence-qrow-mark" aria-hidden="true" />
                  <span className="student-intelligence-qrow-num">Câu {n}</span>
                  <span className="student-intelligence-qrow-meta">
                    Phần {PART_ROMAN[r.part]}
                    {difficulty ? ` · ${difficulty}` : ""}
                  </span>
                  <span className="student-intelligence-qrow-tags">
                    {err && (
                      <span
                        className={`student-intelligence-type-chip${err.errorType === "unclassified" ? " is-unlocated" : ""}`}
                        style={{ ["--si-weight" as string]: errorWeightVar(err.errorType) }}
                      >
                        {ERROR_TYPE_META[err.errorType].short}
                      </span>
                    )}
                    {r.teacherAdjusted && <span className="student-intelligence-qrow-flag">Thầy đã điều chỉnh</span>}
                  </span>
                  <span className="student-intelligence-qrow-status">{STATE_LABEL[s]}</span>
                  <span className="student-intelligence-qrow-score">
                    {formatPoints(r.score)}
                    <small> / {formatPoints(r.maxScore)}</small>
                  </span>
                  <Chevron />
                </button>
                {isOpen && (
                  <div id={panelId} className="student-intelligence-qrow-panel">
                    <QuestionReview
                      number={n}
                      question={r.question}
                      finalAnswer={r.finalAnswer}
                      score={r.score}
                      maxScore={r.maxScore}
                      teacherAdjusted={r.teacherAdjusted}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
