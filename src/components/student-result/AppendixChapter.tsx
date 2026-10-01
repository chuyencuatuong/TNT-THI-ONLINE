import type { ReactNode } from "react";

/**
 * Phụ lục — các ngăn kéo (accordion) chứa phần chi tiết. Nội dung từng ngăn
 * CHỈ được dựng khi mở lần đầu (sau đó giữ lại) — trang không phải vẽ sẵn
 * hàng chục công thức KaTeX hay biểu đồ học sinh chưa cần xem.
 * Trạng thái mở do trang giữ (để deep-link "mở câu X" mở được đúng ngăn).
 */

export interface AppendixItem {
  key: string;
  title: string;
  meta: string;
  render: () => ReactNode;
}

function Chevron() {
  return (
    <svg className="student-intelligence-chevron" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function AppendixChapter({
  items,
  open,
  mounted,
  onToggle,
}: {
  items: AppendixItem[];
  open: Set<string>;
  /** Ngăn đã từng mở (giữ nội dung đã dựng). */
  mounted: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="student-intelligence-appendix">
      <span className="student-intelligence-eyebrow">Phụ lục</span>
      <h2 className="student-intelligence-chapter-title">Hồ sơ chi tiết</h2>
      <p className="student-intelligence-lede">Mở khi cần đối chiếu. Đề và lời giải chỉ hiện khi bấm vào từng câu.</p>
      <div className="student-intelligence-acc-list">
        {items.map((it) => {
          const isOpen = open.has(it.key);
          return (
            <div key={it.key} className={`student-intelligence-acc${isOpen ? " is-open" : ""}`} id={`phu-luc-${it.key}`}>
              <button type="button" className="student-intelligence-acc-head" aria-expanded={isOpen} aria-controls={`phu-luc-body-${it.key}`} onClick={() => onToggle(it.key)}>
                <span className="student-intelligence-acc-title">{it.title}</span>
                <span className="student-intelligence-acc-meta">{it.meta}</span>
                <Chevron />
              </button>
              <div className="student-intelligence-acc-body" id={`phu-luc-body-${it.key}`}>
                <div className="student-intelligence-acc-inner">
                  <div className="student-intelligence-acc-pad">{(isOpen || mounted.has(it.key)) && it.render()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
