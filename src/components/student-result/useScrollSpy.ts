import { useCallback, useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Cuộn mượt tới 1 phân mục và chuyển focus bàn phím vào đó (cho người dùng
 * trình đọc màn hình). Tự dùng cuộn tức thì nếu hệ điều hành bật "giảm chuyển động". */
export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  el.focus({ preventScroll: true });
}

/**
 * Scrollspy: trả về id phân mục đang đọc. Quy tắc: phân mục cuối cùng có mép
 * trên đã vượt qua đường ngắm (mặc định 30% chiều cao màn hình tính từ trên);
 * chạm đáy trang thì chọn phân mục cuối (phân mục cuối thường ngắn, không bao
 * giờ tự chạm đường ngắm). Đo bằng getBoundingClientRect trong
 * requestAnimationFrame — rẻ, không cần IntersectionObserver cho 8 phần tử.
 *
 * `pin(id)` dùng khi người dùng bấm mục lục: đánh dấu ngay mục đích tới và
 * tạm khoá cập nhật trong lúc cuộn mượt, tránh mục lục "nhảy" qua các mục
 * trung gian.
 */
export function useScrollSpy(ids: string[], options: { offsetRatio?: number; enabled?: boolean } = {}) {
  const { offsetRatio = 0.3, enabled = true } = options;
  const [activeId, setActiveId] = useState<string>(ids[0] ?? "");
  const lockUntil = useRef(0);
  const key = ids.join("|");

  useEffect(() => {
    if (!enabled || ids.length === 0) return;
    let frame = 0;

    const compute = () => {
      frame = 0;
      if (Date.now() < lockUntil.current) return;
      const line = window.innerHeight * offsetRatio;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - line <= 0) current = id;
      }
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) current = ids[ids.length - 1];
      setActiveId((prev) => (prev === current ? prev : current));
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Khi hết khoá (cuộn mượt đã xong) chạy lại 1 lần cho chắc chắn đúng vị trí.
    const interval = window.setInterval(() => {
      if (lockUntil.current !== 0 && Date.now() >= lockUntil.current) {
        lockUntil.current = 0;
        schedule();
      }
    }, 250);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.clearInterval(interval);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, offsetRatio]);

  const pin = useCallback((id: string, durationMs = 900) => {
    lockUntil.current = Date.now() + (prefersReducedMotion() ? 0 : durationMs);
    setActiveId(id);
  }, []);

  return { activeId, pin };
}
