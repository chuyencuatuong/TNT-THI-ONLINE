import type { CSSProperties } from "react";
import type { ResultSectionMeta } from "./resultSections";

export function ArrowRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/**
 * Mục lục dính cột trái (desktop >= 960px): số thứ tự 01-08, vạch chỉ báo
 * trượt theo phân mục đang đọc (scrollspy), khối thông tin học sinh và nút
 * hành động chính. Ẩn hoàn toàn trên màn hình hẹp — thay bằng thanh hành
 * động dưới đáy (MobileActionBar).
 */
export function ResultNav({
  sections,
  activeId,
  onNavigate,
  meta,
  cta,
}: {
  sections: ResultSectionMeta[];
  activeId: string;
  onNavigate: (id: string) => void;
  meta: { label: string; value: string }[];
  cta: { label: string; onClick: () => void } | null;
}) {
  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === activeId),
  );
  return (
    <aside className="student-intelligence-nav" aria-label="Mục lục phân tích">
      <p className="student-intelligence-nav-caption">Mục lục phân tích</p>
      <div
        className="student-intelligence-nav-track"
        style={{ "--si-active-index": activeIndex } as CSSProperties}
      >
        <span className="student-intelligence-nav-indicator" aria-hidden="true" />
        <ol className="student-intelligence-nav-list">
        {sections.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`student-intelligence-nav-link${active ? " is-active" : ""}`}
                aria-current={active ? "location" : undefined}
                onClick={() => onNavigate(s.id)}
                title={s.title}
              >
                <span className="student-intelligence-nav-index">{s.index}</span>
                <span>{s.navLabel}</span>
              </button>
            </li>
          );
        })}
        </ol>
      </div>

      {(meta.length > 0 || cta) && (
        <div className="student-intelligence-nav-meta">
          {meta.map((m) => (
            <div key={m.label} className="student-intelligence-nav-meta-row">
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          ))}
          {cta && (
            <button
              type="button"
              className="student-intelligence-button student-intelligence-button--primary"
              style={{ marginTop: 8, width: "100%" }}
              onClick={cta.onClick}
            >
              {cta.label}
              <ArrowRightIcon />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
