import { useEffect, useRef, useState, type RefObject } from "react";
import { useCountUp } from "./motion";
import { formatPoints } from "./resultFormat";
import { clamp, easeIn, easeInOut, easeOut, lerp, scrollMotionAllowed, useScrollFrame } from "./scrollFrames";

/**
 * Thanh trên cố định + morph điểm số (kiểu Morph của PowerPoint):
 *  - Lúc mở trang: con số lớn nằm đúng chỗ của nó ở Tóm lược (đè lên chỗ giữ
 *    chỗ `placeholderRef`), cuộn từ 0.00 lên điểm thật.
 *  - Khi cuộn 0 → 220px: con số trượt ngang ra khoảng trống bên phải trước
 *    (ease-out) rồi mới nhấc lên (ease-in) và thu nhỏ vào góc phải thanh trên,
 *    để không cắt ngang tiêu đề. Chỗ cũ để lại một vết mờ.
 *  - Nhãn chương trên thanh đổi bằng hiệu ứng trượt chữ.
 * Giảm chuyển động: con số đứng yên ở Tóm lược, thanh trên hiện điểm khi cuộn qua.
 */

const MORPH_DISTANCE = 220;

export function ReportTopBar({
  total,
  chapterLabel,
  placeholderRef,
  hostRef,
}: {
  total: number;
  chapterLabel: string;
  /** Chỗ giữ chỗ của con số lớn ở Tóm lược. */
  placeholderRef: RefObject<HTMLElement>;
  /** Phần tử gốc của trang (để đặt biến CSS --si-bar / --si-ghost). */
  hostRef: RefObject<HTMLElement>;
}) {
  const flyRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const rolled = useCountUp(total);
  const [motion] = useState(scrollMotionAllowed);

  useScrollFrame(() => {
    const fly = flyRef.current, slot = slotRef.current, ph = placeholderRef.current, host = hostRef.current;
    if (!fly || !slot || !ph || !host) return;
    const p = clamp(window.scrollY / MORPH_DISTANCE);
    if (!motion) {
      // Giảm chuyển động: không bay — số lớn đứng yên tại chỗ, thanh trên hiện điểm riêng.
      const shown = p > 0.5;
      host.style.setProperty("--si-bar", shown ? "1" : "0");
      host.style.setProperty("--si-slot", shown ? "1" : "0");
      host.style.setProperty("--si-ghost", "1");
      fly.style.visibility = "hidden";
      slot.style.visibility = shown ? "visible" : "hidden";
      return;
    }
    host.style.setProperty("--si-bar", clamp((p - 0.25) * 2).toFixed(3));
    host.style.setProperty("--si-slot", clamp((p - 0.8) * 5).toFixed(3));
    host.style.setProperty("--si-ghost", (0.09 * clamp(p * 4)).toFixed(3));
    host.style.setProperty("--si-scale-op", (1 - clamp(p * 2.5)).toFixed(3));
    const a = ph.getBoundingClientRect();
    const b = slot.getBoundingClientRect();
    if (a.height === 0) return;
    const heroFs = parseFloat(getComputedStyle(ph).fontSize) || 96;
    const slotFs = parseFloat(getComputedStyle(slot).fontSize) || 26;
    fly.style.fontSize = `${heroFs}px`;
    const x = lerp(a.left, b.left, easeOut(p));
    const y = lerp(a.top, b.top, easeIn(p));
    const s = lerp(1, slotFs / heroFs, easeInOut(p));
    fly.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(4)})`;
    fly.style.visibility = "visible";
  });

  // Nhãn chương: giữ nhãn cũ để trượt ra, nhãn mới trượt vào.
  const [labels, setLabels] = useState<{ key: number; text: string; state: "in" | "out" | "pre" }[]>([
    { key: 0, text: chapterLabel, state: "in" },
  ]);
  const keyRef = useRef(1);
  useEffect(() => {
    setLabels((prev) => {
      if (prev.some((l) => l.state !== "out" && l.text === chapterLabel)) return prev;
      const k = keyRef.current++;
      return [...prev.filter((l) => l.state !== "out").map((l) => ({ ...l, state: "out" as const })), { key: k, text: chapterLabel, state: "pre" }];
    });
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setLabels((prev) => prev.map((l) => (l.state === "pre" ? { ...l, state: "in" } : l)))),
    );
    const t = window.setTimeout(() => setLabels((prev) => prev.filter((l) => l.state !== "out")), 600);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [chapterLabel]);

  return (
    <>
      <header className="student-intelligence-topbar" aria-hidden="true">
        <div className="student-intelligence-topbar-left">
          <span className="student-intelligence-topbar-brand">Báo cáo năng lực</span>
          <span className="student-intelligence-topbar-chapter">
            {labels.map((l) => (
              <span key={l.key} className={`is-${l.state}`}>
                {l.text}
              </span>
            ))}
          </span>
        </div>
        <div className="student-intelligence-topbar-score">
          <span className="student-intelligence-topbar-slot" ref={slotRef}>
            {formatPoints(total)}
          </span>
          <span className="student-intelligence-topbar-scale">/ 10</span>
        </div>
      </header>
      <div className="student-intelligence-fly-score" ref={flyRef} aria-hidden="true">
        {formatPoints(rolled)}
      </div>
    </>
  );
}
