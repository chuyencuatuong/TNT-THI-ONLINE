/**
 * Phần chuyển động / biểu đồ của trang landing đề công khai
 * (PublicExamLanding.tsx). Port từ demo-landing-thi.html — viết dạng thao
 * tác DOM trực tiếp (giống scrollFrames.ts của trang kết quả): 1 bộ lập lịch
 * requestAnimationFrame cho mọi hiệu ứng theo cuộn, chỉ đổi transform /
 * opacity / clip-path, không setState mỗi khung hình.
 *
 * Mọi số liệu ở đây là DỮ LIỆU MINH HỌA (khớp mock của trang Báo cáo), trang
 * đã gắn nhãn "Dữ liệu minh họa". Riêng tờ bài làm ở hero dùng đúng SỐ CÂU
 * của đề thật (truyền vào qua `total`), trạng thái từng ô vẫn là minh họa.
 *
 * Trả về hàm dọn dẹp (gỡ listener, timer, observer) — gọi khi rời trang.
 */

type QState = "ok" | "part" | "bad" | "blank";
interface MockQ {
  n: number;
  part: 1 | 2 | 3;
  tier: number;
  lesson: number;
  score: number;
  max: number;
  t: number;
  s: QState;
}

const PART_NORM: Record<1 | 2 | 3, number> = { 1: 90, 2: 300, 3: 360 };
const TIERS = ["Nhận biết", "Thông hiểu", "Vận dụng", "Vận dụng cao"];
const LESSONS = ["Bài 1 · Đơn điệu, cực trị", "Bài 2 · GTLN, GTNN", "Bài 3 · Tiệm cận", "Bài 4 · Khảo sát, vẽ đồ thị"];
// [số câu, phần, tầng, bài, điểm, tối đa, giây, trạng thái]
const RAW: [number, 1 | 2 | 3, number, number, number, number, number, QState][] = [
  [1, 1, 0, 0, 0.25, 0.25, 60, "ok"], [2, 1, 0, 0, 0.25, 0.25, 75, "ok"], [3, 1, 1, 0, 0, 0.25, 110, "bad"], [4, 1, 0, 2, 0.25, 0.25, 80, "ok"],
  [5, 1, 0, 2, 0.25, 0.25, 95, "ok"], [6, 1, 1, 0, 0, 0.25, 150, "bad"], [7, 1, 0, 1, 0.25, 0.25, 85, "ok"], [8, 1, 1, 2, 0, 0.25, 30, "bad"],
  [9, 1, 0, 1, 0.25, 0.25, 100, "ok"], [10, 1, 1, 1, 0, 0.25, 170, "bad"], [11, 1, 1, 3, 0.25, 0.25, 160, "ok"], [12, 1, 1, 0, 0, 0.25, 200, "bad"],
  [13, 2, 1, 0, 1, 1, 260, "ok"], [14, 2, 1, 2, 1, 1, 330, "ok"], [15, 2, 2, 1, 1, 1, 380, "ok"], [16, 2, 2, 0, 0.25, 1, 800, "part"],
  [17, 3, 2, 0, 0.5, 0.5, 480, "ok"], [18, 3, 2, 1, 0.5, 0.5, 420, "ok"], [19, 3, 3, 1, 0.5, 0.5, 520, "ok"], [20, 3, 3, 1, 0, 0.5, 720, "bad"],
  [21, 3, 3, 2, 0, 0.5, 0, "blank"], [22, 3, 3, 2, 0, 0.5, 0, "blank"],
];
const Q: MockQ[] = RAW.map((r) => ({ n: r[0], part: r[1], tier: r[2], lesson: r[3], score: r[4], max: r[5], t: r[6], s: r[7] }));
const STATE_TXT: Record<QState, string> = { ok: "Trọn điểm", part: "Đúng một phần", bad: "Mất điểm", blank: "Bỏ trống (chưa kịp mở)" };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fmt = (n: number) => n.toFixed(2);
const mmss = (s: number) => {
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m + ":" + (r < 10 ? "0" : "") + r;
};

interface Box { x: number; y: number; w: number; h: number; }

export function setupLandingMotion(root: HTMLElement, opts: { total: number }): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T & Element>(sel) as T | null;
  const $$ = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll(sel)) as T[];
  const cleanups: (() => void)[] = [];
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const clearTimers = () => { timers.forEach((id) => window.clearTimeout(id)); timers.clear(); };

  /* ---------------------------------------------------------- bộ lập lịch khung hình */
  const subs: (() => void)[] = [];
  const layoutFns: (() => void)[] = [];
  let queued = false;
  let raf = 0;
  const frame = () => { queued = false; subs.forEach((f) => f()); };
  const schedule = () => { if (!queued) { queued = true; raf = requestAnimationFrame(frame); } };
  const relayout = () => layoutFns.forEach((f) => f());
  const onResize = () => { relayout(); schedule(); };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize);
  cleanups.push(() => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(raf);
  });
  const observers: IntersectionObserver[] = [];
  function inView(el: Element | null, cb: () => void, threshold = 0.3) {
    if (!el) return;
    if (!("IntersectionObserver" in window)) { cb(); return; }
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { cb(); io.disconnect(); } });
    }, { threshold });
    io.observe(el);
    observers.push(io);
  }
  cleanups.push(() => observers.forEach((o) => o.disconnect()));

  /* ---------------------------------------------------------- tooltip dùng chung */
  const tip = $("#lpTip");
  function showTip(html: string, x: number, y: number) {
    if (!tip) return;
    tip.innerHTML = html;
    tip.classList.add("lp-is-on");
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = clamp(x + 14, 8, window.innerWidth - w - 8) + "px";
    let top = y - h - 12;
    if (top < 8) top = y + 18;
    tip.style.top = top + "px";
  }
  const hideTip = () => tip?.classList.remove("lp-is-on");
  document.addEventListener("scroll", hideTip, { passive: true });
  cleanups.push(() => document.removeEventListener("scroll", hideTip));

  /* ---------------------------------------------------------- thanh trên */
  const prog = $("#lpReadProgress");
  const navLinks = $$<HTMLAnchorElement>(".lp-nav a");
  subs.push(() => {
    const d = document.documentElement;
    prog?.style.setProperty("--p", clamp(window.scrollY / Math.max(1, d.scrollHeight - window.innerHeight)).toFixed(4));
    let cur: HTMLAnchorElement | null = null;
    navLinks.forEach((a) => {
      const s = root.querySelector(a.getAttribute("href") ?? "");
      if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) cur = a;
    });
    navLinks.forEach((a) => a.classList.toggle("lp-is-active", a === cur));
  });

  /* ---------------------------------------------------------- hero: tờ bài làm + parallax */
  const total = Math.max(1, opts.total);
  const sheetCells = $$(".lp-sheet-grid .lp-sc");
  const mockOf = (i: number) => Q[i % Q.length];
  const sheetClock = $("#lpSheetClock"), sheetPhase = $("#lpSheetPhase");
  const sheetScore = $("#lpSheetScore"), sheetStatus = $("#lpSheetStatus");
  const blankTail = Math.min(2, Math.floor(total / 10)); // vài câu cuối "chưa kịp mở"
  const stateOf = (i: number): QState => (i >= total - blankTail ? "blank" : mockOf(i).s === "blank" ? "bad" : mockOf(i).s);
  const showFinalSheet = () => {
    sheetCells.forEach((c, i) => (c.className = "lp-sc lp-s-" + stateOf(i)));
    if (sheetClock) sheetClock.textContent = "Hết giờ";
    if (sheetPhase) sheetPhase.textContent = "Đã chấm (minh họa)";
    if (sheetScore) { sheetScore.style.opacity = "1"; sheetScore.innerHTML = "6.50 <small>/ 10</small>"; }
    if (sheetStatus) sheetStatus.textContent = "Kèm nguyên nhân từng điểm rơi";
  };
  function heroCycle() {
    clearHero();
    sheetCells.forEach((c) => (c.className = "lp-sc"));
    if (sheetScore) sheetScore.style.opacity = "0";
    if (sheetPhase) sheetPhase.textContent = "Đang làm bài (minh họa)";
    if (sheetStatus) sheetStatus.textContent = "Nộp xong là có báo cáo";
    const answered = sheetCells.map((_, i) => i).filter((i) => stateOf(i) !== "blank");
    const step = Math.max(90, Math.min(260, 5200 / Math.max(1, answered.length)));
    let acc = 0;
    answered.forEach((qi, k) => {
      heroTimers.push(later(() => {
        sheetCells.forEach((c) => c.classList.remove("lp-is-now"));
        sheetCells[qi].classList.add("lp-is-ans", "lp-is-now");
        acc += mockOf(qi).t || 120;
        if (sheetClock) sheetClock.textContent = mmss(acc);
      }, 400 + k * step));
    });
    const tEnd = 400 + answered.length * step + 500;
    heroTimers.push(later(() => {
      sheetCells.forEach((c) => c.classList.remove("lp-is-now"));
      if (sheetClock) sheetClock.textContent = "Hết giờ";
      if (sheetPhase) sheetPhase.textContent = "Đang chấm";
    }, tEnd));
    sheetCells.forEach((c, i) => {
      heroTimers.push(later(() => (c.className = "lp-sc lp-s-" + stateOf(i)), tEnd + 500 + i * Math.min(45, 1000 / total)));
    });
    heroTimers.push(later(() => {
      if (sheetPhase) sheetPhase.textContent = "Đã chấm (minh họa)";
      if (sheetScore) sheetScore.style.opacity = "1";
      const t0 = performance.now();
      const roll = (now: number) => {
        const p = clamp((now - t0) / 900);
        if (sheetScore) sheetScore.innerHTML = fmt(6.5 * (1 - Math.pow(1 - p, 3))) + " <small>/ 10</small>";
        if (p < 1) heroRaf = requestAnimationFrame(roll);
      };
      heroRaf = requestAnimationFrame(roll);
      if (sheetStatus) sheetStatus.textContent = "Kèm nguyên nhân từng điểm rơi";
    }, tEnd + 1600));
    heroTimers.push(later(heroCycle, tEnd + 7600));
  }
  let heroTimers: number[] = [];
  let heroRaf = 0;
  function clearHero() {
    heroTimers.forEach((id) => { window.clearTimeout(id); timers.delete(id); });
    heroTimers = [];
    cancelAnimationFrame(heroRaf);
  }
  if (sheetCells.length) {
    if (reduce) showFinalSheet(); else heroCycle();
  }
  const onVis = () => {
    if (reduce || !sheetCells.length) return;
    if (document.hidden) clearHero(); else heroCycle();
  };
  document.addEventListener("visibilitychange", onVis);
  cleanups.push(() => { document.removeEventListener("visibilitychange", onVis); clearHero(); });

  const heroCurve = $<SVGElement>("#lpHeroCurve"), examCard = $("#lpExamCard");
  subs.push(() => {
    if (!heroCurve) return;
    if (reduce || window.innerWidth < 960) {
      heroCurve.style.transform = "";
      if (examCard) examCard.style.transform = "";
      return;
    }
    const y = Math.min(window.scrollY, 900);
    heroCurve.style.transform = `translate3d(${(-y * 0.08).toFixed(1)}px,${(y * 0.18).toFixed(1)}px,0)`;
    if (examCard) examCard.style.transform = `translate3d(0,${(-y * 0.06).toFixed(1)}px,0)`;
  });

  /* ---------------------------------------------------------- 01: morph 22 câu */
  const stage = $("#lpStage");
  const stepsEls = $$(".lp-steps .lp-step");
  const titles = $$("#lpMfTitle span");
  const cells: HTMLElement[] = [];
  const labelLayers: HTMLElement[][] = [[], [], [], []];
  let L: Box[][] | null = null;
  if (stage) {
    Q.forEach((q) => {
      const c = document.createElement("div");
      c.className = "lp-cell lp-s-" + q.s;
      c.innerHTML = "<b>" + q.n + "</b>";
      c.addEventListener("pointerenter", (e) => {
        showTip("<b>Câu " + q.n + " · Phần " + ["", "I", "II", "III"][q.part] + "</b>" +
          STATE_TXT[q.s] + " · " + fmt(q.score) + "/" + fmt(q.max) + "<br>" +
          (q.t ? "Thời gian " + mmss(q.t) + " (định mức " + mmss(PART_NORM[q.part]) + ")" : "Chưa mở câu") + "<br>" +
          TIERS[q.tier] + " · " + LESSONS[q.lesson], e.clientX, e.clientY);
      });
      c.addEventListener("pointerleave", hideTip);
      stage.appendChild(c);
      cells.push(c);
    });
  }
  function addLabel(layer: number, html: string, x: number, y: number, cls?: string) {
    const el = document.createElement("div");
    el.className = "lp-mlabel" + (cls ? " " + cls : "");
    el.innerHTML = html;
    el.style.left = x + "px";
    el.style.top = y + "px";
    stage!.appendChild(el);
    labelLayers[layer].push(el);
  }
  function addLine(layer: number, x: number, y: number, w: number) {
    const el = document.createElement("div");
    el.className = "lp-mline";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = w + "px";
    stage!.appendChild(el);
    labelLayers[layer].push(el);
  }
  function computeMorph() {
    if (!stage) return;
    labelLayers.forEach((arr) => { arr.forEach((el) => el.remove()); arr.length = 0; });
    const W = stage.clientWidth, H = stage.clientHeight, narrow = W < 520;
    const g = narrow ? 4 : 6;
    const A: Box[] = [], B: Box[] = [], C: Box[] = [], D: Box[] = [];

    // L0 — tờ bài làm theo 3 phần
    const s = Math.min(narrow ? 30 : 40, (W - 11 * g) / 12);
    const rowGap = narrow ? 14 : 20, lab = 20, rowH = lab + s;
    const top0 = Math.max(0, (H - (3 * rowH + 2 * rowGap)) / 2);
    const partRow = { 1: 0, 2: 1, 3: 2 } as const;
    const idxInPart = { 1: 0, 2: 0, 3: 0 };
    const partW = { 1: s, 2: 2 * s + g, 3: s };
    Q.forEach((q) => {
      const r = partRow[q.part], k = idxInPart[q.part]++;
      A.push({ x: k * (partW[q.part] + g), y: top0 + r * (rowH + rowGap) + lab, w: partW[q.part], h: s });
    });
    const pLab = narrow
      ? ["Phần I · 1.75/3", "Phần II · 3.25/4", "Phần III · 1.50/3"]
      : ["Phần I · 12 câu nhiều lựa chọn · 1.75/3", "Phần II · 4 câu đúng/sai · 3.25/4", "Phần III · 6 câu trả lời ngắn · 1.50/3"];
    pLab.forEach((t, r) => addLabel(0, t, 0, top0 + r * (rowH + rowGap)));
    addLabel(0, "<strong>6.50</strong> / 10", W, top0 + 2 * (rowH + rowGap) + lab + s / 2 - 10, "lp-is-right");

    // L1 — thời gian từng câu
    const g1 = narrow ? 2 : 4, bw = (W - 21 * g1) / 22, base = H - 24, maxH = H - (narrow ? 64 : 76), tMax = 800;
    Q.forEach((q, i) => {
      const h = q.t ? Math.max(6, (q.t / tMax) * maxH) : 6;
      B.push({ x: i * (bw + g1), y: base - h, w: bw, h });
    });
    ([[1, 0, 11], [2, 12, 15], [3, 16, 21]] as const).forEach(([part, a, b]) => {
      const x0 = a * (bw + g1), x1 = b * (bw + g1) + bw;
      addLine(1, x0 - 2, base - (PART_NORM[part] / tMax) * maxH, x1 - x0 + 4);
    });
    addLabel(1, "định mức từng phần", 0, base - (PART_NORM[1] / tMax) * maxH - 22);
    const x16 = 15 * (bw + g1) + bw / 2;
    addLabel(1, "<strong>Câu 16 · 6:40</strong>" + (narrow ? "" : "<br>gấp 2,7 lần định mức"), x16, base - maxH - (narrow ? 22 : 40), "lp-is-center lp-is-hi");
    if (!narrow) addLabel(1, "Câu 8 · 0:30", 7 * (bw + g1) + bw / 2, base - (30 / tMax) * maxH - 44, "lp-is-center");
    addLabel(1, "Câu 1", 0, base + 4);
    addLabel(1, "Câu 21, 22 · chưa mở", W, base + 4, "lp-is-right lp-is-hi");

    // L2 — 4 tầng tư duy
    const cg = narrow ? 10 : 18, colW = (W - 3 * cg) / 4, ig = 5;
    const cs = Math.min(narrow ? 24 : 32, (colW - ig) / 2, (H - 84) / 4 - ig);
    const base2 = H - 46, cnt = [0, 0, 0, 0];
    Q.forEach((q) => {
      const k = cnt[q.tier]++;
      const cx = q.tier * (colW + cg) + (colW - (2 * cs + ig)) / 2;
      C.push({ x: cx + (k % 2) * (cs + ig), y: base2 - (Math.floor(k / 2) + 1) * (cs + ig), w: cs, h: cs });
    });
    TIERS.forEach((t, i) => {
      const qs = Q.filter((q) => q.tier === i);
      const full = qs.filter((q) => q.s === "ok").length;
      addLabel(2, "<strong>" + (narrow ? t.replace("Vận dụng cao", "VD cao") : t) + "</strong><br>" + full + "/" + qs.length + (narrow ? " trọn" : " câu trọn điểm"),
        i * (colW + cg) + colW / 2, base2 + 6, "lp-is-center");
    });

    // L3 — 4 bài học
    const rh = H / 4, cs3 = Math.min(narrow ? 22 : 28, rh - 30), g3 = 5;
    const lc = [0, 0, 0, 0];
    Q.forEach((q) => {
      const k = lc[q.lesson]++;
      D.push({ x: k * (cs3 + g3), y: q.lesson * rh + 22, w: cs3, h: cs3 });
    });
    const lost = [0, 0, 0, 0];
    Q.forEach((q) => (lost[q.lesson] += q.max - q.score));
    LESSONS.forEach((name, i) => {
      addLabel(3, "<strong>" + name + "</strong>", 0, i * rh);
      addLabel(3, lost[i] > 0 ? "−" + fmt(lost[i]) : "trọn điểm", W, i * rh + 22 + cs3 / 2 - 10, "lp-is-right" + (lost[i] > 0 ? " lp-is-hi" : ""));
    });
    L = [A, B, C, D];
  }
  function readMorphProgress() {
    const wide = window.innerWidth >= 960;
    const r = window.innerHeight * (wide ? 0.5 : 0.8);
    const c = stepsEls.map((s) => { const b = s.getBoundingClientRect(); return b.top + Math.min(b.height, window.innerHeight) / 2; });
    if (!c.length || r <= c[0]) return 0;
    if (r >= c[c.length - 1]) return c.length - 1;
    for (let k = 0; k < c.length - 1; k++) if (c[k] <= r && r < c[k + 1]) return k + (r - c[k]) / (c[k + 1] - c[k]);
    return 0;
  }
  function applyMorph() {
    if (!L) return;
    const p = readMorphProgress();
    const i = Math.min(L.length - 2, Math.floor(p)), f = p - i;
    const u = reduce ? (f > 0.5 ? 1 : 0) : easeIO(clamp((f - 0.2) / 0.6));
    const pe = i + u;
    const from = L[i], to = L[i + 1];
    cells.forEach((el, n) => {
      const uu = reduce ? u : clamp(u * 1.25 - (n / 22) * 0.25);
      const a = from[n], b = to[n];
      const x = lerp(a.x, b.x, uu), y = lerp(a.y, b.y, uu), w = lerp(a.w, b.w, uu), h = lerp(a.h, b.h, uu);
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      el.style.width = w.toFixed(1) + "px";
      el.style.height = h.toFixed(1) + "px";
      const numOp = Math.max(clamp(1 - pe * 2.2), Math.min(w, h) >= 22 ? clamp((pe - 1.6) * 2.5) : 0);
      (el.firstChild as HTMLElement).style.opacity = numOp.toFixed(2);
    });
    labelLayers.forEach((arr, k) => {
      const o = clamp(1 - Math.abs(pe - k) * 1.8);
      arr.forEach((el) => (el.style.opacity = o.toFixed(3)));
    });
    titles.forEach((el, k) => (el.style.opacity = clamp(1 - Math.abs(pe - k) * 2).toFixed(3)));
    const active = Math.round(p);
    stepsEls.forEach((s, k) => s.classList.toggle("lp-is-active", k === active));
  }
  layoutFns.push(() => { computeMorph(); applyMorph(); });
  subs.push(applyMorph);

  /* ---------------------------------------------------------- 02: báo cáo 4 chương */
  const report = $("#lpReport");
  if (report) {
    const tabs = $$<HTMLButtonElement>("#lpReport .lp-rtab");
    const panels = $$("#lpReport .lp-panel");
    let activeTab = 0, reportSeen = false;
    const plot = $("#lpDistPlot");
    if (plot && !plot.querySelector(".lp-dot")) {
      const scores: number[] = [];
      for (let i = 0; i < 42; i++) scores.push(Math.round((5.3 + 2.3 * Math.sin(i * 1.7) + (i % 5) * 0.28) * 4) / 4);
      scores.sort((a, b) => a - b);
      const stack: Record<number, number> = {};
      let skipped = false;
      scores.forEach((s, i) => {
        if (Math.abs(s - 6.5) < 0.01 && !skipped) { skipped = true; return; }
        const k = Math.round(s * 100), y = stack[k] || 0;
        stack[k] = y + 1;
        const d = document.createElement("span");
        d.className = "lp-dot";
        d.style.setProperty("--x", String(s * 10));
        d.style.setProperty("--y", String(Math.min(y, 8)));
        d.style.setProperty("--dd", (i % 7) * 30 + "ms");
        plot.insertBefore(d, plot.firstChild);
      });
    }
    const rollScore = () => {
      const el = $("#lpPScore");
      if (!el) return;
      if (reduce) { el.textContent = "6.50"; return; }
      const t0 = performance.now();
      const roll = (now: number) => {
        const p = clamp((now - t0) / 900);
        el.textContent = fmt(6.5 * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(roll);
      };
      requestAnimationFrame(roll);
    };
    const setTab = (i: number, manual?: boolean) => {
      activeTab = i;
      tabs.forEach((t, k) => {
        t.classList.toggle("lp-is-active", k === i);
        t.setAttribute("aria-selected", k === i ? "true" : "false");
        t.tabIndex = k === i ? 0 : -1;
      });
      panels.forEach((p, k) => p.classList.toggle("lp-is-active", k === i));
      if (manual) report.classList.remove("lp-is-auto");
      if (i === 0) rollScore();
      const bar = tabs[i].querySelector<HTMLElement>(".lp-rtab-bar i");
      if (bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
    };
    tabs.forEach((t, k) => {
      const onClick = () => setTab(k, true);
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setTab((k + 1) % 4, true); tabs[(k + 1) % 4].focus(); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setTab((k + 3) % 4, true); tabs[(k + 3) % 4].focus(); }
      };
      const bar = t.querySelector(".lp-rtab-bar i");
      const onEnd = () => { if (report.classList.contains("lp-is-auto")) setTab((activeTab + 1) % 4); };
      t.addEventListener("click", onClick);
      t.addEventListener("keydown", onKey);
      bar?.addEventListener("animationend", onEnd);
      cleanups.push(() => { t.removeEventListener("click", onClick); t.removeEventListener("keydown", onKey); bar?.removeEventListener("animationend", onEnd); });
    });
    const device = report.querySelector(".lp-device");
    const pause = () => report.classList.add("lp-is-paused");
    const resume = () => report.classList.remove("lp-is-paused");
    device?.addEventListener("pointerenter", pause);
    device?.addEventListener("pointerleave", resume);
    cleanups.push(() => { device?.removeEventListener("pointerenter", pause); device?.removeEventListener("pointerleave", resume); });
    if (reduce) report.classList.remove("lp-is-auto");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => {
          report.classList.toggle("lp-is-paused", !e.isIntersecting);
          if (e.isIntersecting && !reportSeen) { reportSeen = true; setTab(0); }
        });
      }, { threshold: 0.35 });
      io.observe(report);
      observers.push(io);
    }
  }

  /* ---------------------------------------------------------- 03: thác điểm rơi */
  const wf = $<SVGSVGElement>("#lpWf");
  const WF = [
    { k: "Tối đa", v: 10, type: "start", qs: "22 câu, 3 phần" },
    { k: "Nhịp độ", v: -2.0, w: 100, qs: "Câu 8, 16, 21, 22", note: "Câu 16 gấp 2,7 lần định mức; Câu 21, 22 chưa kịp mở" },
    { k: "Thực thi", v: -0.5, w: 70, qs: "Câu 6, 10", note: "Hướng đúng, lệch ở bước làm" },
    { k: "Kiến thức", v: -0.25, w: 46, qs: "Câu 3", note: "Khái niệm chưa chắc" },
    { k: "Chưa định vị", v: -0.75, unloc: true, qs: "Câu 12, 20", note: "Chưa có nhãn lỗi hoặc tín hiệu thời gian đủ rõ" },
    { k: "Điểm của em", v: 6.5, type: "end", qs: "6.50 / 10" },
  ] as { k: string; v: number; type?: "start" | "end"; w?: number; unloc?: boolean; qs: string; note?: string }[];
  function drawWF() {
    if (!wf) return;
    const W = wf.clientWidth, H = wf.clientHeight, narrow = W < 460;
    const padL = 26, padB = narrow ? 40 : 34, padT = 26, plotH = H - padB - padT, plotW = W - padL;
    const y = (v: number) => padT + plotH * (1 - v / 10);
    const col = plotW / WF.length, bwid = Math.min(64, col * 0.62);
    let svg = '<defs><pattern id="lpHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--subtle)"/><rect width="2" height="6" fill="var(--faint)"/></pattern></defs><g class="lp-grid">';
    [0, 2, 4, 6, 8, 10].forEach((t) => {
      svg += `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="0" y="${y(t) + 4}">${t}</text>`;
    });
    svg += "</g>";
    let run = 10;
    WF.forEach((d, i) => {
      const cx = padL + col * i + col / 2, x = cx - bwid / 2;
      let top: number, bot: number, fill: string, from = "";
      if (d.type === "start") { top = y(10); bot = y(0); fill = "color-mix(in srgb, var(--ink) 22%, var(--surface))"; from = " lp-from-bottom"; }
      else if (d.type === "end") { top = y(d.v); bot = y(0); fill = "var(--brand)"; from = " lp-from-bottom"; }
      else { top = y(run); bot = y(run + d.v); run += d.v; fill = d.unloc ? "url(#lpHatch)" : `color-mix(in oklab, var(--bad) ${d.w}%, var(--surface))`; }
      const dl = i * 260;
      svg += `<rect class="lp-bar${from}" data-i="${i}" x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bwid.toFixed(1)}" height="${Math.max(2, bot - top).toFixed(1)}" rx="4" fill="${fill}"${d.unloc ? ' stroke="var(--faint)" stroke-width="1"' : ""} style="--d:${dl}ms"/>`;
      if (i < WF.length - 1) {
        const ny = d.type === "start" ? y(10) : y(run);
        svg += `<line class="lp-conn lp-lbl" x1="${(x + bwid).toFixed(1)}" x2="${(cx + col - bwid / 2).toFixed(1)}" y1="${ny.toFixed(1)}" y2="${ny.toFixed(1)}" style="--d:${dl}ms"/>`;
      }
      const txt = d.type ? fmt(d.v) : "−" + fmt(-d.v);
      const ty = d.type ? top - 8 : bot + 17;
      svg += `<text class="lp-val lp-lbl" x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" style="--d:${dl}ms">${txt}</text>`;
      if (narrow) {
        const sp = d.k.indexOf(" ");
        svg += `<text class="lp-cat" x="${cx.toFixed(1)}" y="${H - padB + 17}" text-anchor="middle"><tspan x="${cx.toFixed(1)}">${d.k.slice(0, sp)}</tspan><tspan x="${cx.toFixed(1)}" dy="14">${d.k.slice(sp + 1)}</tspan></text>`;
      } else {
        svg += `<text class="lp-cat" x="${cx.toFixed(1)}" y="${H - padB + 20}" text-anchor="middle">${d.k}</text>`;
      }
    });
    wf.setAttribute("viewBox", `0 0 ${W} ${H}`);
    wf.innerHTML = svg;
    wf.querySelectorAll<SVGRectElement>(".lp-bar").forEach((r) => {
      const d = WF[Number(r.getAttribute("data-i"))];
      const show = (e: PointerEvent) =>
        showTip("<b>" + d.k + (d.type ? " · " + fmt(d.v) : " · −" + fmt(-d.v)) + "</b>" + d.qs + (d.note ? "<br>" + d.note : ""), e.clientX, e.clientY);
      r.addEventListener("pointerenter", show);
      r.addEventListener("pointermove", show);
      r.addEventListener("pointerleave", hideTip);
    });
  }
  layoutFns.push(drawWF);
  inView(wf, () => wf?.classList.add("lp-in"), 0.4);

  /* ---------------------------------------------------------- 04: quy trình */
  const flow = $("#lpFlow");
  const fsteps = $$("#lpFlow .lp-fstep");
  subs.push(() => {
    if (!flow) return;
    const b = flow.getBoundingClientRect();
    const p = reduce ? (b.top < window.innerHeight * 0.8 ? 1 : 0) : clamp((window.innerHeight * 0.75 - b.top) / (b.height * 0.9));
    flow.style.setProperty("--fp", p.toFixed(3));
    fsteps.forEach((s, i) => s.classList.toggle("lp-is-on", p >= i / (fsteps.length - 1) - 0.02));
  });

  /* ---------------------------------------------------------- 05: mắt xích, xu hướng, ôn tập */
  const chain = $("#lpChain"), chainSvg = $<SVGSVGElement>("#lpChainSvg");
  const EDGES: [string, string, boolean?][] = [["lpN-hh", "lpN-b1"], ["lpN-hh", "lpN-b2"], ["lpN-gh", "lpN-b3"], ["lpN-qt", "lpN-b2"], ["lpN-qt", "lpN-b1", true]];
  function drawChain() {
    if (!chain || !chainSvg) return;
    const cb = chain.getBoundingClientRect(), stacked = window.innerWidth < 960;
    let out = "";
    EDGES.forEach(([fromId, toId, hl]) => {
      const aEl = root.querySelector("#" + fromId), bEl = root.querySelector("#" + toId);
      if (!aEl || !bEl) return;
      const a = aEl.getBoundingClientRect(), b = bEl.getBoundingClientRect();
      let d: string;
      if (!stacked) {
        const x1 = a.right - cb.left, y1 = a.top + a.height / 2 - cb.top, x2 = b.left - cb.left, y2 = b.top + b.height / 2 - cb.top;
        const mx = (x1 + x2) / 2;
        d = `M${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
      } else {
        if (!hl) return;
        const x1 = a.left + 18 - cb.left, y1 = a.bottom - cb.top, x2 = b.left + 18 - cb.left, y2 = b.top - cb.top;
        d = `M${x1 - 10} ${a.top + a.height / 2 - cb.top} C ${x1 - 34} ${y1} ${x2 - 34} ${y2 - 40} ${x2 - 10} ${b.top + 14 - cb.top}`;
      }
      out += `<path ${hl ? 'class="lp-hl" pathLength="1" ' : ""}d="${d}"/>`;
    });
    if (!stacked) {
      const tEl = root.querySelector("#lpN-b1");
      if (tEl) {
        const t = tEl.getBoundingClientRect(), tx = t.left - cb.left, ty = t.top + t.height / 2 - cb.top;
        out += `<path class="lp-hl" pathLength="1" d="M${tx - 9} ${ty - 5} L ${tx} ${ty} L ${tx - 9} ${ty + 5}"/>`;
      }
    }
    chainSvg.innerHTML = out;
  }
  layoutFns.push(drawChain);
  inView(chain, () => chain?.classList.add("lp-in"), 0.35);
  $$(".lp-chain .lp-node").forEach((n) => {
    const enter = (e: PointerEvent) => showTip("<b>" + (n.querySelector("b")?.textContent ?? "") + "</b>" + (n.querySelector("span")?.textContent ?? ""), e.clientX, e.clientY);
    n.addEventListener("pointerenter", enter);
    n.addEventListener("pointerleave", hideTip);
  });

  const trend = $<SVGSVGElement>("#lpTrend");
  const TR = [5.25, 5.75, 6.5, 6.25, 7.25];
  function drawTrend() {
    if (!trend) return;
    const W = trend.clientWidth, H = trend.clientHeight, padL = 24, padB = 26, padT = 22, padR = 18;
    const x = (i: number) => padL + 14 + ((W - padL - padR - 28) * i) / (TR.length - 1);
    const y = (v: number) => padT + (H - padT - padB) * (1 - (v - 4) / 4);
    let s = "";
    [4, 5, 6, 7, 8].forEach((t) => {
      s += `<line class="lp-gl" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="lp-gt" x="0" y="${y(t) + 4}">${t}</text>`;
    });
    const d = TR.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
    s += `<path class="lp-ln" pathLength="1" d="${d}"/>`;
    TR.forEach((v, i) => {
      const dl = 200 + i * 260;
      s += `<circle class="lp-pt" cx="${x(i)}" cy="${y(v)}" r="5" style="--d:${dl}ms"/>`;
      s += `<text class="lp-pv" x="${x(i)}" y="${y(v) - 12}" text-anchor="middle" style="--d:${dl}ms">${fmt(v)}</text>`;
      s += `<text class="lp-xl" x="${x(i)}" y="${H - 4}" text-anchor="middle">Đề ${i + 1}</text>`;
      s += `<rect class="lp-hit" data-i="${i}" x="${x(i) - 22}" y="0" width="44" height="${H}"/>`;
    });
    trend.setAttribute("viewBox", `0 0 ${W} ${H}`);
    trend.innerHTML = s;
    trend.querySelectorAll<SVGRectElement>(".lp-hit").forEach((r) => {
      const i = Number(r.getAttribute("data-i"));
      r.addEventListener("pointerenter", (e) => {
        const dv = i ? TR[i] - TR[i - 1] : 0;
        showTip("<b>Đề " + (i + 1) + " · " + fmt(TR[i]) + "</b>" + (i ? (dv >= 0 ? "+" : "−") + fmt(Math.abs(dv)) + " so với đề trước" : "Đề đầu tiên trong hồ sơ"), e.clientX, e.clientY);
      });
      r.addEventListener("pointerleave", hideTip);
    });
  }
  layoutFns.push(drawTrend);
  inView(trend, () => trend?.classList.add("lp-in"), 0.4);

  const lboxes = $$("#lpLeit .lp-lbox");
  const lres = $$("#lpLeit .lp-leit-res");
  const SEQ: ("ok" | "bad")[] = ["ok", "ok", "bad", "ok", "ok", "ok"];
  const setBox = (i: number, v: "ok" | "bad") => { lboxes[i].className = "lp-lbox lp-is-" + v; lboxes[i].textContent = v === "ok" ? "Đúng" : "Sai"; };
  const leitFinal = () => {
    SEQ.forEach((v, i) => setBox(i, v));
    lres[0].className = "lp-leit-res lp-is-reset"; lres[0].textContent = "Đếm lại";
    lres[1].className = "lp-leit-res lp-is-done"; lres[1].textContent = "Rút khỏi danh sách";
  };
  const leitRun = () => {
    lboxes.forEach((b, i) => { b.className = "lp-lbox"; b.textContent = "Buổi " + (i + 1); });
    lres.forEach((r) => { r.className = "lp-leit-res"; r.textContent = "—"; });
    SEQ.forEach((v, i) => {
      later(() => {
        setBox(i, v);
        if (i === 2) { lres[0].className = "lp-leit-res lp-is-reset"; lres[0].textContent = "Đếm lại"; }
        if (i === 5) { lres[1].className = "lp-leit-res lp-is-done"; lres[1].textContent = "Rút khỏi danh sách"; }
      }, 500 + i * 650);
    });
    later(leitRun, 500 + 6 * 650 + 3500);
  };
  if (lboxes.length === 6 && lres.length === 2) inView($("#lpLeit"), () => (reduce ? leitFinal() : leitRun()), 0.5);

  /* ---------------------------------------------------------- 06: thẻ bung thành nền đỏ */
  const finale = $("#lpFinale"), fSticky = $("#lpFinaleSticky");
  const fCard = $("#lpFinaleCard"), fBg = $("#lpFinaleBg"), fB = $("#lpFinaleB");
  subs.push(() => {
    if (!finale || !fSticky || !fCard || !fBg || !fB) return;
    const r = finale.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    let p = clamp(-r.top / Math.max(1, r.height - window.innerHeight));
    if (reduce) p = p > 0.3 ? 1 : 0;
    const e = easeIO(clamp(p / 0.7));
    const s = fSticky.getBoundingClientRect(), c = fCard.getBoundingClientRect();
    const t = lerp(c.top - s.top, 0, e), l = lerp(c.left - s.left, 0, e), rr = lerp(s.right - c.right, 0, e), b = lerp(s.bottom - c.bottom, 0, e);
    const op = clamp(p * 6);
    fBg.style.opacity = op.toFixed(3);
    fBg.style.clipPath = `inset(${t.toFixed(1)}px ${rr.toFixed(1)}px ${b.toFixed(1)}px ${l.toFixed(1)}px round ${lerp(22, 0, e).toFixed(1)}px)`;
    fCard.classList.toggle("lp-on-stage", op > 0.4);
    fCard.style.opacity = (1 - clamp((p - 0.12) * 4)).toFixed(3);
    const ob = clamp((p - 0.45) * 3);
    fB.style.opacity = ob.toFixed(3);
    fB.style.transform = `translateY(${((1 - ob) * 18).toFixed(1)}px)`;
    fB.classList.toggle("lp-is-live", ob > 0.6);
  });

  /* ---------------------------------------------------------- thanh CTA đáy (điện thoại) */
  const mbar = $("#lpMbar"), hero = $("#lpTop");
  subs.push(() => {
    if (!mbar || !hero) return;
    const fr = finale?.getBoundingClientRect();
    const inFinale = !!fr && fr.top < window.innerHeight * 0.5 && fr.bottom > window.innerHeight * 0.5;
    mbar.classList.toggle("lp-is-on", hero.getBoundingClientRect().bottom < 0 && !inFinale);
  });

  /* ---------------------------------------------------------- khởi động */
  const boot = () => { relayout(); schedule(); };
  boot();
  let alive = true;
  document.fonts?.ready.then(() => { if (alive) boot(); });
  // Đổi giao diện sáng/tối: vẽ lại SVG để lấy màu mới.
  const mo = new MutationObserver(() => later(boot, 30));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return () => {
    alive = false;
    mo.disconnect();
    clearTimers();
    cleanups.forEach((f) => f());
    hideTip();
    cells.forEach((c) => c.remove());
    labelLayers.forEach((arr) => arr.forEach((el) => el.remove()));
  };
}
