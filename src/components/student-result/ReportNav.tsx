import { useRef } from "react";
import { clamp, useScrollFrame } from "./scrollFrames";

/**
 * Mục lục dính bên trái (màn rộng): 4 chương + Phụ lục, vạch tiến trình đọc
 * chạy dọc theo vị trí cuộn, thông tin học sinh ở dưới.
 */
export interface ReportNavItem {
  id: string;
  label: string;
  appendix?: boolean;
}

export function ReportNav({
  items,
  activeId,
  onNavigate,
  meta,
}: {
  items: ReportNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  meta: { label: string; value: string }[];
}) {
  const progressRef = useRef<HTMLSpanElement>(null);
  useScrollFrame(() => {
    const el = progressRef.current;
    if (!el) return;
    const doc = document.documentElement;
    el.style.setProperty("--si-p", clamp(window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)).toFixed(4));
  });

  return (
    <aside className="student-intelligence-rnav" aria-label="Mục lục báo cáo">
      <span className="student-intelligence-rnav-caption">Báo cáo năng lực</span>
      <div className="student-intelligence-rnav-track">
        <span className="student-intelligence-rnav-progress" ref={progressRef} aria-hidden="true" />
        <ul className="student-intelligence-rnav-list">
          {items.map((it) => (
            <li key={it.id} className={it.appendix ? "is-appendix" : undefined}>
              <button
                type="button"
                className={`student-intelligence-rnav-link${activeId === it.id ? " is-active" : ""}`}
                aria-current={activeId === it.id ? "location" : undefined}
                onClick={() => onNavigate(it.id)}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {meta.length > 0 && (
        <dl className="student-intelligence-rnav-meta">
          {meta.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
