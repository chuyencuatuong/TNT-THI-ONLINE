import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ResultSectionMeta } from "./resultSections";

/**
 * Khung 1 phân mục: nhãn "Phân mục 0x" + tiêu đề + dòng dẫn, hiện dần
 * khi cuộn tới (chỉ 1 lần). tabIndex=-1 để mục lục chuyển được focus bàn phím
 * vào đây sau khi cuộn (xem scrollToSection).
 */
export function ResultSection({
  meta,
  lede,
  children,
}: {
  meta: ResultSectionMeta;
  /** Ghi đè dòng dẫn mặc định trong resultSections.ts (vd khi có số liệu cụ thể). */
  lede?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.02 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const titleId = `${meta.id}-title`;
  return (
    <section
      id={meta.id}
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className={`student-intelligence-section student-intelligence-reveal${revealed ? " is-revealed" : ""}`}
    >
      <header className="student-intelligence-section-head">
        <span className="student-intelligence-eyebrow">Phân mục {meta.index}</span>
        <h2 id={titleId} className="student-intelligence-title">
          {meta.title}
        </h2>
        <p className="student-intelligence-lede">{lede ?? meta.lede}</p>
      </header>
      <div className="student-intelligence-section-body">{children}</div>
    </section>
  );
}
