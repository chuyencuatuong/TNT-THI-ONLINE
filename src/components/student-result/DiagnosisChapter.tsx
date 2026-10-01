import { useMemo, useRef } from "react";
import {
  CAUSE_LABELS,
  CAUSE_ORDER,
  type CauseGroup,
  type CauseSummary,
  type LessonLossRow,
  type LossBlock,
  type QuestionLoss,
} from "../../lib/resultReport";
import { ROOT_CAUSE_DISCLAIMER } from "../../lib/knowledgeGraph";
import { useInView } from "./motion";
import { formatPercent, formatPoints } from "./resultFormat";
import { clamp, easeInOut, isWideViewport, lerp, scrollMotionAllowed, useScrollFrame } from "./scrollFrames";

/**
 * Chương 2 — Chẩn đoán. Điểm rơi được vẽ thành các ô (mỗi ô ≈ 0.25 điểm).
 * Trên màn rộng, hình đứng yên bên trái còn chữ cuộn bên phải:
 *  - Các khung nguyên nhân: ô xếp theo nhóm, nhóm đang đọc sáng lên.
 *  - Sang khung cuối: các ô dồn thành 1 hàng rồi tách ra theo Bài, GIỮ màu
 *    nguyên nhân — thấy ngay nguyên nhân nào rơi vào bài nào (morph liên tục
 *    theo vị trí cuộn, kéo ngược thì chạy ngược).
 * Điện thoại: không có hình đứng yên; mỗi khung có bản thu nhỏ tô sẵn.
 * Cuối chương: 1 mắt xích gốc rễ mạnh nhất (nếu có) + câu lưu ý bắt buộc.
 */

const CAUSE_WEIGHT: Record<CauseGroup, number> = { speed: 100, exec: 70, know: 46, unloc: 0 };
const CAUSE_PHRASE: Record<CauseGroup, string> = {
  speed: "do nhịp độ làm bài",
  exec: "hướng đúng, lệch ở bước làm",
  know: "khái niệm chưa chắc",
  unloc: "chưa đủ căn cứ để phân loại",
};
const CAUSE_BASIS: Record<CauseGroup, string> = {
  speed: "thời gian tập trung từng câu so với định mức của phần thi; câu bỏ trống chưa từng được mở",
  exec: "nhãn lỗi thầy đã đối soát cho phương án em chọn",
  know: "nhãn lỗi thầy đã đối soát cho phương án em chọn",
  unloc: "chưa có nhãn lỗi hoặc tín hiệu thời gian đủ rõ",
};

export interface ChainNode {
  kind: "origin" | "mid" | "target";
  role: string;
  name: string;
  evidence: string;
}

export interface TopChain {
  nodes: ChainNode[];
  explanation: string;
  moreCount: number;
}

const ROW_H = 58;
const LABEL_H = 22;
const GAP = 3;

function ArrowIcon() {
  return (
    <svg className="student-intelligence-chain-arrow2" viewBox="0 0 48 16" aria-hidden="true">
      <path pathLength={1} d="M2 8h42M38 3l6 5-6 5" />
    </svg>
  );
}

function MiniCauses({ summary, active }: { summary: CauseSummary[]; active: CauseGroup }) {
  const max = Math.max(0.01, ...summary.map((s) => s.points));
  return (
    <div className="student-intelligence-mini-rows">
      {summary
        .filter((s) => s.points > 0)
        .map((s) => (
          <div key={s.cause} className={`student-intelligence-mini-row${s.cause === active ? " is-active" : ""}${s.cause === "unloc" ? " unloc" : ""}`}>
            <span>{CAUSE_LABELS[s.cause]}</span>
            <span className="student-intelligence-mini-track">
              <i style={{ ["--si-v" as string]: s.points / max, ["--si-w" as string]: `${CAUSE_WEIGHT[s.cause]}%` }} />
            </span>
            <span>−{formatPoints(s.points)}</span>
          </div>
        ))}
    </div>
  );
}

export function DiagnosisChapter({
  status,
  totalLost,
  summary,
  blocks,
  unit,
  lessons,
  chain,
  onQuestionSelect,
}: {
  status: "loading" | "error" | "ready";
  totalLost: number;
  summary: CauseSummary[];
  blocks: LossBlock[];
  unit: number;
  lessons: LessonLossRow[];
  chain: TopChain | null;
  onQuestionSelect: (questionId: string) => void;
}) {
  const figRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<{ width: number; L: { x: number; y: number }[][] } | null>(null);
  const [chainRef, chainIn] = useInView<HTMLDivElement>();

  const causeSteps = summary.filter((s) => s.cause !== "unloc" && s.points > 0).sort((a, b) => b.points - a.points);
  const unloc = summary.find((s) => s.cause === "unloc")!;
  const lessonOrder = useMemo(() => lessons.map((l) => l.key), [lessons]);
  const rowsCause = CAUSE_ORDER.filter((c) => blocks.some((b) => b.cause === c));

  function computeLayout(width: number) {
    const n = blocks.length;
    const bw = Math.max(6, Math.floor((width - (n - 1) * GAP) / Math.max(n, 1)));
    const L0 = blocks.map(() => ({ x: 0, y: 0 }));
    rowsCause.forEach((c, r) => {
      let k = 0;
      blocks.forEach((b, i) => {
        if (b.cause === c) L0[i] = { x: k++ * (bw + GAP), y: r * ROW_H + LABEL_H };
      });
    });
    const L1 = blocks.map((_, i) => ({ x: i * (bw + GAP), y: 1.5 * ROW_H + LABEL_H }));
    const L2 = blocks.map(() => ({ x: 0, y: 0 }));
    lessonOrder.slice(0, 4).forEach((key, r) => {
      let k = 0;
      blocks.forEach((b, i) => {
        if (b.lessonKey === key) L2[i] = { x: k++ * (bw + GAP), y: r * ROW_H + LABEL_H };
      });
    });
    // Bài thứ 5 trở đi (hiếm) gộp vào hàng cuối để hình không quá cao.
    blocks.forEach((b, i) => {
      if (lessonOrder.indexOf(b.lessonKey) >= 4) L2[i] = { x: L2[i].x, y: 3 * ROW_H + LABEL_H };
    });
    return { bw, L: [L0, L1, L2] };
  }

  useScrollFrame(() => {
    const fig = figRef.current, stage = stageRef.current, stepsEl = stepsRef.current;
    if (!fig || !stage || !stepsEl || blocks.length === 0) return;
    if (!isWideViewport()) return;
    const width = stage.clientWidth;
    if (!layoutRef.current || layoutRef.current.width !== width) {
      const { bw, L } = computeLayout(width);
      layoutRef.current = { width, L };
      stage.querySelectorAll<HTMLElement>(".student-intelligence-blk").forEach((el) => (el.style.width = `${bw}px`));
    }
    const L = layoutRef.current.L;
    const steps = Array.from(stepsEl.querySelectorAll<HTMLElement>("[data-step]"));
    const mid = window.innerHeight / 2;
    const centers = steps.map((s) => {
      const r = s.getBoundingClientRect();
      return r.top + Math.min(r.height, window.innerHeight) / 2;
    });
    let best = 0;
    centers.forEach((c, i) => {
      if (Math.abs(c - mid) < Math.abs(centers[best] - mid)) best = i;
    });
    let m = 0;
    if (centers.length >= 2) {
      const a = centers[centers.length - 2], b = centers[centers.length - 1];
      m = clamp((mid - a) / Math.max(1, b - a));
    }
    if (!scrollMotionAllowed()) m = m > 0.5 ? 1 : 0;
    const active = m < 0.02 ? steps[best].dataset.step ?? "all" : "all";
    fig.dataset.active = active;

    stage.querySelectorAll<HTMLElement>(".student-intelligence-blk").forEach((el, i) => {
      const t = clamp(m * 1.3 - i * (0.3 / Math.max(1, blocks.length - 1)));
      const [from, to, u] = t < 0.5 ? [L[0][i], L[1][i], easeInOut(t * 2)] : [L[1][i], L[2][i], easeInOut((t - 0.5) * 2)];
      el.style.transform = `translate(${lerp(from.x, to.x, u).toFixed(1)}px, ${lerp(from.y, to.y, u).toFixed(1)}px)`;
      const dim = active !== "all" && active !== "lessons" && el.dataset.c !== active;
      el.style.opacity = dim ? "0.28" : "1";
    });
    const op0 = 1 - clamp(m * 4), op1 = clamp(1 - Math.abs(m - 0.5) * 4), op2 = clamp((m - 0.72) * 4);
    stage.querySelectorAll<HTMLElement>(".student-intelligence-mf-label").forEach((el) => {
      const layer = el.dataset.layer;
      if (layer === "0") {
        const dim = active !== "all" && active !== "lessons" && el.dataset.c !== active;
        el.style.opacity = (op0 * (dim ? 0.4 : 1)).toFixed(3);
      } else if (layer === "1") el.style.opacity = op1.toFixed(3);
      else el.style.opacity = op2.toFixed(3);
    });
    const subA = fig.querySelector<HTMLElement>("[data-sub='a']");
    const subB = fig.querySelector<HTMLElement>("[data-sub='b']");
    if (subA) subA.style.opacity = (1 - clamp((m - 0.25) * 2.5)).toFixed(3);
    if (subB) subB.style.opacity = clamp((m - 0.55) * 2.5).toFixed(3);
  }, status === "ready");

  if (status === "loading") {
    return <div className="student-intelligence-skeleton" aria-busy="true">Đang đối chiếu nguyên nhân từng điểm rơi…</div>;
  }
  if (totalLost <= 0.004) {
    return (
      <p className="student-intelligence-callout student-intelligence-callout--solid">
        Không có điểm rơi nào cần chẩn đoán ở lượt làm này.
      </p>
    );
  }

  const topTwo = lessons.slice(0, 2);
  const topShare = topTwo.reduce((s, l) => s + l.lost, 0) / totalLost;
  const lessonsTitle =
    lessons.length === 1
      ? `Toàn bộ điểm rơi nằm ở «${lessons[0].name}»`
      : `${topTwo.length} bài giữ ${formatPercent(topShare)} điểm rơi`;
  const unitText = unit === 0.25 ? "0.25" : "0.50";

  return (
    <div className="student-intelligence-diagnosis">
      {status === "error" && (
        <p className="student-intelligence-footnote" style={{ marginTop: 0, marginBottom: 20 }}>
          Chưa tải được nhãn lỗi nên phần lớn câu được xếp vào "Chưa định vị"; nhịp độ vẫn được tính từ thời gian làm bài.
        </p>
      )}
      <div className="student-intelligence-diag2">
        <div className="student-intelligence-mf" ref={figRef} data-active={causeSteps[0]?.cause ?? "all"} aria-hidden="true">
          <div className="student-intelligence-mf-title">
            <strong>−{formatPoints(totalLost)} điểm</strong>
            <span data-sub="a">chia theo nguyên nhân</span>
            <span data-sub="b" style={{ opacity: 0 }}>
              chia theo bài, giữ màu nguyên nhân
            </span>
          </div>
          <div className="student-intelligence-mf-stage" ref={stageRef} style={{ height: 4 * ROW_H + 4 }}>
            {rowsCause.map((c, r) => {
              const s = summary.find((x) => x.cause === c)!;
              return (
                <div key={`c-${c}`} className={`student-intelligence-mf-label${c === "unloc" ? " unloc" : ""}`} data-layer="0" data-c={c} style={{ top: r * ROW_H }}>
                  <span>{CAUSE_LABELS[c]}</span>
                  <span>−{formatPoints(s.points)}</span>
                </div>
              );
            })}
            <div className="student-intelligence-mf-label" data-layer="1" style={{ top: 1.5 * ROW_H, opacity: 0 }}>
              <span>Toàn bộ điểm rơi · {blocks.length} ô</span>
              <span>−{formatPoints(totalLost)}</span>
            </div>
            {lessons.slice(0, 4).map((l, r) => (
              <div key={`l-${l.key}`} className="student-intelligence-mf-label" data-layer="2" style={{ top: r * ROW_H, opacity: 0 }}>
                <span>{l.name}</span>
                <span>−{formatPoints(l.lost)}</span>
              </div>
            ))}
            {blocks.map((b, i) => (
              <span
                key={i}
                className={`student-intelligence-blk${b.cause === "unloc" ? " unloc" : ""}`}
                data-c={b.cause}
                style={{ ["--si-w" as string]: `${CAUSE_WEIGHT[b.cause]}%` }}
              />
            ))}
          </div>
          <div className="student-intelligence-mf-legend">
            {rowsCause.map((c) => (
              <span key={c}>
                <i className={c === "unloc" ? "unloc" : ""} style={{ ["--si-w" as string]: `${CAUSE_WEIGHT[c]}%` }} />
                {CAUSE_LABELS[c]}
              </span>
            ))}
          </div>
          <p className="student-intelligence-footnote">
            Mỗi ô ≈ {unitText} điểm.
            {unloc.points > 0 && ` Gạch chéo: ${formatPoints(unloc.points)} điểm chưa đủ căn cứ để phân loại (${unloc.questions.map((q) => `Câu ${q.number}`).join(", ")}).`}
          </p>
        </div>

        <div className="student-intelligence-steps2" ref={stepsRef}>
          {causeSteps.map((s) => (
            <article key={s.cause} className="student-intelligence-step2" data-step={s.cause}>
              <span className="student-intelligence-kicker">
                {CAUSE_LABELS[s.cause]} · {s.questions.length} câu
              </span>
              <h3 className="student-intelligence-step2-title">
                <span className="student-intelligence-tone--gap">−{formatPoints(s.points)}</span> {CAUSE_PHRASE[s.cause]}
              </h3>
              <p className="student-intelligence-step2-text">
                {s.questions
                  .slice(0, 4)
                  .map((q: QuestionLoss) => `Câu ${q.number}: ${q.note}.`)
                  .join(" ")}
                {s.questions.length > 4 && ` Và ${s.questions.length - 4} câu khác.`}
              </p>
              <div className="student-intelligence-mini">
                <MiniCauses summary={summary} active={s.cause} />
              </div>
              <div className="student-intelligence-qrefs">
                {s.questions.map((q) => (
                  <button key={q.questionId} type="button" className="student-intelligence-qref" onClick={() => onQuestionSelect(q.questionId)}>
                    Câu {q.number}
                  </button>
                ))}
              </div>
              <p className="student-intelligence-basis">
                <b>Căn cứ</b>
                {CAUSE_BASIS[s.cause]}
              </p>
            </article>
          ))}
          <article className="student-intelligence-step2" data-step="lessons">
            <span className="student-intelligence-kicker">Nơi điểm rơi dồn lại</span>
            <h3 className="student-intelligence-step2-title">{lessonsTitle}</h3>
            <ul className="student-intelligence-lesson-lines">
              {lessons.slice(0, 3).map((l) => (
                <li key={l.key}>
                  <span>{l.name}</span>
                  <span className="student-intelligence-tone--gap">−{formatPoints(l.lost)}</span>
                </li>
              ))}
            </ul>
            {lessons.length > 3 && <p className="student-intelligence-footnote">Các bài còn lại xem ở Phụ lục.</p>}
          </article>
        </div>
      </div>

      {chain && (
        <div ref={chainRef} className={`student-intelligence-chain2${chainIn ? " is-inview" : ""}`}>
          <span className="student-intelligence-kicker">Mắt xích có thể liên quan</span>
          <div className="student-intelligence-chain2-flow">
            {chain.nodes.map((n, i) => (
              <div key={`${n.kind}-${i}`} className="student-intelligence-chain2-step" style={{ ["--si-delay" as string]: `${i * 320}ms` }}>
                {i > 0 && <ArrowIcon />}
                <div className={`student-intelligence-chain2-node is-${n.kind}`}>
                  <span className="student-intelligence-chain2-role">{n.role}</span>
                  <span className="student-intelligence-chain2-name">{n.name}</span>
                  <span className="student-intelligence-chain2-ev">{n.evidence}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="student-intelligence-chain2-explain">{chain.explanation}</p>
          <p className="student-intelligence-disclaimer" role="note">
            {ROOT_CAUSE_DISCLAIMER}
          </p>
          {chain.moreCount > 0 && <p className="student-intelligence-footnote">Còn {chain.moreCount} mắt xích khác ở Phụ lục.</p>}
        </div>
      )}
    </div>
  );
}
