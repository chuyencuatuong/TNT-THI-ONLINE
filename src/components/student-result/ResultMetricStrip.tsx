import { formatDuration, formatPace, formatPercent, formatPoints } from "./resultFormat";

/**
 * Phân mục 01 — dải 4 chỉ số đo lường đặt ngay dưới khối điểm:
 *  1. Độ chính xác: tỉ lệ câu đạt trọn điểm.
 *  2. Điểm rơi: tổng điểm hao hụt so với điểm tối đa của đề.
 *  3. Thời gian: tổng thời gian làm bài + nhịp bình quân mỗi câu.
 *  4. Tỉ lệ chuẩn hoá nhãn lỗi: bao nhiêu câu sai đã tra được bản chất lỗi từ
 *     nhãn thầy đối soát (độ tin cậy của phân mục 03).
 * Mỗi ô tự nói rõ căn cứ ở dòng phụ — không có con số "trơ" không giải thích.
 */

export interface MetricStripData {
  /** Câu đạt trọn điểm / tổng số câu. */
  fullCount: number;
  questionCount: number;
  /** Điểm hao hụt so với tối đa của đề (>= 0). */
  pointsLost: number;
  wrongCount: number;
  blankCount: number;
  /** null = không có dữ liệu thời gian. */
  durationSeconds: number | null;
  /** Thời lượng quy định của đề (phút), nếu có. */
  durationLimitMinutes: number | null;
  /** null = đang phân tích (dữ liệu nhãn lỗi tải sau phần điểm). */
  labeling: { verified: number; wrong: number } | null;
  /** true = không tải được dữ liệu nhãn lỗi. */
  labelingUnavailable?: boolean;
}

interface Tile {
  key: string;
  label: string;
  value: string;
  sub: string;
  tone: "solid" | "gap" | "accent" | "ink" | "faint";
}

function buildTiles(d: MetricStripData): Tile[] {
  const accuracy = d.questionCount > 0 ? d.fullCount / d.questionCount : null;
  const lossParts = [
    d.wrongCount > 0 ? `${d.wrongCount} câu chưa trọn điểm` : null,
    d.blankCount > 0 ? `${d.blankCount} câu bỏ trống` : null,
  ].filter(Boolean);

  let timeSub = "Chưa ghi nhận thời gian làm bài";
  if (d.durationSeconds !== null && d.questionCount > 0) {
    timeSub = `Bình quân ${formatPace(d.durationSeconds / d.questionCount)}`;
    if (d.durationLimitMinutes) timeSub += ` · giới hạn ${d.durationLimitMinutes} phút`;
  }

  let labelTile: Tile;
  if (d.labelingUnavailable) {
    labelTile = {
      key: "label",
      label: "Tỉ lệ chuẩn hoá nhãn lỗi",
      value: "—",
      sub: "Chưa tải được dữ liệu nhãn lỗi",
      tone: "faint",
    };
  } else if (!d.labeling) {
    labelTile = { key: "label", label: "Tỉ lệ chuẩn hoá nhãn lỗi", value: "…", sub: "Đang đối soát nhãn lỗi", tone: "faint" };
  } else if (d.labeling.wrong === 0) {
    labelTile = {
      key: "label",
      label: "Tỉ lệ chuẩn hoá nhãn lỗi",
      value: "—",
      sub: "Không có câu sai cần đối soát",
      tone: "faint",
    };
  } else {
    labelTile = {
      key: "label",
      label: "Tỉ lệ chuẩn hoá nhãn lỗi",
      value: formatPercent(d.labeling.verified / d.labeling.wrong),
      sub: `${d.labeling.verified} / ${d.labeling.wrong} câu sai có nhãn thầy đối soát`,
      tone: "accent",
    };
  }

  return [
    {
      key: "accuracy",
      label: "Độ chính xác",
      value: accuracy === null ? "—" : formatPercent(accuracy),
      sub: `${d.fullCount} / ${d.questionCount} câu đạt trọn điểm`,
      tone: "solid",
    },
    {
      key: "loss",
      label: "Điểm rơi",
      value: d.pointsLost > 0.004 ? `−${formatPoints(d.pointsLost)}` : "0.00",
      sub: lossParts.length > 0 ? lossParts.join(" · ") : "Không rơi điểm nào",
      tone: d.pointsLost > 0.004 ? "gap" : "solid",
    },
    {
      key: "time",
      label: "Thời gian",
      value: d.durationSeconds === null ? "—" : formatDuration(d.durationSeconds),
      sub: timeSub,
      tone: "ink",
    },
    labelTile,
  ];
}

export function ResultMetricStrip({ data }: { data: MetricStripData }) {
  const tiles = buildTiles(data);
  return (
    <dl className="student-intelligence-metrics" aria-label="Chỉ số đo lường">
      {tiles.map((t) => (
        <div key={t.key} className="student-intelligence-metric">
          <dt className="student-intelligence-metric-label">{t.label}</dt>
          <dd className={`student-intelligence-metric-value student-intelligence-tone--${t.tone}`}>{t.value}</dd>
          <dd className="student-intelligence-metric-sub">{t.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
