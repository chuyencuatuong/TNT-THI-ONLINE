import type { RefObject } from "react";
import { ArrowRightIcon } from "./icons";
import { formatPoints } from "./resultFormat";

/**
 * Chương 0 — Tóm lược. Trả lời 3 câu hỏi trong màn hình đầu, không cần cuộn:
 * Vị trí / Nguyên nhân / Việc số 1. Con số lớn ở đây chỉ là chỗ giữ chỗ — số
 * hiển thị thật là bản "bay" trong ReportTopBar (morph lên thanh trên khi cuộn).
 * Bảo lưu: cảnh báo bài bị huỷ (invalidated) và ghi chú điểm thầy điều chỉnh.
 */

export interface SummaryAnswer {
  key: string;
  label: string;
  main: string;
  /** Phần cần nhấn màu đất nung trong dòng chính (ví dụ "2.00 / 3.50"), nếu có. */
  highlight?: string;
  sub: string;
}

export interface SummaryAdjustment {
  adjustedAt: string;
  originalTotal: number | null;
  reason: string | null;
}

function MainLine({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  const [before, after] = text.split(highlight);
  return (
    <>
      {before}
      <span className="student-intelligence-hi-gap">{highlight}</span>
      {after}
    </>
  );
}

function PrinterIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6V2h8v4" />
      <path d="M4 12H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1" />
      <rect x="4" y="9" width="8" height="5" />
    </svg>
  );
}

export function SummaryChapter({
  metaItems,
  invalidated,
  adjustment,
  headline,
  total,
  placeholderRef,
  answers,
  ctaLabel,
  onCta,
  onPrint,
}: {
  metaItems: string[];
  invalidated: boolean;
  adjustment: SummaryAdjustment | null;
  headline: string;
  total: number;
  placeholderRef: RefObject<HTMLSpanElement>;
  answers: SummaryAnswer[];
  ctaLabel: string;
  onCta: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="student-intelligence-summary">
      <div className="student-intelligence-summary-meta student-intelligence-rise" style={{ ["--si-d" as string]: "0ms" }}>
        {metaItems.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>

      {invalidated && (
        <div className="student-intelligence-notice student-intelligence-notice--alert" role="alert">
          Bài làm này đã bị tự động huỷ do rời trang quá số lần cho phép ở chế độ thi nghiêm túc. Điểm bên dưới chỉ để
          tham khảo, không được công nhận là kết quả hợp lệ.
        </div>
      )}
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

      <h1 className="student-intelligence-headline student-intelligence-rise" style={{ ["--si-d" as string]: "60ms" }}>
        {headline}
      </h1>

      <div className="student-intelligence-bigscore" role="img" aria-label={`Điểm ${formatPoints(total)} trên 10`}>
        <span className="student-intelligence-bigscore-value" ref={placeholderRef} aria-hidden="true">
          {formatPoints(total)}
        </span>
        <span className="student-intelligence-bigscore-scale" aria-hidden="true">
          / 10
        </span>
      </div>

      <ul className="student-intelligence-answers">
        {answers.map((a, i) => (
          <li key={a.key} className="student-intelligence-answer student-intelligence-rise" style={{ ["--si-d" as string]: `${300 + i * 120}ms` }}>
            <span className="student-intelligence-answer-key">{a.label}</span>
            <span className="student-intelligence-answer-main">
              <MainLine text={a.main} highlight={a.highlight} />
            </span>
            <span className="student-intelligence-answer-sub">{a.sub}</span>
          </li>
        ))}
      </ul>

      <div className="student-intelligence-cta-row student-intelligence-rise" style={{ ["--si-d" as string]: "700ms" }}>
        <button type="button" className="student-intelligence-button student-intelligence-button--primary student-intelligence-button--lg" onClick={onCta}>
          {ctaLabel}
          <ArrowRightIcon />
        </button>
        <button type="button" className="student-intelligence-button student-intelligence-button--quiet-link" onClick={onPrint}>
          <PrinterIcon />
          Tải phiếu kết quả
        </button>
      </div>
    </div>
  );
}
