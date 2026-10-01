import { useRef, type RefObject } from "react";
import { clamp, easeInOut, lerp, scrollMotionAllowed, useScrollFrame } from "./scrollFrames";

/**
 * Chuyển cảnh Chẩn đoán → Hành động (morph "thẻ nhỏ bung thành toàn màn hình"):
 * một thẻ "Tiếp theo" nằm giữa màn hình; kéo xuống thì nền đỏ đô bung từ đúng
 * khung thẻ ra toàn màn hình (bo góc 20 → 0), chữ trong thẻ mờ đi và tiêu đề
 * chương Hành động hiện lên. Sau đó tấm Hành động trượt lên trên nền này (chỗ
 * xếp lớp thứ 2 của trang). Nền mờ dần khi Phụ lục tới.
 * Giảm chuyển động: nền hiện/ẩn dứt khoát, không bung từ từ.
 */
export function ChapterTransition({
  cardKicker,
  cardTitle,
  cardSub,
  stageKicker,
  stageTitle,
  stageSub,
  fadeOutRef,
}: {
  cardKicker: string;
  cardTitle: string;
  cardSub: string;
  stageKicker: string;
  stageTitle: string;
  stageSub: string;
  /** Phần tử mà khi nó tới gần thì nền chuyển cảnh mờ dần (Phụ lục). */
  fadeOutRef: RefObject<HTMLElement>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const aRef = useRef<HTMLDivElement>(null);
  const bRef = useRef<HTMLDivElement>(null);

  useScrollFrame(() => {
    const wrap = wrapRef.current, card = cardRef.current, bg = bgRef.current;
    const surf = surfaceRef.current, A = aRef.current, B = bRef.current;
    if (!wrap || !card || !bg || !surf || !A || !B) return;
    const vh = window.innerHeight, vw = window.innerWidth;
    const wr = wrap.getBoundingClientRect();
    const fadeEl = fadeOutRef.current;
    const fade = fadeEl ? clamp((fadeEl.getBoundingClientRect().top - vh * 0.35) / (vh * 0.5)) : 1;
    if (wr.top > vh || fade <= 0.001) {
      bg.style.visibility = "hidden";
      return;
    }
    bg.style.visibility = "visible";
    let p = clamp(-wr.top / Math.max(1, wr.height - vh));
    if (!scrollMotionAllowed()) p = p > 0.4 ? 1 : 0;
    const e = easeInOut(p);
    const c = card.getBoundingClientRect();
    const t = lerp(c.top + 1, 0, e), l = lerp(c.left + 1, 0, e);
    const r = lerp(vw - c.right + 1, 0, e), b = lerp(vh - c.bottom + 1, 0, e);
    bg.style.clipPath = `inset(${t.toFixed(1)}px ${r.toFixed(1)}px ${b.toFixed(1)}px ${l.toFixed(1)}px round ${lerp(19, 0, e).toFixed(1)}px)`;
    bg.style.opacity = fade.toFixed(3);
    surf.style.opacity = (1 - clamp(p * 2.8)).toFixed(3);
    A.style.left = `${c.left}px`;
    A.style.top = `${c.top}px`;
    A.style.width = `${c.width}px`;
    A.style.opacity = (1 - clamp(p * 4)).toFixed(3);
    const ob = clamp((p - 0.35) * 2.2);
    B.style.opacity = ob.toFixed(3);
    B.style.transform = `translateY(${((1 - ob) * 18).toFixed(1)}px) scale(${(0.96 + ob * 0.04).toFixed(3)})`;
  });

  return (
    <div className="student-intelligence-transition" ref={wrapRef} aria-hidden="true">
      <div className="student-intelligence-transition-sticky">
        <div className="student-intelligence-transition-card" ref={cardRef} />
      </div>
      <div className="student-intelligence-transition-bg" ref={bgRef}>
        <div className="student-intelligence-transition-surface" ref={surfaceRef} />
        <div className="student-intelligence-transition-a" ref={aRef}>
          <span className="k">{cardKicker}</span>
          <span className="t">{cardTitle}</span>
          <span className="s">{cardSub}</span>
        </div>
        <div className="student-intelligence-transition-b" ref={bRef}>
          <span className="k">{stageKicker}</span>
          <p className="t">{stageTitle}</p>
          <span className="s">{stageSub}</span>
        </div>
      </div>
    </div>
  );
}
