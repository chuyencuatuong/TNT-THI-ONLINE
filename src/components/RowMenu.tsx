import { useEffect, useRef, useState } from "react";

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  /** Thao tác xoá/huỷ — tô đỏ và đặt cuối danh sách, cách một vạch. */
  danger?: boolean;
}

/**
 * Nút "⋯" mở danh sách thao tác phụ của 1 dòng (02/10/2026). Gom các nút sửa /
 * huỷ / xoá vào đây để dòng bảng chỉ còn thao tác XEM, tránh bấm nhầm nút xoá
 * nằm sát nút xem.
 */
export function RowMenu({ items, label = "Thao tác khác" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Danh sách đặt position: fixed theo vị trí nút — nằm trong bảng có thanh
  // cuộn ngang (overflow) thì danh sách vẫn không bị cắt.
  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const width = 200;
      const below = window.innerHeight - r.bottom > 180;
      setPos({ top: below ? r.bottom + 6 : Math.max(8, r.top - 6 - 44 * items.length - 16), left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onMove = () => setOpen(false);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const safe = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  return (
    <div className="row-menu" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        className="row-menu-btn"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="15.5" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="row-menu-list" role="menu" style={pos ? { top: pos.top, left: pos.left } : undefined}>
          {safe.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
          {danger.length > 0 && safe.length > 0 && <hr />}
          {danger.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="row-menu-danger"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
