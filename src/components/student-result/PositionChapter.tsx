import { useRef } from "react";
import { DIFFICULTY_LABELS, type Difficulty } from "../../lib/types";
import { SCORE_BANDS, scoreBand, type Percentile, type TierSummary } from "../../lib/resultReport";
import { useInView } from "./motion";
import { formatPoints } from "./resultFormat";
import { clamp, isWideViewport, scrollMotionAllowed, useScrollFrame } from "./scrollFrames";

/**
 * Chương 1 — Vị trí. Bố cục chia đôi bất đối xứng:
 *  - Trái: con số vị trí lớn (phân vị nếu đề có >= 20 lượt làm lần đầu, nếu
 *    không thì nhóm năng lực theo thang cố định) + câu kết luận + căn cứ.
 *  - Phải: phân bố điểm ẩn danh (chấm "Em" trượt vào đúng chỗ) hoặc thang 4
 *    nhóm; 3 phần thi; dải tầng tư duy.
 * Parallax (chỉ màn rộng, khi được phép chuyển động): cột trái trượt ngang,
 * cột phải trượt dọc theo vị trí cuộn.
 */

export interface PositionPart {
  part: 1 | 2 | 3;
  points: number;
  maxPoints: number;
  count: number;
  full: number;
}

export interface TierChip {
  difficulty: Difficulty;
  accuracy: number | null;
  count: number;
}

const PART_TITLES: Record<1 | 2 | 3, [string, string, string]> = {
  1: ["Phần I", "Nhiều lựa chọn", "câu trọn điểm"],
  2: ["Phần II", "Đúng / Sai", "câu trọn 4 ý"],
  3: ["Phần III", "Trả lời ngắn", "câu chính xác"],
};

const comma = (n: number) => String(n).replace(".", ",");
/** Nhãn "Em · x" sát mép trục thì neo vào trong để không tràn khung. */
const markerEdge = (me: number) => (me >= 8.8 ? " is-end" : me <= 1.2 ? " is-start" : "");

function DistributionPlot({ scores, me, pct }: { scores: number[]; me: number; pct: number }) {
  // Xếp chồng các điểm trùng nhau thành cột chấm; bỏ 1 chấm đúng bằng điểm của em (chấm "Em" thay chỗ).
  const stack = new Map<number, number>();
  let skipped = false;
  const dots = scores.map((s, i) => {
    if (!skipped && Math.abs(s - me) < 0.005) {
      skipped = true;
      return null;
    }
    const key = Math.round(s * 100);
    const y = stack.get(key) ?? 0;
    stack.set(key, y + 1);
    return <span key={i} className="student-intelligence-dot" style={{ ["--si-x" as string]: s * 10, ["--si-y" as string]: Math.min(y, 9), ["--si-dd" as string]: `${(i % 7) * 25}ms` }} />;
  });
  return (
    <div className="student-intelligence-dist" role="img" aria-label={`Phân bố điểm của ${scores.length} lượt làm lần đầu; điểm của em ${formatPoints(me)}, cao hơn ${pct}% số lượt`}>
      <div className="student-intelligence-dist-plot">
        {dots}
        <span className={`student-intelligence-marker${markerEdge(me)}`} style={{ ["--si-x" as string]: me * 10 }}>
          <b>Em · {formatPoints(me)}</b>
          <i />
        </span>
      </div>
      <div className="student-intelligence-dist-axis" aria-hidden="true">
        {[0, 2, 4, 6, 8, 10].map((t) => (
          <span key={t} style={{ left: `${t * 10}%` }}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function BandScale({ me }: { me: number }) {
  const here = scoreBand(me);
  return (
    <div>
      <div className="student-intelligence-bands" role="img" aria-label={`Thang năng lực 4 nhóm; điểm của em ${formatPoints(me)} thuộc nhóm ${here.name}`}>
        {SCORE_BANDS.map((b) => (
          <div key={b.key} className={`student-intelligence-band${b.key === here.key ? " is-here" : ""}`} style={{ flexGrow: b.to - b.from }}>
            {b.name}
            <small>
              {comma(b.from)}–{comma(b.to)}
            </small>
          </div>
        ))}
        <span className={`student-intelligence-marker${markerEdge(me)}`} style={{ ["--si-x" as string]: me * 10 }}>
          <b>Em · {formatPoints(me)}</b>
          <i />
        </span>
      </div>
    </div>
  );
}

export function PositionChapter({
  total,
  percentile,
  distributionCount,
  scores,
  parts,
  tiers,
  tierInfo,
  basis,
}: {
  total: number;
  percentile: Percentile | null;
  /** Số lượt làm lần đầu hợp lệ của đề (null = chưa có dữ liệu so sánh). */
  distributionCount: number | null;
  scores: number[] | null;
  parts: PositionPart[];
  tiers: TierChip[];
  tierInfo: TierSummary;
  basis: string;
}) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [figRef, figIn] = useInView<HTMLDivElement>();
  const [partsRef, partsIn] = useInView<HTMLDivElement>();

  useScrollFrame(() => {
    const host = hostRef.current, l = leftRef.current, r = rightRef.current;
    if (!host || !l || !r) return;
    if (!isWideViewport() || !scrollMotionAllowed()) {
      l.style.transform = "";
      r.style.transform = "";
      return;
    }
    const rect = host.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = clamp((vh - rect.top) / (vh + rect.height));
    l.style.transform = `translateX(${((0.5 - p) * 80).toFixed(1)}px)`;
    r.style.transform = `translateY(${((0.5 - p) * 110).toFixed(1)}px)`;
  });

  const band = scoreBand(total);
  const lede = percentile
    ? `Trong ${percentile.n} lượt làm lần đầu của đề này, em đứng trên ${percentile.below} lượt.`
    : distributionCount !== null
      ? `Đề mới có ${distributionCount} lượt làm lần đầu, chưa đủ 20 lượt để so vị trí. Kết quả được đối chiếu với thang năng lực 4 nhóm.`
      : "Chưa có dữ liệu so sánh giữa các lượt làm đề này. Kết quả được đối chiếu với thang năng lực 4 nhóm.";

  const solidName = tierInfo.solidUpTo ? DIFFICULTY_LABELS[tierInfo.solidUpTo] : null;
  const gapName = tierInfo.firstGap ? DIFFICULTY_LABELS[tierInfo.firstGap] : null;
  let tierText: string | null = null;
  if (solidName && gapName && tierInfo.basic !== null && tierInfo.advanced !== null) {
    tierText = `Vững tới tầng ${solidName}. Từ tầng ${gapName}, độ chính xác giảm từ ${Math.round(tierInfo.basic * 100)}% xuống ${Math.round(tierInfo.advanced * 100)}%.`;
  } else if (solidName && !gapName) {
    tierText = `Vững ở mọi tầng có trong đề, tới tầng ${solidName}.`;
  } else if (!solidName && gapName) {
    tierText = `Từ tầng ${gapName} đã có khoảng trống cần bù đắp.`;
  }

  return (
    <div className="student-intelligence-split" ref={hostRef}>
      <div className="student-intelligence-split-left" ref={leftRef}>
        <span className="student-intelligence-eyebrow">Chương 1 · Vị trí</span>
        <h2 className="student-intelligence-chapter-title">Em đang đứng ở đâu</h2>
        <div className="student-intelligence-pos-big">
          {percentile ? `${percentile.pct}%` : band.name}
          <small>{percentile ? "số lượt làm đề có điểm thấp hơn em" : "nhóm năng lực theo thang điểm cố định"}</small>
        </div>
        <p className="student-intelligence-lede">{lede}</p>
        <p className="student-intelligence-basis">
          <b>Căn cứ</b>
          {basis}
        </p>
      </div>

      <div className="student-intelligence-split-right" ref={rightRef}>
        <div ref={figRef} className={`student-intelligence-pos-figure${figIn ? " is-inview" : ""}`}>
          {percentile && scores ? <DistributionPlot scores={scores} me={total} pct={percentile.pct} /> : <BandScale me={total} />}
        </div>

        <div ref={partsRef} className={`student-intelligence-parts2${partsIn ? " is-inview" : ""}`}>
          {parts.map((p, i) => {
            const [roman, name, unit] = PART_TITLES[p.part];
            const ratio = p.maxPoints > 0 ? Math.min(1, p.points / p.maxPoints) : 0;
            return (
              <div key={p.part}>
                <div className="student-intelligence-part-label">
                  {roman} · {name}
                </div>
                <div className="student-intelligence-part-points">
                  {formatPoints(p.points)} {p.maxPoints > 0 && <small>/ {formatPoints(p.maxPoints)}</small>}
                </div>
                <div className="student-intelligence-meter" aria-hidden="true">
                  <span className="student-intelligence-meter-fill" style={{ ["--si-fill" as string]: ratio, ["--si-delay" as string]: `${i * 120}ms` }} />
                </div>
                <div className="student-intelligence-part-detail">{p.count > 0 ? `${p.full} / ${p.count} ${unit}` : "Đề không có phần này"}</div>
              </div>
            );
          })}
        </div>

        {tiers.some((t) => t.count > 0) && (
          <div className={`student-intelligence-tiers${partsIn ? " is-inview" : ""}`}>
            <div className="student-intelligence-tier-chips">
              {tiers
                .filter((t) => t.count > 0)
                .map((t, i) => (
                  <span key={t.difficulty} className="student-intelligence-tier-chip-wrap">
                    {i > 0 && <span className="student-intelligence-tier-sep" aria-hidden="true">→</span>}
                    <span
                      className={`student-intelligence-tier-chip ${t.accuracy !== null && t.accuracy >= 0.8 ? "is-solid" : "is-gap"}`}
                      style={{ ["--si-delay" as string]: `${i * 140}ms` }}
                    >
                      {DIFFICULTY_LABELS[t.difficulty]} <small>{t.accuracy === null ? "—" : `${Math.round(t.accuracy * 100)}%`}</small>
                    </span>
                  </span>
                ))}
            </div>
            {tierText && <p className="student-intelligence-tiers-text">{tierText}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
