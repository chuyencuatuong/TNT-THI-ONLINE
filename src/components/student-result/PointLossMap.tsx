import { useMemo, useState } from "react";
import type { ExamAutopsy, ScoreLossRow, StudentResponseFact } from "../../lib/errorIntelligence";
import { useInView } from "./motion";
import { formatPercent, formatPoints } from "./resultFormat";

/**
 * Phân mục 02 — Bản đồ điểm hao hụt theo Bài.
 *
 * Hai lớp đọc:
 *  1. "Dải thác điểm" (waterfall trải phẳng): 1 thanh = toàn bộ điểm của đề.
 *     Phần xanh thông là điểm giữ được, sau đó lần lượt từng khúc đất nung là
 *     điểm rơi ở từng Bài — nhìn 1 giây thấy ngay điểm rơi dồn vào đâu.
 *  2. Danh sách Bài (autopsy.scoreLoss, mất nhiều nhất trước). Mỗi Bài có 1
 *     "thanh mật độ": chia khúc theo từng câu (độ dài = điểm tối đa của câu),
 *     mỗi khúc tô xanh phần giữ được, đất nung phần rơi, gạch chéo nếu bỏ trống.
 * Rê chuột / focus vào 1 Bài sẽ làm nổi khúc tương ứng trên dải thác điểm.
 *
 * Số liệu lấy nguyên từ buildExamAutopsy (quy về barem chuẩn) — component chỉ
 * gom lại danh sách câu theo đúng khoá nhóm của autopsy để vẽ thanh mật độ.
 */

type LoadStatus = "loading" | "error" | "ready";

/** Cùng quy tắc khoá nhóm với buildExamAutopsy (errorIntelligence.ts). */
function groupKeyOf(f: StudentResponseFact): string {
  return f.lessonId ? `lesson:${f.lessonId}` : f.topicId ? `topic:${f.topicId}` : "none";
}

function keptGroupName(f: StudentResponseFact): string {
  return f.lessonName ?? (f.topicName ? `${f.topicName} (chưa gán Bài)` : "(chưa gán Chương/Bài)");
}

function headline(rows: ScoreLossRow[], totalLost: number): string | null {
  if (rows.length === 0 || totalLost <= 0) return null;
  const top = rows[0];
  const topShare = top.pointsLost / totalLost;
  if (rows.length === 1) return `Toàn bộ điểm rơi nằm ở «${top.name}» — đây là điểm nghẽn duy nhất cần khơi thông.`;
  const twoShare = (top.pointsLost + rows[1].pointsLost) / totalLost;
  if (topShare < 0.5 && twoShare >= 0.6 && rows.length > 2) {
    return `Hai bài đầu danh sách chiếm ${formatPercent(twoShare)} điểm rơi — khơi thông hai điểm nghẽn này là cách nâng điểm nhanh nhất.`;
  }
  return `«${top.name}» là điểm nghẽn lớn nhất, chiếm ${formatPercent(topShare)} tổng điểm rơi.`;
}

export function PointLossMap({
  status,
  autopsy,
  facts,
  questionNumbers,
  customScoring,
}: {
  status: LoadStatus;
  autopsy: ExamAutopsy | null;
  /** Facts của CHÍNH lượt làm bài này (đã lọc theo attemptId). */
  facts: StudentResponseFact[];
  questionNumbers: Map<string, number>;
  customScoring: boolean;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const { factsByGroup, keptNames } = useMemo(() => {
    const byGroup = new Map<string, StudentResponseFact[]>();
    for (const f of facts) {
      const k = groupKeyOf(f);
      const list = byGroup.get(k) ?? [];
      list.push(f);
      byGroup.set(k, list);
    }
    const order = (f: StudentResponseFact) => questionNumbers.get(f.questionId) ?? Number.MAX_SAFE_INTEGER;
    for (const list of byGroup.values()) list.sort((a, b) => order(a) - order(b));
    const lostKeys = new Set(autopsy?.scoreLoss.map((r) => r.key) ?? []);
    const kept = Array.from(byGroup.entries())
      .filter(([k, list]) => !lostKeys.has(k) && list.some((f) => f.maxScore > 0))
      .map(([, list]) => keptGroupName(list[0]));
    return { factsByGroup: byGroup, keptNames: kept };
  }, [facts, autopsy, questionNumbers]);

  if (status === "loading") {
    return <div className="student-intelligence-skeleton" aria-busy="true">Đang lập bản đồ điểm hao hụt…</div>;
  }
  if (status === "error" || !autopsy) {
    return (
      <div className="student-intelligence-placeholder">
        Chưa tải được dữ liệu phân tích theo Bài cho lượt làm này. Em vẫn có thể xem từng câu ở phân mục 08.
      </div>
    );
  }
  if (autopsy.totalPossible <= 0) {
    return <div className="student-intelligence-placeholder">Đề này chưa có câu hỏi nào được tính điểm.</div>;
  }
  if (autopsy.totalLost <= 0) {
    return (
      <p className="student-intelligence-callout student-intelligence-callout--solid">
        Em giữ trọn toàn bộ điểm ở mọi Bài trong đề. Không có điểm nghẽn nào cần khơi thông ở lượt làm này.
      </p>
    );
  }

  const total = autopsy.totalPossible;
  const kept = Math.max(0, total - autopsy.totalLost);
  const rows = autopsy.scoreLoss;
  const lead = headline(rows, autopsy.totalLost);

  return (
    <div ref={ref} className={`student-intelligence-lossmap${inView ? " is-inview" : ""}`}>
      {lead && <p className="student-intelligence-callout">{lead}</p>}

      {/* ---- Dải thác điểm ------------------------------------------------ */}
      <figure className="student-intelligence-cascade">
        <figcaption className="student-intelligence-cascade-caption">
          <span>
            Giữ được <strong className="student-intelligence-tone--solid">{formatPoints(kept)}</strong>
          </span>
          <span>
            Rơi <strong className="student-intelligence-tone--gap">−{formatPoints(autopsy.totalLost)}</strong> /{" "}
            {formatPoints(total)} điểm
          </span>
        </figcaption>
        <div className="student-intelligence-cascade-track" role="img" aria-label={`Giữ được ${formatPoints(kept)} trên ${formatPoints(total)} điểm; điểm rơi phân bổ theo ${rows.length} bài.`}>
          <span
            className="student-intelligence-cascade-seg student-intelligence-cascade-seg--kept"
            style={{ ["--si-fill" as string]: kept / total }}
            title={`Giữ được ${formatPoints(kept)} điểm`}
          />
          {rows.map((r, i) => (
            <span
              key={r.key}
              className={`student-intelligence-cascade-seg student-intelligence-cascade-seg--lost${
                activeKey === r.key ? " is-active" : ""
              }${activeKey && activeKey !== r.key ? " is-dimmed" : ""}`}
              style={{
                ["--si-fill" as string]: r.pointsLost / total,
                ["--si-delay" as string]: `${240 + i * 110}ms`,
              }}
              title={`${r.name}: −${formatPoints(r.pointsLost)}`}
              onMouseEnter={() => setActiveKey(r.key)}
              onMouseLeave={() => setActiveKey(null)}
            />
          ))}
        </div>
        <div className="student-intelligence-cascade-scale" aria-hidden="true">
          <span>0</span>
          <span>{formatPoints(total)}</span>
        </div>
      </figure>

      {/* ---- Danh sách Bài -------------------------------------------------- */}
      <ol className="student-intelligence-lossrows">
        {rows.map((r, i) => {
          const questions = factsByGroup.get(r.key) ?? [];
          const share = r.pointsLost / autopsy.totalLost;
          const meta = [
            r.wrongCount > 0 ? `${r.wrongCount} câu sai` : null,
            r.blankCount > 0 ? `${r.blankCount} bỏ trống` : null,
            `chiếm ${formatPercent(share)} điểm rơi`,
          ].filter(Boolean);
          return (
            <li
              key={r.key}
              className={`student-intelligence-lossrow${activeKey === r.key ? " is-active" : ""}`}
              tabIndex={0}
              onMouseEnter={() => setActiveKey(r.key)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(r.key)}
              onBlur={() => setActiveKey(null)}
            >
              <span className="student-intelligence-lossrow-rank" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="student-intelligence-lossrow-main">
                <div className="student-intelligence-lossrow-head">
                  <span className="student-intelligence-lossrow-name">{r.name}</span>
                  <span className="student-intelligence-lossrow-figure">
                    <strong className="student-intelligence-tone--gap">−{formatPoints(r.pointsLost)}</strong>
                    <small> / {formatPoints(r.pointsPossible)} đ</small>
                  </span>
                </div>
                <div
                  className="student-intelligence-density"
                  role="img"
                  aria-label={`${questions.length} câu thuộc bài này, rơi ${formatPoints(r.pointsLost)} trên ${formatPoints(r.pointsPossible)} điểm`}
                >
                  {questions.map((f, qi) => {
                    const ratio = f.maxScore > 0 ? Math.min(1, Math.max(0, f.score / f.maxScore)) : 0;
                    const n = questionNumbers.get(f.questionId);
                    const label = `${n ? `Câu ${n}` : "Câu"} · ${
                      f.answered ? `được ${formatPoints(f.score)} / ${formatPoints(f.maxScore)}` : "bỏ trống"
                    }`;
                    return (
                      <span
                        key={f.questionId}
                        className={`student-intelligence-density-cell${f.answered ? "" : " is-blank"}`}
                        style={{
                          flexGrow: Math.max(f.maxScore, 0.01),
                          ["--si-fill" as string]: ratio,
                          ["--si-delay" as string]: `${320 + i * 90 + qi * 35}ms`,
                        }}
                        title={label}
                      >
                        <span className="student-intelligence-density-kept" />
                      </span>
                    );
                  })}
                </div>
                <div className="student-intelligence-lossrow-meta">{meta.join(" · ")}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="student-intelligence-legend" aria-hidden="true">
        <span>
          <i className="student-intelligence-swatch student-intelligence-swatch--solid" /> Điểm giữ được
        </span>
        <span>
          <i className="student-intelligence-swatch student-intelligence-swatch--gap" /> Điểm rơi
        </span>
        <span>
          <i className="student-intelligence-swatch student-intelligence-swatch--blank" /> Câu bỏ trống
        </span>
        <span>Mỗi khúc trên thanh là 1 câu, dài theo điểm tối đa của câu.</span>
      </div>

      {keptNames.length > 0 && (
        <p className="student-intelligence-kept">
          <strong>Giữ trọn điểm:</strong> {keptNames.join(" · ")}
        </p>
      )}

      {customScoring && (
        <p className="student-intelligence-footnote">
          Đề dùng thang điểm tuỳ chỉnh — điểm hao hụt ở đây được quy về barem chuẩn Bộ GD&amp;ĐT để so sánh được giữa
          các đề, nên có thể lệch nhẹ so với điểm tổng phía trên.
        </p>
      )}
    </div>
  );
}
