import type { ReactNode } from "react";
import { ArrowRightIcon } from "./ResultNav";
import { useCountUp, useInView } from "./motion";
import { formatPoints } from "./resultFormat";

/**
 * Phân mục 01 — khối điểm số chính.
 *  - Điểm tổng cuộn từ 0.00 lên điểm thật (counter roll, tabular-nums).
 *  - Lời nhận định ngắn theo dải điểm + phần thi hao hụt nhiều nhất.
 *  - 3 phần thi theo cấu trúc Bộ GD&ĐT, mỗi phần có thanh đo giữ được / hao hụt.
 * Bảo lưu nguyên: cảnh báo bài bị huỷ (invalidated) và ghi chú điểm điều chỉnh.
 */

export interface HeroPart {
  part: 1 | 2 | 3;
  points: number;
  maxPoints: number;
  /** Số câu thuộc phần này. */
  count: number;
  /** Số câu đạt trọn điểm. */
  full: number;
}

export interface HeroAdjustment {
  adjustedAt: string;
  originalTotal: number | null;
  reason: string | null;
}

const PART_TITLES: Record<1 | 2 | 3, { roman: string; name: string; unit: string }> = {
  1: { roman: "Phần I", name: "Nhiều lựa chọn", unit: "câu trọn điểm" },
  2: { roman: "Phần II", name: "Đúng / Sai", unit: "câu trọn 4 ý" },
  3: { roman: "Phần III", name: "Trả lời ngắn", unit: "câu chính xác" },
};

interface Verdict {
  title: string;
  tone: "solid" | "neutral" | "gap";
}

/** Dải điểm -> lời nhận định. Ngôn từ khích lệ, không dùng từ phán xét. */
function verdictFor(total: number): Verdict {
  if (total >= 9) return { title: "Làm chủ vững vàng", tone: "solid" };
  if (total >= 8) return { title: "Nền tảng vững, gần chạm mức tối đa", tone: "solid" };
  if (total >= 6.5) return { title: "Khá — còn vài điểm nghẽn cần khơi thông", tone: "neutral" };
  if (total >= 5) return { title: "Đạt — còn khoảng trống cần bù đắp", tone: "neutral" };
  return { title: "Cần củng cố lại nền tảng trước khi tăng tốc", tone: "gap" };
}

function weakestPartLine(parts: HeroPart[]): string | null {
  const scored = parts.filter((p) => p.maxPoints > 0);
  if (scored.length < 2) return null;
  const ratio = (p: HeroPart) => p.points / p.maxPoints;
  if (scored.every((p) => ratio(p) >= 0.999)) return "Giữ trọn điểm ở cả ba phần thi.";
  const weakest = [...scored].sort((a, b) => ratio(a) - ratio(b) || b.maxPoints - a.maxPoints)[0];
  return `Hao hụt nhiều nhất ở ${PART_TITLES[weakest.part].roman} — giữ được ${formatPoints(weakest.points)} / ${formatPoints(weakest.maxPoints)} điểm.`;
}

function PrinterIcon() {
  return (
    <svg
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
      <path d="M4 6V2h8v4" />
      <path d="M4 12H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1" />
      <rect x="4" y="9" width="8" height="5" />
    </svg>
  );
}

export function ResultHero({
  examTitle,
  dateLabel,
  scaleLabel,
  invalidated,
  adjustment,
  total,
  parts,
  ctaLabel,
  onCta,
  onPrint,
  children,
}: {
  examTitle: string | null;
  dateLabel: string | null;
  scaleLabel: string;
  invalidated: boolean;
  adjustment: HeroAdjustment | null;
  total: number;
  parts: HeroPart[];
  ctaLabel: string;
  onCta: () => void;
  onPrint: () => void;
  /** Dải chỉ số (ResultMetricStrip) đặt ngay dưới khối điểm. */
  children?: ReactNode;
}) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.1, rootMargin: "0px" });
  const rolled = useCountUp(total, { start: inView });
  const verdict = verdictFor(total);
  const partLine = weakestPartLine(parts);

  return (
    <div ref={ref} className={`student-intelligence-hero${inView ? " is-inview" : ""}`}>
      <div className="student-intelligence-panel">
        <div className="student-intelligence-hero-meta">
          <span>{dateLabel ? `Làm bài ngày ${dateLabel}` : "Kết quả bài làm"}</span>
          <span>{scaleLabel}</span>
        </div>

        {invalidated && (
          <div className="student-intelligence-notice student-intelligence-notice--alert" role="alert">
            Bài làm này đã bị tự động huỷ do rời trang quá số lần cho phép ở chế độ thi nghiêm túc. Điểm bên dưới
            chỉ để tham khảo, không được công nhận là kết quả hợp lệ.
          </div>
        )}

        {/* Điểm đã được giáo viên điều chỉnh (14/09/2026) — hiện CÔNG KHAI cho
            học sinh kèm lý do, đã chốt là minh bạch. */}
        {adjustment && (
          <div className="student-intelligence-notice">
            <div className="student-intelligence-notice-title">
              Điểm bài này đã được thầy điều chỉnh
              {adjustment.originalTotal !== null && (
                <span className="student-intelligence-numeral">
                  {" "}
                  · {formatPoints(adjustment.originalTotal)} → {formatPoints(total)}
                </span>
              )}
            </div>
            {adjustment.reason && <div>Lý do: {adjustment.reason}</div>}
            <div className="student-intelligence-notice-meta">
              Điều chỉnh lúc {new Date(adjustment.adjustedAt).toLocaleString("vi-VN")}
            </div>
          </div>
        )}

        {examTitle && <h1 className="student-intelligence-exam-name">{examTitle}</h1>}

        <div className="student-intelligence-score-row">
          <div className="student-intelligence-score" role="img" aria-label={`Điểm ${formatPoints(total)} trên 10`}>
            <span className="student-intelligence-score-value" aria-hidden="true">
              {formatPoints(rolled)}
            </span>
            <span className="student-intelligence-score-scale" aria-hidden="true">
              / 10.00
            </span>
          </div>
          <div className={`student-intelligence-verdict student-intelligence-verdict--${verdict.tone}`}>
            <span className="student-intelligence-verdict-title">{verdict.title}</span>
            {partLine && <span className="student-intelligence-verdict-detail">{partLine}</span>}
          </div>
        </div>

        <div className="student-intelligence-parts">
          {parts.map((p) => {
            const ratio = p.maxPoints > 0 ? Math.min(1, p.points / p.maxPoints) : 0;
            const t = PART_TITLES[p.part];
            return (
              <div key={p.part} className="student-intelligence-part">
                <div className="student-intelligence-part-label">
                  {t.roman} · {t.name}
                </div>
                <div className="student-intelligence-part-points">
                  {formatPoints(p.points)} {p.maxPoints > 0 && <small>/ {formatPoints(p.maxPoints)}</small>}
                </div>
                <div
                  className="student-intelligence-meter"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(ratio * 100)}
                  aria-label={`${t.roman}: giữ được ${Math.round(ratio * 100)}% số điểm`}
                >
                  <span
                    className="student-intelligence-meter-fill"
                    style={{ ["--si-fill" as string]: ratio, ["--si-delay" as string]: `${(p.part - 1) * 90}ms` }}
                  />
                </div>
                <div className="student-intelligence-part-detail">
                  {p.count > 0 ? `${p.full} / ${p.count} ${t.unit}` : "Đề không có phần này"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="student-intelligence-hero-actions">
          <button type="button" className="student-intelligence-button" onClick={onPrint}>
            <PrinterIcon />
            Tải phiếu kết quả
          </button>
          <button
            type="button"
            className="student-intelligence-button student-intelligence-button--primary"
            onClick={onCta}
          >
            {ctaLabel}
            <ArrowRightIcon />
          </button>
        </div>
      </div>

      {children}
    </div>
  );
}
