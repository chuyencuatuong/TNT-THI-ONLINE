import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./useScrollSpy";

/**
 * Bộ lập lịch khung hình theo cuộn dùng chung cho các hiệu ứng "kéo tới đâu
 * chạy tới đó" (morph điểm số, xếp lớp, parallax, 14 ô điểm rơi, chuyển cảnh).
 * Chỉ 1 listener scroll + 1 requestAnimationFrame cho cả trang, mọi hiệu ứng
 * đăng ký vào đây — tránh mỗi component tự gắn listener riêng.
 * Hiệu ứng chỉ đổi transform / opacity / clip-path trực tiếp trên DOM (không
 * setState) để không làm React render lại mỗi khung hình.
 */

type FrameFn = () => void;
const subscribers = new Set<FrameFn>();
let scheduled = false;
let attached = false;

function runAll() {
  scheduled = false;
  subscribers.forEach((fn) => fn());
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(runAll);
}

function attach() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
}

/** Yêu cầu chạy lại mọi hiệu ứng ở khung hình kế tiếp (sau khi bố cục đổi). */
export function requestScrollFrame() {
  schedule();
}

/** Đăng ký 1 hàm chạy mỗi khung hình khi cuộn/đổi kích thước (và 1 lần ngay khi gắn). */
export function useScrollFrame(fn: FrameFn, enabled = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    attach();
    const wrapped = () => ref.current();
    subscribers.add(wrapped);
    schedule();
    return () => {
      subscribers.delete(wrapped);
    };
  }, [enabled]);
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t: number) => t * t * t;

/** Hiệu ứng theo cuộn có được chạy liên tục không (tắt khi "giảm chuyển động"). */
export function scrollMotionAllowed(): boolean {
  return !prefersReducedMotion();
}

/** Màn rộng (>= 960px) — nơi dùng hình đứng yên + parallax. */
export function isWideViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 960;
}
