import { useMemo, useState } from "react";
import {
  ERROR_TYPE_ORDER,
  type ErrorDnaCluster,
  type ErrorInstance,
  type ExamAutopsy,
  type RecurringPatternResult,
} from "../../lib/errorIntelligence";
import { dominantClassifiedError } from "../../lib/learningState";
import type { ErrorInstanceType } from "../../lib/types";
import { useInView } from "./motion";
import { formatPercent, formatPoints } from "./resultFormat";
import { ERROR_TYPE_META as TYPE_META } from "./errorTypeMeta";

/**
 * Phân mục 03 — Bản chất sai lệch tư duy (Error DNA của lượt làm này).
 *
 *  - Thanh phân bổ 4 loại lỗi (Khái niệm / Quy trình / Tính toán / Nhịp độ) +
 *    phần "chưa định vị". Chỉ dùng 1 gam đất nung ở 4 độ đậm khác nhau (đúng
 *    quy tắc 2 màu dữ liệu), phần chưa định vị là nét gạch trung tính.
 *  - Lưới thẻ giải trình: luôn đủ 4 loại (loại không phát sinh hiện mờ — học
 *    sinh thấy cả những gì mình KHÔNG mắc), mỗi thẻ có mô tả sư phạm, hướng
 *    khắc phục, các nhãn lỗi cụ thể (đánh dấu nhãn lặp lại qua nhiều đề) và
 *    danh sách câu — bấm để nhảy tới câu đó ở phân mục 08.
 *  - Giải trình từng câu: căn cứ phân loại, phương án đã chọn, lời giải thích
 *    của thầy (nếu có).
 *
 * Dữ liệu: autopsy.errorDna + autopsy.wrongQuestions (buildExamAutopsy) và
 * summarizePatternRecurrence (toàn bộ lịch sử) — không tính lại gì.
 */

const CORE_TYPES = ERROR_TYPE_ORDER.filter((t) => t !== "unclassified");
const PART_ROMAN: Record<1 | 2 | 3, string> = { 1: "I", 2: "II", 3: "III" };

function basisText(w: ErrorInstance): string {
  if (w.confidence === "high") return "Căn cứ: nhãn lỗi thầy đã đối soát cho phương án này.";
  if (w.confidence === "medium") return `Căn cứ: tín hiệu thời gian làm bài — ${w.reason}`;
  return w.part === 1
    ? "Phương án này chưa được gắn nhãn lỗi nên chưa xác định được bản chất."
    : "Câu Phần II/III không có phương án nhiễu để đối soát — chỉ nhận diện được lỗi nhịp độ qua thời gian làm.";
}

export function ErrorDnaPanel({
  status,
  autopsy,
  recurring,
  questionNumbers,
  onQuestionSelect,
}: {
  status: "loading" | "error" | "ready";
  autopsy: ExamAutopsy | null;
  recurring: RecurringPatternResult[];
  questionNumbers: Map<string, number>;
  /** Bấm vào 1 câu -> cuộn tới câu đó ở phân mục 08. */
  onQuestionSelect: (questionId: string) => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const wrong = autopsy?.wrongQuestions ?? [];
  const [showAll, setShowAll] = useState(false);

  const clusters = useMemo(() => {
    const map = new Map<ErrorInstanceType, ErrorDnaCluster>();
    for (const c of autopsy?.errorDna ?? []) map.set(c.errorType, c);
    return map;
  }, [autopsy]);

  const recurringByLabel = useMemo(
    () => new Map(recurring.filter((r) => r.isRecurring).map((r) => [r.patternLabel, r])),
    [recurring],
  );

  const numberOf = (id: string) => questionNumbers.get(id) ?? null;
  const sortedWrong = useMemo(
    () =>
      [...wrong].sort(
        (a, b) =>
          (questionNumbers.get(a.questionId) ?? 1e9) - (questionNumbers.get(b.questionId) ?? 1e9),
      ),
    [wrong, questionNumbers],
  );

  if (status === "loading") {
    return <div className="student-intelligence-skeleton" aria-busy="true">Đang đối soát bản chất các câu sai…</div>;
  }
  if (status === "error" || !autopsy) {
    return (
      <div className="student-intelligence-placeholder">
        Chưa tải được dữ liệu nhãn lỗi cho lượt làm này. Em vẫn có thể xem lời giải từng câu ở phân mục 08.
      </div>
    );
  }
  if (wrong.length === 0) {
    return (
      <p className="student-intelligence-callout student-intelligence-callout--solid">
        Không có câu nào trả lời sai.
        {autopsy.blankCount > 0
          ? ` Điểm rơi của bài đến từ ${autopsy.blankCount} câu bỏ trống — nhịp độ làm bài được phân tích ở phân mục 05.`
          : " Em giữ trọn điểm mọi câu đã làm."}
      </p>
    );
  }

  const total = wrong.length;
  const located = total - (clusters.get("unclassified")?.count ?? 0);
  const dominant = dominantClassifiedError(autopsy.errorDna);
  let lead: string;
  if (dominant) {
    lead = `${formatPercent(dominant.share)} số câu sai đã định vị thuộc nhóm ${TYPE_META[dominant.errorType].short.toLowerCase()} — đây là điểm nghẽn tư duy chính của bài này.`;
  } else if (located < total / 2) {
    lead =
      "Phần lớn câu sai chưa được đối soát nhãn lỗi, nên bức tranh dưới đây mới mang tính tham khảo — nó sẽ rõ dần khi thầy gắn nhãn thêm.";
  } else {
    lead = "Các câu sai phân tán ở nhiều nhóm lỗi, chưa có nhóm nào trội hẳn — nên xem từng thẻ bên dưới.";
  }

  const barTypes = ([...CORE_TYPES, "unclassified"] as ErrorInstanceType[]).filter((t) => (clusters.get(t)?.count ?? 0) > 0);
  const visibleCards: ErrorInstanceType[] = clusters.has("unclassified")
    ? [...CORE_TYPES, "unclassified"]
    : CORE_TYPES;
  const COLLAPSED = 4;
  const listed = showAll ? sortedWrong : sortedWrong.slice(0, COLLAPSED);

  return (
    <div ref={ref} className={`student-intelligence-dna${inView ? " is-inview" : ""}`}>
      <p className="student-intelligence-callout">{lead}</p>

      {/* ---- Thanh phân bổ ------------------------------------------------ */}
      <div className="student-intelligence-dna-summary">
        <span>
          Phân rã <strong>{total}</strong> câu sai
        </span>
        <span className="student-intelligence-muted">
          {located} / {total} câu đã định vị bản chất
        </span>
      </div>
      <div
        className="student-intelligence-dna-bar"
        role="img"
        aria-label={barTypes
          .map((t) => `${TYPE_META[t].short}: ${clusters.get(t)?.count ?? 0} câu`)
          .join("; ")}
      >
        {barTypes.map((t, i) => (
          <span
            key={t}
            className={`student-intelligence-dna-seg${t === "unclassified" ? " is-unlocated" : ""}`}
            style={{
              ["--si-fill" as string]: (clusters.get(t)?.count ?? 0) / total,
              ["--si-weight" as string]: `${Math.round(TYPE_META[t].weight * 100)}%`,
              ["--si-delay" as string]: `${i * 120}ms`,
            }}
            title={`${TYPE_META[t].short}: ${clusters.get(t)?.count ?? 0} câu`}
          />
        ))}
      </div>

      {/* ---- Lưới thẻ giải trình ----------------------------------------- */}
      <div className="student-intelligence-dna-grid">
        {visibleCards.map((t) => {
          const c = clusters.get(t);
          const meta = TYPE_META[t];
          const items = sortedWrong.filter((w) => w.errorType === t);
          const empty = !c || c.count === 0;
          return (
            <article
              key={t}
              className={`student-intelligence-dna-card${empty ? " is-empty" : ""}${
                t === "unclassified" ? " is-unlocated" : ""
              }`}
              style={{ ["--si-weight" as string]: `${Math.round(meta.weight * 100)}%` }}
            >
              <header className="student-intelligence-dna-card-head">
                <span className="student-intelligence-dna-card-title">
                  <i className="student-intelligence-dna-dot" aria-hidden="true" />
                  {meta.title}
                </span>
                <span className="student-intelligence-dna-card-share">
                  {empty ? "Không phát sinh" : `${c.count} câu · ${formatPercent(c.share)}`}
                </span>
              </header>
              <p className="student-intelligence-dna-card-desc">{meta.description}</p>
              {!empty && (
                <>
                  {c.patternLabels.length > 0 && (
                    <ul className="student-intelligence-tags" aria-label="Nhãn lỗi cụ thể">
                      {c.patternLabels.map((p) => {
                        const rec = recurringByLabel.get(p.label);
                        return (
                          <li key={p.label} className={`student-intelligence-tag${rec ? " is-recurring" : ""}`}>
                            {p.label}
                            {p.count > 1 && <span className="student-intelligence-tag-count"> ×{p.count}</span>}
                            {rec && (
                              <span className="student-intelligence-tag-note">
                                lặp lại {rec.totalCount} lần / {rec.distinctExamCount} đề
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <p className="student-intelligence-dna-card-action">
                    <span>Hướng khắc phục</span> {meta.action}
                  </p>
                  <div className="student-intelligence-qrefs">
                    {items.map((w) => (
                      <button
                        key={w.questionId}
                        type="button"
                        className="student-intelligence-qref"
                        onClick={() => onQuestionSelect(w.questionId)}
                        title="Xem câu này ở phân mục 08"
                      >
                        {numberOf(w.questionId) ? `Câu ${numberOf(w.questionId)}` : `Phần ${PART_ROMAN[w.part]}`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      {/* ---- Giải trình từng câu ----------------------------------------- */}
      <div className="student-intelligence-explain">
        <h3 className="student-intelligence-subhead">Giải trình từng câu</h3>
        <ol className="student-intelligence-explain-list">
          {listed.map((w) => {
            const n = numberOf(w.questionId);
            const rec = w.patternLabel ? recurringByLabel.get(w.patternLabel) : undefined;
            return (
              <li key={w.questionId} className="student-intelligence-explain-row">
                <div className="student-intelligence-explain-head">
                  <button
                    type="button"
                    className="student-intelligence-explain-q"
                    onClick={() => onQuestionSelect(w.questionId)}
                  >
                    {n ? `Câu ${n}` : "Câu"} · Phần {PART_ROMAN[w.part]}
                  </button>
                  <span
                    className={`student-intelligence-type-chip${w.errorType === "unclassified" ? " is-unlocated" : ""}`}
                    style={{ ["--si-weight" as string]: `${Math.round(TYPE_META[w.errorType].weight * 100)}%` }}
                  >
                    {TYPE_META[w.errorType].short}
                  </span>
                  <span className="student-intelligence-explain-loss">−{formatPoints(w.pointsLost)}</span>
                </div>
                {w.lessonName && <div className="student-intelligence-explain-lesson">{w.lessonName}</div>}
                {w.part === 1 && w.chosenOption && (
                  <div className="student-intelligence-explain-choice">
                    Em chọn <strong>{w.chosenOption}</strong> · đáp án đúng <strong>{w.correctOption}</strong>
                  </div>
                )}
                {w.patternLabel && (
                  <p className="student-intelligence-explain-rationale">
                    <strong>{w.patternLabel}</strong>
                    {w.rationaleText ? ` — ${w.rationaleText}` : ""}
                    {rec && (
                      <span className="student-intelligence-explain-recurring">
                        {" "}
                        Mẫu lỗi này đã gặp {rec.totalCount} lần trên {rec.distinctExamCount} đề khác nhau.
                      </span>
                    )}
                  </p>
                )}
                <p className="student-intelligence-explain-basis">{basisText(w)}</p>
              </li>
            );
          })}
        </ol>
        {sortedWrong.length > COLLAPSED && (
          <button
            type="button"
            className="student-intelligence-button student-intelligence-button--quiet"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Thu gọn" : `Xem thêm ${sortedWrong.length - COLLAPSED} câu`}
          </button>
        )}
      </div>
    </div>
  );
}
