import { useEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "./useScrollSpy";

/**
 * Trả true (một lần, không đảo lại) khi phần tử đi vào khung nhìn — dùng để
 * kích hoạt các thanh đo "mở rộng từ 0" đúng lúc học sinh cuộn tới.
 * Trình duyệt không có IntersectionObserver: trả true ngay, nội dung hiện đủ.
 */
export function useInView<T extends Element>(
  options: { threshold?: number; rootMargin?: string } = {},
): [RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const { threshold = 0.25, rootMargin = "0px 0px -8% 0px" } = options;

  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold, rootMargin]);

  return [ref, inView];
}

/** Đường cong giảm tốc mạnh ở cuối — con số "trôi" rồi đậu nhẹ vào giá trị thật. */
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Bộ đếm cuộn số (counter roll) từ 0 lên `target` trong `durationMs`.
 * Tôn trọng "giảm chuyển động" của hệ điều hành: nhảy thẳng tới giá trị cuối.
 * `start = false` để hoãn tới khi phần tử vào khung nhìn.
 */
export function useCountUp(target: number, { durationMs = 1400, start = true } = {}): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (!start) return;
    if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      setValue(target * easeOutExpo(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);

  return value;
}
