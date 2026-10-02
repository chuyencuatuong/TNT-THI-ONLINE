import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { PublicExamInfo, SharedResult } from "../lib/api";
import { CONTACT, ZALO_URL, copyText } from "../lib/contact";
import logoFull from "../assets/logo-full.png";

/**
 * Các khối phụ của trang landing đề công khai (02/10/2026): lời mời từ link
 * chia sẻ, Kho đề miễn phí, chân trang liên hệ. Tách khỏi PublicExamLanding.tsx
 * cho file chính gọn hơn. CSS nằm cuối PublicExamLanding.css (lớp lp-*).
 */

export type WindowStatus = "open" | "not_yet" | "closed";

export function windowStatus(exam: PublicExamInfo | null, now: number): WindowStatus {
  if (!exam) return "open";
  if (exam.assigned_unlock_at && now < new Date(exam.assigned_unlock_at).getTime()) return "not_yet";
  if (exam.assigned_lock_at && now > new Date(exam.assigned_lock_at).getTime()) return "closed";
  return "open";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function examParts(exam: PublicExamInfo) {
  return ["1", "2", "3"]
    .map((k) => ({ key: k, count: exam.part_counts?.[k] ?? 0 }))
    .filter((p) => p.count > 0);
}

export function examMeta(exam: PublicExamInfo | null): string {
  if (!exam) return "Miễn phí · không cần tài khoản";
  const total = examParts(exam).reduce((s, p) => s + p.count, 0);
  return exam.duration_minutes ? `${total} câu · ${exam.duration_minutes} phút` : `${total} câu · không giới hạn giờ`;
}

const STATUS_ORDER: Record<WindowStatus, number> = { open: 0, not_yet: 1, closed: 2 };

/** Đang mở trước, sắp mở sau, đã đóng cuối; cùng nhóm thì giữ thứ tự mới nhất trước. */
export function sortLibrary(list: PublicExamInfo[], now: number): PublicExamInfo[] {
  return list
    .map((e, i) => ({ e, i, s: windowStatus(e, now) }))
    .sort((a, b) => STATUS_ORDER[a.s] - STATUS_ORDER[b.s] || a.i - b.i)
    .map((x) => x.e);
}

function statusLabel(exam: PublicExamInfo, s: WindowStatus): string {
  if (s === "not_yet") return `Mở lúc ${formatDateTime(exam.assigned_unlock_at!)}`;
  if (s === "closed") return "Đã đóng";
  return "Đang mở";
}

const formatScore = (n: number) => n.toFixed(2).replace(".", ",");

// ---------------------------------------------------------------------------
// Lời mời từ link chia sẻ (?ref=)
// ---------------------------------------------------------------------------
export function InviteBanner({ shared }: { shared: SharedResult }) {
  const initial = shared.given_name.charAt(0).toUpperCase();
  return (
    <div className="lp-invite lp-rise" role="note">
      <span className="lp-invite-avatar" aria-hidden="true">
        {initial}
      </span>
      <div>
        <b>
          {shared.show_score && shared.total_score !== null
            ? `${shared.given_name} vừa làm đề này: ${formatScore(shared.total_score)} điểm.`
            : `${shared.given_name} vừa làm đề này và rủ em làm thử.`}
        </b>
        <span>Em làm thử xem được bao nhiêu, rồi so báo cáo với bạn.</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kho đề miễn phí
// ---------------------------------------------------------------------------
const INITIAL_VISIBLE = 6;

export function ExamLibrarySection({
  list,
  currentSlug,
  source,
}: {
  list: PublicExamInfo[];
  currentSlug: string | null;
  source: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const now = Date.now();
  const sorted = sortLibrary(list, now);
  const others = sorted.filter((e) => e.slug !== currentSlug);
  const current = sorted.find((e) => e.slug === currentSlug) ?? null;
  const ordered = current ? [current, ...others] : others;
  const visible = expanded ? ordered : ordered.slice(0, INITIAL_VISIBLE);
  const openCount = sorted.filter((e) => windowStatus(e, now) === "open").length;
  const linkSrc = source === "link" ? "kho-de" : source;

  return (
    <section className="lp-section lp-library" id="kho-de" aria-labelledby="lpLibTitle">
      <div className="lp-wrap">
        <div className="lp-library-head">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Kho đề miễn phí</span>
            <h2 className="lp-h2" id="lpLibTitle">
              {sorted.length > 0 ? (
                <>
                  {openCount} đề đang mở.
                  <br />
                  <em>Đề nào cũng có báo cáo.</em>
                </>
              ) : (
                <>
                  Kho đề đang được chuẩn bị.
                  <br />
                  <em>Đề mới lên Fanpage trước.</em>
                </>
              )}
            </h2>
            <p className="lp-lede">
              Đề giữa kỳ, cuối kỳ và khảo sát chương. Làm không cần tài khoản; muốn gộp nhiều đề thành một hồ sơ thì lưu
              lại sau khi nộp.
            </p>
          </div>
          <a className="lp-btn lp-btn-sm" href={CONTACT.fanpageUrl} target="_blank" rel="noopener noreferrer">
            Theo dõi Fanpage nhận đề mới
          </a>
        </div>

        {ordered.length > 0 && (
          <ul className="lp-library-grid">
            {visible.map((e) => {
              const s = windowStatus(e, now);
              const parts = examParts(e);
              const isCurrent = e.slug === currentSlug;
              return (
                <li key={e.id}>
                  <Link
                    className={`lp-lib-card${isCurrent ? " lp-is-current" : ""}${s === "closed" ? " lp-is-closed" : ""}`}
                    to={`/thi?de=${encodeURIComponent(e.slug)}&src=${encodeURIComponent(linkSrc)}`}
                    aria-current={isCurrent ? "page" : undefined}
                  >
                    <span className={`lp-lib-status lp-st-${s}`}>{isCurrent ? "Đang xem" : statusLabel(e, s)}</span>
                    <b className="lp-lib-title">{e.title}</b>
                    <span className="lp-lib-meta">
                      {examMeta(e)}
                      {e.grade ? ` · Toán ${e.grade}` : ""}
                    </span>
                    <span className="lp-lib-bar" aria-hidden="true">
                      {parts.map((p) => (
                        <i key={p.key} style={{ flex: p.count }} />
                      ))}
                    </span>
                    <span className="lp-lib-foot">
                      <span>{e.submitted_count >= 10 ? `${e.submitted_count} lượt đã nộp` : "Miễn phí"}</span>
                      <span className="lp-lib-go">
                        {isCurrent ? "Đề này" : "Xem đề"}
                        <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M3 8h10M9 4l4 4-4 4" />
                        </svg>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {ordered.length > INITIAL_VISIBLE && (
          <div className="lp-library-more">
            <button className="lp-btn lp-btn-sm" type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? "Thu gọn" : `Xem thêm ${ordered.length - INITIAL_VISIBLE} đề`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Chân trang + liên hệ
// ---------------------------------------------------------------------------
function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const ICON = {
  fb: <path d="M10 2.5H8.6A2.6 2.6 0 0 0 6 5.1v1.6H4.5v2.4H6v4.4h2.4V9.1h1.7l.4-2.4H8.4V5.4c0-.4.3-.7.7-.7H10z" />,
  phone: <path d="M5 2.5 3.2 3a1 1 0 0 0-.7 1.1A10.6 10.6 0 0 0 11.9 13.5a1 1 0 0 0 1.1-.7l.5-1.8-2.6-1.3-1.2 1.2a7.5 7.5 0 0 1-3.7-3.7l1.2-1.2z" />,
  mail: (
    <>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="m2.5 4.5 5.5 4 5.5-4" />
    </>
  ),
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V3.5A1 1 0 0 0 9.5 2.5h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
    </>
  ),
  chat: <path d="M3 3.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" />,
};

function Icon({ d }: { d: keyof typeof ICON }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[d]}
    </svg>
  );
}

/** Bấm số điện thoại: mở bảng nhỏ "Sao chép số / Nhắn Zalo / Gọi". */
function PhoneContact() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const close = () => setOpen(false);
  const ref = useOutsideClose(open, close);

  async function copy() {
    const done = await copyText(CONTACT.phone);
    setCopied(done ? "ok" : "fail");
  }

  return (
    <div className="lp-contact-pop" ref={ref}>
      <button
        type="button"
        className="lp-contact-row"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setOpen((v) => !v);
          setCopied(null);
        }}
      >
        <Icon d="phone" />
        <span>
          <small>Điện thoại · Zalo</small>
          <b>{CONTACT.phoneDisplay}</b>
        </span>
      </button>
      {open && (
        <div className="lp-contact-menu" role="menu">
          <button type="button" role="menuitem" onClick={copy}>
            <Icon d="copy" />
            Sao chép số
          </button>
          <a role="menuitem" href={ZALO_URL} target="_blank" rel="noopener noreferrer" onClick={close}>
            <Icon d="chat" />
            Nhắn Zalo
          </a>
          <a role="menuitem" href={`tel:${CONTACT.phone}`} onClick={close}>
            <Icon d="phone" />
            Gọi điện
          </a>
          <p className="lp-contact-note" role="status">
            {copied === "ok"
              ? "Đã chép số. Mở Zalo, dán vào ô tìm kiếm để nhắn thầy."
              : copied === "fail"
                ? `Máy chưa cho chép tự động. Em giữ ngón tay lên số ${CONTACT.phoneDisplay} để chép nhé.`
                : "Sao chép rồi dán vào Zalo để nhắn thầy."}
          </p>
        </div>
      )}
    </div>
  );
}

function EmailContact() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="lp-contact-row lp-contact-row--split">
      <a href={`mailto:${CONTACT.email}`}>
        <Icon d="mail" />
        <span>
          <small>Email</small>
          <b>{CONTACT.email}</b>
        </span>
      </a>
      <button
        type="button"
        className="lp-contact-copy"
        onClick={async () => setCopied(await copyText(CONTACT.email))}
        aria-label="Sao chép email"
        title="Sao chép email"
      >
        {copied ? "Đã chép" : <Icon d="copy" />}
      </button>
    </div>
  );
}

export function LandingFooter({ currentExam, source }: { currentExam: PublicExamInfo | null; source: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="lp-footer">
      <div className="lp-wrap">
        <div className="lp-foot-grid">
          <div className="lp-foot-brand">
            <img src={logoFull} alt="Toán học TNT" width={96} height={90} loading="lazy" />
            <p>
              <b>{CONTACT.brand}</b>
              <span>{CONTACT.tagline}. Mỗi bài làm là một bản báo cáo: em mất điểm ở đâu, vì sao, và làm gì tiếp.</span>
            </p>
          </div>
          <nav className="lp-foot-col" aria-label="Kho đề">
            <h3>Làm đề</h3>
            <Link to={`/thi?src=${encodeURIComponent(source === "link" ? "chan-trang" : source)}#kho-de`}>Kho đề miễn phí</Link>
            {currentExam && <a href="#lpTop">Đề đang xem</a>}
            <a href="#hoi-dap">Hỏi đáp</a>
            <Link to="/dang-nhap">Đăng nhập tài khoản</Link>
          </nav>
          <div className="lp-foot-col lp-foot-contact">
            <h3>Liên hệ thầy Tường</h3>
            <a className="lp-contact-row" href={CONTACT.fanpageUrl} target="_blank" rel="noopener noreferrer">
              <Icon d="fb" />
              <span>
                <small>Fanpage</small>
                <b>{CONTACT.brand}</b>
              </span>
            </a>
            {CONTACT.personalFacebookUrl && (
              <a className="lp-contact-row" href={CONTACT.personalFacebookUrl} target="_blank" rel="noopener noreferrer">
                <Icon d="fb" />
                <span>
                  <small>Facebook cá nhân</small>
                  <b>{CONTACT.owner}</b>
                </span>
              </a>
            )}
            <PhoneContact />
            <EmailContact />
          </div>
        </div>
        <div className="lp-foot-bottom">
          <p>
            <b>{CONTACT.brand}</b>
            <span>
              © {year} · Bản quyền thuộc về {CONTACT.brand} ({CONTACT.owner})
            </span>
          </p>
          <span className="lp-foot-note">Các hình mẫu trên trang dùng dữ liệu minh họa, không phải bài làm của em.</span>
        </div>
      </div>
    </footer>
  );
}
