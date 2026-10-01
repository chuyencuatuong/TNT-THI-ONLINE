import { ArrowRightIcon } from "./icons";

/**
 * Thanh hành động dính đáy màn hình (< 960px). Từ bản báo cáo 4 chương
 * (01/10/2026) điểm số đã nằm trên thanh trên, nên `scoreText` có thể bỏ trống
 * — khi đó nút hành động chiếm cả thanh.
 * Hiển thị/ẩn hoàn toàn bằng CSS (media query) — component luôn render để
 * không phụ thuộc JS đo kích thước màn hình.
 */
export function MobileActionBar({
  scoreText,
  ctaLabel,
  onCta,
}: {
  scoreText?: string | null;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div
      className={`student-intelligence-actionbar${scoreText ? "" : " student-intelligence-actionbar--cta-only"}`}
      role="region"
      aria-label="Thao tác nhanh"
    >
      {scoreText && (
        <div className="student-intelligence-actionbar-score">
          <span className="student-intelligence-actionbar-label">Điểm</span>
          <span className="student-intelligence-actionbar-value">{scoreText}</span>
        </div>
      )}
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
