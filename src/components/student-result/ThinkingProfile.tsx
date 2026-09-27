import type { MasteryLabel, TopicDiagnosis } from "../../lib/diagnosis";
import { combinedAccuracy, type BloomCell } from "../../lib/learningState";
import type { Difficulty } from "../../lib/types";
import { useInView } from "./motion";
import { formatPercent, masteryMix } from "./resultFormat";

/**
 * Phân mục 04 — Hồ sơ nhận thức 4 bậc (Nhận biết -> Vận dụng cao).
 *
 *  - "Tháp nhận thức bậc thang": mỗi bậc là 1 tầng tháp (đáy rộng = Nhận biết,
 *    đỉnh hẹp = Vận dụng cao). Phần lõi tô màu bên trong tầng = độ chính xác,
 *    mở rộng từ tâm ra khi cuộn tới; màu pha liên tục xanh thông -> đất nung
 *    theo đúng tỉ lệ đúng (không có bảng màu cầu vồng).
 *  - "Độ dốc năng lực": so nhóm nền tảng (NB+TH) với nhóm vận dụng (VD+VDC)
 *    bằng combinedAccuracy — chỉ vẽ khi mỗi nhóm có >= 3 câu.
 *  - Nhận định sư phạm từ generateInsightNarrative (quy tắc cố định, có ngưỡng
 *    dữ liệu). Không khớp quy tắc nào -> lời khuyên luyện thêm, không bịa.
 *
 * Nguồn: buildBloomBreakdown(attemptFacts) khi đã có; trong lúc chờ (hoặc khi
 * không tải được) dùng diagnostics.byDifficulty — cùng thuật toán diagnoseTopic.
 * byDifficulty còn cho tín hiệu nhịp độ từng bậc (nhanh/chậm/đổi đáp án).
 */

type DifficultyDiagnosis = TopicDiagnosis & { difficulty: Difficulty };

const TIERS: { difficulty: Difficulty; step: number; name: string; width: number }[] = [
  { difficulty: "van_dung_cao", step: 4, name: "Vận dụng cao", width: 0.52 },
  { difficulty: "van_dung", step: 3, name: "Vận dụng", width: 0.68 },
  { difficulty: "thong_hieu", step: 2, name: "Thông hiểu", width: 0.84 },
  { difficulty: "nhan_biet", step: 1, name: "Nhận biết", width: 1 },
];

/** Tên mức nắm vững theo giọng khích lệ (thay cho nhãn kỹ thuật ở diagnosis.ts). */
const STUDENT_MASTERY: Record<MasteryLabel, string> = {
  vung: "Làm chủ vững vàng",
  chua_chac_chan: "Đúng nhưng chưa thật chắc tay",
  co_lo_hong: "Khoảng trống cần bù đắp",
  mat_goc: "Điểm nghẽn cần khơi thông",
  chua_du_du_lieu: "Chưa đủ căn cứ",
};

const SLOW_TIME_RATIO = 1.3;
const HESITANT_CHANGE_COUNT = 1.5;

function paceNote(d: DifficultyDiagnosis | undefined): string | null {
  if (!d || d.sampleCount < 2) return null;
  if (d.possiblyRushed) return "Làm nhanh hơn nhiều so với định mức";
  if (d.avgTimeRatio > SLOW_TIME_RATIO) return "Chậm hơn định mức thời gian";
  if (d.avgChangeCount > HESITANT_CHANGE_COUNT) return "Đổi đáp án nhiều lần";
  return null;
}

function slopeSentence(basic: number, advanced: number): string {
  const delta = Math.round((advanced - basic) * 100);
  if (Math.abs(delta) < 10) return "Hai nhóm ngang nhau — năng lực giữ ổn định khi bài toán cần nhiều bước hơn.";
  if (delta < 0) return `Giảm ${Math.abs(delta)} điểm phần trăm khi chuyển sang bài toán cần kết hợp nhiều bước.`;
  return `Nhóm vận dụng cao hơn ${delta} điểm phần trăm — phần nền tảng đang là chỗ đáng soát lại.`;
}

function SlopeGlyph({ basic, advanced }: { basic: number; advanced: number }) {
  const y = (v: number) => 40 - v * 32;
  return (
    <svg className="student-intelligence-slope-glyph" viewBox="0 0 120 48" aria-hidden="true">
      <defs>
        <linearGradient id="si-slope-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: masteryMix(basic) }} />
          <stop offset="1" style={{ stopColor: masteryMix(advanced) }} />
        </linearGradient>
      </defs>
      <line x1="8" x2="112" y1="40" y2="40" className="student-intelligence-slope-base" />
      <line
        x1="8"
        x2="112"
        y1={y(basic)}
        y2={y(advanced)}
        stroke="url(#si-slope-gradient)"
        strokeWidth={2}
        strokeLinecap="round"
        pathLength={1}
        className="student-intelligence-slope-line"
      />
      <circle cx="8" cy={y(basic)} r="3.5" style={{ fill: masteryMix(basic) }} />
      <circle cx="112" cy={y(advanced)} r="3.5" style={{ fill: masteryMix(advanced) }} />
    </svg>
  );
}

export function ThinkingProfile({
  bloom,
  byDifficulty,
  narrative,
  narrativeStatus,
}: {
  bloom: BloomCell[] | null;
  byDifficulty: DifficultyDiagnosis[] | null;
  narrative: string | null;
  narrativeStatus: "loading" | "error" | "ready";
}) {
  const [ref, inView] = useInView<HTMLDivElement>();

  const cells: BloomCell[] =
    bloom ??
    (byDifficulty ?? []).map((d) => ({
      difficulty: d.difficulty,
      sampleCount: d.sampleCount,
      accuracy: d.sampleCount > 0 ? d.avgScoreRatio : null,
      label: d.label,
    }));
  const cellOf = new Map(cells.map((c) => [c.difficulty, c]));
  const diagOf = new Map((byDifficulty ?? []).map((d) => [d.difficulty, d]));

  if (!cells.some((c) => c.sampleCount > 0)) {
    return (
      <div className="student-intelligence-placeholder">
        Đề này chưa có câu hỏi được phân loại theo 4 bậc nhận thức. Hồ sơ sẽ hình thành khi em làm thêm các đề đã
        được thầy phân loại mức độ.
      </div>
    );
  }

  const basic = combinedAccuracy(cells, ["nhan_biet", "thong_hieu"], 3);
  const advanced = combinedAccuracy(cells, ["van_dung", "van_dung_cao"], 3);

  let commentary: string;
  if (narrativeStatus === "loading") commentary = "Đang tổng hợp nhận định…";
  else if (narrative) commentary = narrative;
  else
    commentary =
      "Một bài thi chưa đủ căn cứ để rút ra quy luật chắc chắn về cách em tư duy. Mỗi đề em làm thêm sẽ giúp hồ sơ này rõ nét và đáng tin cậy hơn.";

  return (
    <div ref={ref} className={`student-intelligence-thinking${inView ? " is-inview" : ""}`}>
      <div className="student-intelligence-pyramid" role="list" aria-label="Độ chính xác theo 4 bậc nhận thức">
        {TIERS.map((t, i) => {
          const c = cellOf.get(t.difficulty);
          const n = c?.sampleCount ?? 0;
          const acc = c?.accuracy ?? null;
          const note = paceNote(diagOf.get(t.difficulty));
          const thin = n > 0 && n < 2;
          return (
            <div
              key={t.difficulty}
              role="listitem"
              className={`student-intelligence-tier${n === 0 ? " is-empty" : ""}${thin ? " is-thin" : ""}`}
              style={{
                ["--si-tier-width" as string]: t.width,
                ["--si-fill" as string]: acc ?? 0,
                ["--si-tier-color" as string]: acc === null ? "transparent" : masteryMix(acc),
                ["--si-delay" as string]: `${(TIERS.length - 1 - i) * 130}ms`,
              }}
            >
              <div className="student-intelligence-tier-label">
                <span className="student-intelligence-tier-step">Bậc {t.step}</span>
                <span className="student-intelligence-tier-name">{t.name}</span>
              </div>
              <div className="student-intelligence-tier-stage" aria-hidden="true">
                <div className="student-intelligence-tier-shell">
                  <span className="student-intelligence-tier-core" />
                </div>
              </div>
              <div className="student-intelligence-tier-readout">
                {n === 0 ? (
                  <span className="student-intelligence-tier-status">Đề không có câu ở bậc này</span>
                ) : (
                  <>
                    <span className="student-intelligence-tier-percent" style={{ color: masteryMix(acc ?? 0) }}>
                      {formatPercent(acc ?? 0)}
                    </span>
                    <span className="student-intelligence-tier-status">
                      {thin ? "Mới có 1 câu — chưa đủ căn cứ" : STUDENT_MASTERY[c!.label]}
                    </span>
                    <span className="student-intelligence-tier-meta">
                      {n} câu{note ? ` · ${note}` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {basic !== null && advanced !== null ? (
        <div className="student-intelligence-slope">
          <div className="student-intelligence-slope-end">
            <span className="student-intelligence-slope-label">
              Nền tảng <small>NB + TH</small>
            </span>
            <span className="student-intelligence-slope-value" style={{ color: masteryMix(basic) }}>
              {formatPercent(basic)}
            </span>
          </div>
          <SlopeGlyph basic={basic} advanced={advanced} />
          <div className="student-intelligence-slope-end student-intelligence-slope-end--right">
            <span className="student-intelligence-slope-label">
              Vận dụng <small>VD + VDC</small>
            </span>
            <span className="student-intelligence-slope-value" style={{ color: masteryMix(advanced) }}>
              {formatPercent(advanced)}
            </span>
          </div>
          <p className="student-intelligence-slope-text">
            <strong>Độ dốc năng lực:</strong> {slopeSentence(basic, advanced)}
          </p>
        </div>
      ) : (
        <p className="student-intelligence-footnote">
          Cần ít nhất 3 câu ở mỗi nhóm (nền tảng NB + TH, vận dụng VD + VDC) để so sánh độ dốc năng lực.
        </p>
      )}

      <blockquote className="student-intelligence-commentary" aria-live="polite">
        <span className="student-intelligence-commentary-label">Nhận định sư phạm</span>
        <p>{commentary}</p>
      </blockquote>
      <p className="student-intelligence-footnote">
        Nhận định sinh theo quy tắc cố định, có ngưỡng dữ liệu tối thiểu, và chỉ phản ánh lượt làm bài này.
      </p>
    </div>
  );
}
