import { useRef } from "react";
import { Link } from "react-router-dom";
import type { ReportAction } from "../../lib/resultReport";
import { ArrowRightIcon } from "./icons";
import { useInView } from "./motion";
import { formatPoints } from "./resultFormat";
import { clamp, isWideViewport, scrollMotionAllowed, useScrollFrame } from "./scrollFrames";

/**
 * Chương 3 — Hành động: tối đa 3 việc (buildActions trong lib/resultReport.ts),
 * xếp theo số điểm gỡ lại được. Việc có danh sách câu thì nút mở thẳng các câu
 * đó ở Phụ lục; việc còn lại là liên kết tới Hồ sơ năng lực / Ôn tập câu sai.
 * Số thứ tự 01–03 trôi chậm hơn nội dung (parallax nhẹ, chỉ màn rộng).
 */
export function ActionChapter({
  actions,
  onOpenQuestions,
  lockedLink,
  readOnlyNote,
}: {
  actions: ReportAction[];
  onOpenQuestions: (questionIds: string[]) => void;
  /** Khách (chưa có tài khoản): việc dẫn sang trang học sinh được thay bằng
   * nút này (vd "Lưu hồ sơ để mở"), vì các trang đó cần tài khoản. */
  lockedLink?: { label: string; onClick: () => void };
  /** Giáo viên xem báo cáo của học sinh: việc dẫn sang trang học sinh chỉ hiện
   * thành ghi chú (giáo viên không mở trang của học sinh được). */
  readOnlyNote?: string;
}) {
  const hostRef = useRef<HTMLOListElement>(null);
  const [listRef, inView] = useInView<HTMLDivElement>();

  useScrollFrame(() => {
    const host = hostRef.current;
    if (!host) return;
    const idx = host.querySelectorAll<HTMLElement>(".student-intelligence-action-idx");
    if (!isWideViewport() || !scrollMotionAllowed()) {
      idx.forEach((el) => (el.style.transform = ""));
      return;
    }
    const rect = host.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = clamp((vh - rect.top) / (vh + rect.height));
    idx.forEach((el, i) => (el.style.transform = `translateY(${((0.5 - p) * (50 + i * 16)).toFixed(1)}px)`));
  });

  return (
    <div ref={listRef} className={`student-intelligence-actions-wrap${inView ? " is-inview" : ""}`}>
      <span className="student-intelligence-eyebrow">Chương 3 · Hành động</span>
      <h2 className="student-intelligence-chapter-title">Kế hoạch {actions.length} bước</h2>
      <ol className="student-intelligence-actions" ref={hostRef}>
        {actions.map((a, i) => (
          <li key={a.key} className="student-intelligence-action" style={{ ["--si-delay" as string]: `${i * 120}ms` }}>
            <span className="student-intelligence-action-idx" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="student-intelligence-action-title">{a.title}</h3>
            <span className="student-intelligence-action-time">
              khoảng {a.minutes} phút{a.minutesNote ? ` ${a.minutesNote}` : ""}
              {a.gain !== null && ` · gỡ tới ${formatPoints(a.gain)} điểm`}
            </span>
            <p className="student-intelligence-action-body">{a.body}</p>
            <div className="student-intelligence-action-cta">
              {a.kind === "questions" ? (
                <button
                  type="button"
                  className={`student-intelligence-button${i === 0 ? " student-intelligence-button--primary" : ""}`}
                  onClick={() => onOpenQuestions(a.questionIds ?? [])}
                >
                  {a.ctaLabel}
                  <ArrowRightIcon />
                </button>
              ) : readOnlyNote ? (
                <span className="student-intelligence-action-note">{readOnlyNote}</span>
              ) : lockedLink ? (
                <button
                  type="button"
                  className={`student-intelligence-button${i === 0 ? " student-intelligence-button--primary" : ""}`}
                  onClick={lockedLink.onClick}
                >
                  {lockedLink.label}
                  <ArrowRightIcon />
                </button>
              ) : (
                <Link className={`student-intelligence-button${i === 0 ? " student-intelligence-button--primary" : ""}`} to={a.to ?? "/hoc-sinh"}>
                  {a.ctaLabel}
                  <ArrowRightIcon />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
