import { useMemo } from "react";
import type { AttemptQuestionDetail } from "../../lib/api";
import {
  BLANK_REASON_LABELS,
  blankQuestionAdvice,
  DEFAULT_EXPECTED_TIME_SECONDS,
  type BlankQuestionSummary,
} from "../../lib/diagnosis";
import type { ErrorInstance, RecurringPatternResult } from "../../lib/errorIntelligence";
import { useInView } from "./motion";
import { formatClock, formatDate } from "./resultFormat";

/**
 * Phân mục 05 — Quy luật sai lệch & nhịp độ làm bài.
 *
 *  A. Mẫu lỗi lặp lại qua nhiều đề (summarizePatternRecurrence trên TOÀN BỘ
 *     lịch sử), chỉ nêu những mẫu có mặt trong các câu sai của đề này. Mẫu
 *     từng lặp lại nhưng KHÔNG tái diễn ở đề này được ghi nhận là tín hiệu
 *     tích cực.
 *  B. Dải nhịp độ: mỗi cột là 1 câu, cao theo thời gian làm so với định mức
 *     của phần thi (DEFAULT_EXPECTED_TIME_SECONDS), vạch đứt = đúng định mức.
 *  C. Cảnh báo: điểm nghẽn thời gian (>= 2 lần định mức mà vẫn mất điểm),
 *     làm vội (<= 35% định mức và sai), câu bỏ trống (classifyBlankQuestions).
 */

const BOTTLENECK_RATIO = 2;
const RUSHED_RATIO = 0.35;
/** Cột cao nhất tương ứng 3 lần định mức (câu lâu hơn nữa vẫn chỉ cao tối đa). */
const CHART_CAP_RATIO = 3;
const PART_ROMAN: Record<1 | 2 | 3, string> = { 1: "I", 2: "II", 3: "III" };
const FULL_EPS = 0.005;

type Status = "loading" | "error" | "ready";

interface PaceItem {
  q: AttemptQuestionDetail;
  n: number;
  ratio: number;
  full: boolean;
}

export function PatternInsights({
  patternStatus,
  recurring,
  wrongQuestions,
  perQuestion,
  blankSummary,
  onQuestionSelect,
}: {
  patternStatus: Status;
  /** summarizePatternRecurrence trên toàn bộ lịch sử làm bài. */
  recurring: RecurringPatternResult[];
  /** Câu sai của CHÍNH lượt làm này (autopsy.wrongQuestions). */
  wrongQuestions: ErrorInstance[];
  perQuestion: AttemptQuestionDetail[];
  blankSummary: BlankQuestionSummary | null;
  onQuestionSelect: (questionId: string) => void;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();

  const numberOf = useMemo(() => new Map(perQuestion.map((q, i) => [q.question_id, i + 1])), [perQuestion]);

  // --- A. Mẫu lỗi lặp lại ---------------------------------------------------
  const { hereRecurring, resolved } = useMemo(() => {
    const labelsHere = new Map<string, string[]>();
    for (const w of wrongQuestions) {
      if (!w.patternLabel) continue;
      const list = labelsHere.get(w.patternLabel) ?? [];
      list.push(w.questionId);
      labelsHere.set(w.patternLabel, list);
    }
    const all = recurring.filter((r) => r.isRecurring);
    return {
      hereRecurring: all
        .filter((r) => labelsHere.has(r.patternLabel))
        .map((r) => ({ ...r, questionIds: labelsHere.get(r.patternLabel) ?? [] }))
        .sort((a, b) => b.totalCount - a.totalCount),
      resolved: all.filter((r) => !labelsHere.has(r.patternLabel)).map((r) => r.patternLabel),
    };
  }, [recurring, wrongQuestions]);

  // --- B + C. Nhịp độ --------------------------------------------------------
  const pace: PaceItem[] = useMemo(
    () =>
      perQuestion.map((q, i) => ({
        q,
        n: i + 1,
        ratio: q.timeSpentSeconds / DEFAULT_EXPECTED_TIME_SECONDS[q.part],
        full: q.maxScore > 0 && q.score >= q.maxScore - FULL_EPS,
      })),
    [perQuestion],
  );
  const hasTiming = pace.some((p) => p.q.timeSpentSeconds > 0);
  const bottlenecks = pace
    .filter((p) => p.q.answered && !p.full && p.ratio >= BOTTLENECK_RATIO)
    .sort((a, b) => b.q.timeSpentSeconds - a.q.timeSpentSeconds)
    .slice(0, 3);
  const rushed = pace.filter((p) => p.q.answered && !p.full && p.q.timeSpentSeconds > 0 && p.ratio <= RUSHED_RATIO);
  const blankItems = blankSummary?.items ?? [];
  const blankAdvice = blankSummary ? blankQuestionAdvice(blankSummary) : null;
  const parts = ([1, 2, 3] as const)
    .map((part) => ({ part, items: pace.filter((p) => p.q.part === part) }))
    .filter((g) => g.items.length > 0);

  const QButton = ({ id, children }: { id: string; children: string }) => (
    <button type="button" className="student-intelligence-qref" onClick={() => onQuestionSelect(id)}>
      {children}
    </button>
  );

  return (
    <div ref={ref} className={`student-intelligence-patterns${inView ? " is-inview" : ""}`}>
      {/* ---- A. Quy luật lặp lại ------------------------------------------ */}
      <h3 className="student-intelligence-subhead">Mẫu lỗi lặp lại qua nhiều đề</h3>
      {patternStatus === "loading" ? (
        <div className="student-intelligence-skeleton" aria-busy="true">Đang đối chiếu lịch sử các đề đã làm…</div>
      ) : patternStatus === "error" ? (
        <p className="student-intelligence-footnote">Chưa tải được lịch sử lỗi để đối chiếu.</p>
      ) : hereRecurring.length === 0 ? (
        <p className="student-intelligence-quiet">
          Chưa phát hiện mẫu lỗi nào ở đề này từng lặp lại trên nhiều đề khác.
        </p>
      ) : (
        <>
          <div className="student-intelligence-insight-grid">
            {hereRecurring.map((r) => (
              <article key={r.patternLabel} className="student-intelligence-insight">
                <span className="student-intelligence-insight-kicker">Lặp lại qua nhiều đề</span>
                <h4 className="student-intelligence-insight-title">«{r.patternLabel}»</h4>
                <p className="student-intelligence-insight-body">
                  Đã xuất hiện <strong>{r.totalCount} lần</strong> trên <strong>{r.distinctExamCount} đề khác nhau</strong>
                  {r.firstOccurredAt !== r.lastOccurredAt
                    ? `, từ ${formatDate(r.firstOccurredAt)} đến ${formatDate(r.lastOccurredAt)}`
                    : ""}
                  .
                </p>
                <div className="student-intelligence-qrefs">
                  {r.questionIds.map((id) => (
                    <QButton key={id} id={id}>
                      {numberOf.get(id) ? `Câu ${numberOf.get(id)}` : "Xem câu"}
                    </QButton>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <p className="student-intelligence-footnote">
            Một lỗi quay lại ở nhiều đề thường là thói quen tư duy chứ không còn là sơ suất — khắc phục dứt điểm một lần
            sẽ gỡ được điểm ở nhiều đề sau.
          </p>
        </>
      )}
      {patternStatus === "ready" && resolved.length > 0 && (
        <p className="student-intelligence-kept">
          <strong>Không tái diễn ở đề này:</strong> {resolved.map((l) => `«${l}»`).join(" · ")} — những mẫu lỗi em từng
          lặp lại trước đây.
        </p>
      )}

      {/* ---- B. Dải nhịp độ ------------------------------------------------ */}
      <h3 className="student-intelligence-subhead student-intelligence-subhead--spaced">Nhịp độ từng câu</h3>
      {!hasTiming ? (
        <p className="student-intelligence-quiet">Lượt làm này chưa ghi nhận thời gian làm từng câu.</p>
      ) : (
        <figure className="student-intelligence-pace">
          <div
            className="student-intelligence-pace-chart"
            role="img"
            aria-label={`Thời gian làm ${pace.length} câu so với định mức; ${bottlenecks.length} câu vượt 2 lần định mức mà vẫn mất điểm.`}
          >
            <span className="student-intelligence-pace-norm" aria-hidden="true">
              <span>định mức</span>
            </span>
            {parts.map((g) => (
              <div key={g.part} className="student-intelligence-pace-group" style={{ flexGrow: g.items.length }}>
                <div className="student-intelligence-pace-bars">
                  {g.items.map((p, i) => {
                    const h = Math.min(p.ratio, CHART_CAP_RATIO) / CHART_CAP_RATIO;
                    const state = !p.q.answered ? "blank" : p.full ? "solid" : "gap";
                    return (
                      <button
                        key={p.q.question_id}
                        type="button"
                        className={`student-intelligence-pace-bar is-${state}${
                          p.q.timeSpentSeconds === 0 ? " is-nodata" : ""
                        }`}
                        style={{
                          ["--si-fill" as string]: Math.max(h, 0.04),
                          ["--si-delay" as string]: `${i * 18}ms`,
                        }}
                        title={`Câu ${p.n} · ${formatClock(p.q.timeSpentSeconds)} (${Math.round(p.ratio * 100)}% định mức) · ${
                          !p.q.answered ? "bỏ trống" : p.full ? "trọn điểm" : "chưa trọn điểm"
                        }`}
                        aria-label={`Câu ${p.n}`}
                        onClick={() => onQuestionSelect(p.q.question_id)}
                      />
                    );
                  })}
                </div>
                <span className="student-intelligence-pace-part">Phần {PART_ROMAN[g.part]}</span>
              </div>
            ))}
          </div>
          <figcaption className="student-intelligence-legend">
            <span>
              <i className="student-intelligence-swatch student-intelligence-swatch--solid" /> Trọn điểm
            </span>
            <span>
              <i className="student-intelligence-swatch student-intelligence-swatch--gap" /> Chưa trọn điểm
            </span>
            <span>
              <i className="student-intelligence-swatch student-intelligence-swatch--blank" /> Bỏ trống
            </span>
            <span>
              Cột cao theo thời gian so với định mức ({formatClock(DEFAULT_EXPECTED_TIME_SECONDS[1])} Phần I,{" "}
              {formatClock(DEFAULT_EXPECTED_TIME_SECONDS[2])} Phần II, {formatClock(DEFAULT_EXPECTED_TIME_SECONDS[3])}{" "}
              Phần III); bấm vào cột để xem câu.
            </span>
          </figcaption>
        </figure>
      )}

      {/* ---- C. Cảnh báo nhịp độ ------------------------------------------ */}
      {(bottlenecks.length > 0 || rushed.length > 0 || blankItems.length > 0) && (
        <div className="student-intelligence-insight-grid student-intelligence-insight-grid--spaced">
          {bottlenecks.map((p) => (
            <article key={p.q.question_id} className="student-intelligence-insight">
              <span className="student-intelligence-insight-kicker">Điểm nghẽn thời gian</span>
              <h4 className="student-intelligence-insight-title">
                Câu {p.n} · Phần {PART_ROMAN[p.q.part]}
              </h4>
              <p className="student-intelligence-insight-body">
                Em dành <strong>{formatClock(p.q.timeSpentSeconds)}</strong> — gấp {p.ratio.toFixed(1)} lần định mức{" "}
                {formatClock(DEFAULT_EXPECTED_TIME_SECONDS[p.q.part])} — nhưng chưa đạt trọn điểm. Với câu khó, hãy đặt
                mốc: quá 2 lần định mức thì đánh dấu, làm câu khác rồi quay lại.
              </p>
              <div className="student-intelligence-qrefs">
                <QButton id={p.q.question_id}>{`Xem câu ${p.n}`}</QButton>
              </div>
            </article>
          ))}
          {rushed.length > 0 && (
            <article className="student-intelligence-insight">
              <span className="student-intelligence-insight-kicker">Làm vội</span>
              <h4 className="student-intelligence-insight-title">
                {rushed.length} câu làm dưới {Math.round(RUSHED_RATIO * 100)}% định mức và chưa đúng
              </h4>
              <p className="student-intelligence-insight-body">
                Thời gian quá ngắn thường là dấu hiệu đọc lướt đề. Ở các câu này, dừng lại ở từ khoá điều kiện trước khi
                chọn đáp án.
              </p>
              <div className="student-intelligence-qrefs">
                {rushed.map((p) => (
                  <QButton key={p.q.question_id} id={p.q.question_id}>{`Câu ${p.n}`}</QButton>
                ))}
              </div>
            </article>
          )}
          {blankItems.length > 0 && (
            <article className="student-intelligence-insight">
              <span className="student-intelligence-insight-kicker">Câu bỏ trống</span>
              <h4 className="student-intelligence-insight-title">{blankItems.length} câu chưa có câu trả lời</h4>
              {blankAdvice && <p className="student-intelligence-insight-body">{blankAdvice}</p>}
              <ul className="student-intelligence-blank-list">
                {blankItems.map((b) => (
                  <li key={b.question_id}>
                    <QButton id={b.question_id}>
                      {numberOf.get(b.question_id) ? `Câu ${numberOf.get(b.question_id)}` : "Xem câu"}
                    </QButton>
                    <span>{BLANK_REASON_LABELS[b.reason]}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      )}
      {hasTiming && bottlenecks.length === 0 && rushed.length === 0 && blankItems.length === 0 && (
        <p className="student-intelligence-kept">
          <strong>Nhịp độ ổn định:</strong> không có câu nào vượt 2 lần định mức mà vẫn mất điểm, không làm vội và
          không bỏ trống.
        </p>
      )}
    </div>
  );
}
