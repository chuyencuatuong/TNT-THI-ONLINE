import { ArrowRightIcon } from "./ResultNav";

/**
 * Thanh hành động dính đáy màn hình (< 960px): [ Điểm: X/10 | Ôn lại Y câu sai → ].
 * Hiển thị/ẩn hoàn toàn bằng CSS (media query) — component luôn render để
 * không phụ thuộc JS đo kích thước màn hình.
 */
export function MobileActionBar({
  scoreText,
  ctaLabel,
  onCta,
}: {
  scoreText: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div className="student-intelligence-actionbar" role="region" aria-label="Thao tác nhanh">
      <div className="student-intelligence-actionbar-score">
        <span className="student-intelligence-actionbar-label">Điểm</span>
        <span className="student-intelligence-actionbar-value">{scoreText}</span>
      </div>
      <button
        type="button"
        className="student-intelligence-button student-intelligence-button--primary"
        onClick={onCta}
      >
        {ctaLabel}
        <ArrowRightIcon />
      </button>
    </div>
  );
}
