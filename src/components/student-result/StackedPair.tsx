import { useRef, type ReactNode } from "react";
import { clamp, requestScrollFrame, scrollMotionAllowed, useScrollFrame } from "./scrollFrames";

/**
 * Xếp lớp 2 tấm (layer stacking) — CHỈ dùng ở vài chỗ chọn lọc (đã chốt
 * 01/10/2026: không áp cho toàn trang vì rối mắt). Tấm dưới đứng yên (sticky),
 * tấm trên trượt lên đè; tấm dưới lùi sâu (thu 5% + phủ mờ) theo mức bị che.
 * Phạm vi sticky giới hạn trong khung của cặp này, nên sau đó trang cuộn bình
 * thường — tấm dưới không "dính" theo suốt trang.
 */
export function StackedPair({
  under,
  over,
  underId,
  overId,
  underLabel,
  overLabel,
}: {
  under: ReactNode;
  over: ReactNode;
  underId: string;
  overId: string;
  underLabel: string;
  overLabel: string;
}) {
  const underRef = useRef<HTMLElement>(null);
  const overRef = useRef<HTMLElement>(null);

  useScrollFrame(() => {
    const u = underRef.current, o = overRef.current;
    if (!u || !o) return;
    const vh = window.innerHeight;
    // Tấm trên tối thiểu cao bằng tấm dưới để khi cặp cuộn đi, tấm dưới không ló ra.
    const minH = `${u.offsetHeight}px`;
    if (o.style.minHeight !== minH) {
      o.style.minHeight = minH;
      requestScrollFrame();
    }
    // Tấm dưới cao hơn màn hình (điện thoại, có thêm ghi chú) thì dính khi MÉP DƯỚI chạm đáy màn hình.
    const base = window.innerWidth >= 960 ? 72 : 62;
    // Chừa chỗ cho thanh hành động dính đáy (điện thoại) để nút ở cuối Tóm lược không bị che.
    const bar = document.querySelector<HTMLElement>(".student-intelligence-actionbar");
    const barH = bar && bar.offsetParent !== null ? bar.offsetHeight : 0;
    const stickTop = Math.min(base, vh - barH - u.offsetHeight - 16);
    const topPx = `${stickTop}px`;
    if (u.style.top !== topPx) u.style.top = topPx;
    const top = o.getBoundingClientRect().top;
    const cover = scrollMotionAllowed() ? clamp((vh - top) / Math.max(1, vh - stickTop)) : 0;
    u.style.setProperty("--si-cover", cover.toFixed(3));
    u.classList.toggle("is-covered", cover > 0.001);
  });

  return (
    <div className="student-intelligence-stack">
      <section className="student-intelligence-sheet student-intelligence-sheet--under" ref={underRef} id={underId} aria-label={underLabel} tabIndex={-1}>
        {under}
      </section>
      <section className="student-intelligence-sheet student-intelligence-sheet--over" ref={overRef} id={overId} aria-label={overLabel} tabIndex={-1}>
        {over}
      </section>
    </div>
  );
}
