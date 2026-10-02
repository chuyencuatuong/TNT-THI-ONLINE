import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import * as api from "../lib/api";
import type { PublicExamInfo } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/useTheme";
import { setupLandingMotion } from "./landingMotion";
import "./PublicExamLanding.css";

/**
 * Trang landing của ĐỀ CÔNG KHAI — /thi/?de=<slug>&src=<nguồn> (02/10/2026).
 *
 * Luồng: Facebook -> trang này (giới thiệu đề + khả năng phân tích của TNT)
 * -> "Làm bài miễn phí" -> đăng nhập ẩn danh (không cần tài khoản) ->
 * /lam-bai/:examId -> nộp -> điền thông tin cơ bản -> /ket-qua/:attemptId.
 *
 * Thông tin đề (tên, số câu, thời gian, khung giờ mở) lấy THẬT qua RPC
 * get_public_exam. Các phần giải thích (morph 22 câu, báo cáo mẫu, thác điểm,
 * mắt xích, xu hướng) là DỮ LIỆU MINH HỌA, có gắn nhãn trên trang — phần
 * chuyển động nằm ở landingMotion.ts. Không có ?de= (hoặc slug sai) thì hiện
 * danh sách đề công khai đang mở.
 */

const cv = (o: Record<string, string | number>) => o as CSSProperties;

const PART_LABELS: Record<string, string> = {
  "1": "Phần I · Nhiều lựa chọn",
  "2": "Phần II · Đúng/Sai",
  "3": "Phần III · Trả lời ngắn",
};
const PART_SHORT: Record<string, string> = {
  "1": "câu nhiều lựa chọn",
  "2": "câu đúng/sai",
  "3": "câu trả lời ngắn",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; exam: PublicExamInfo | null; list: PublicExamInfo[]; notFound: boolean }
  | { status: "error"; message: string };

type WindowStatus = "open" | "not_yet" | "closed";

function windowStatus(exam: PublicExamInfo | null, now: number): WindowStatus {
  if (!exam) return "open";
  if (exam.assigned_unlock_at && now < new Date(exam.assigned_unlock_at).getTime()) return "not_yet";
  if (exam.assigned_lock_at && now > new Date(exam.assigned_lock_at).getTime()) return "closed";
  return "open";
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
}

function examParts(exam: PublicExamInfo) {
  return ["1", "2", "3"]
    .map((k) => ({ key: k, count: exam.part_counts?.[k] ?? 0 }))
    .filter((p) => p.count > 0);
}

function examMeta(exam: PublicExamInfo | null): string {
  if (!exam) return "Miễn phí · không cần tài khoản";
  const total = examParts(exam).reduce((s, p) => s + p.count, 0);
  return exam.duration_minutes ? `${total} câu · ${exam.duration_minutes} phút` : `${total} câu · không giới hạn giờ`;
}

function translateStartError(message: string): string {
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Hệ thống chưa mở chế độ làm bài không cần tài khoản. Em nhắn Fanpage TNT giúp thầy nhé.";
  }
  if (/rate limit|too many/i.test(message)) {
    return "Đang có quá nhiều bạn vào cùng lúc. Em đợi khoảng 1 phút rồi bấm lại nhé.";
  }
  return "Chưa bắt đầu được bài làm. Em kiểm tra mạng rồi thử lại nhé.";
}

export function PublicExamLanding() {
  const [params] = useSearchParams();
  const slug = params.get("de")?.trim() || null;
  const source = (params.get("src") ?? "link").replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || "link";
  const navigate = useNavigate();
  const { session, profile, startGuestSession } = useAuth();
  const { toggleTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const goRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [modalOpen, setModalOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const exam = slug ? await api.getPublicExam(slug) : null;
        const list = exam ? [] : await api.listPublicExams();
        if (!cancelled) setState({ status: "ready", exam, list, notFound: !!slug && !exam });
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setState({
          status: "error",
          message: api.isMissingRpcError(err)
            ? "Hệ thống chưa bật đề công khai (cần chạy migration_023)."
            : "Chưa tải được đề. Em kiểm tra mạng rồi tải lại trang nhé.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const exam = state.status === "ready" ? state.exam : null;
  const parts = useMemo(() => (exam ? examParts(exam) : []), [exam]);
  const total = parts.reduce((s, p) => s + p.count, 0);
  const win = windowStatus(exam, Date.now());

  useEffect(() => {
    document.title = exam ? `${exam.title} · Làm đề miễn phí · Toán học TNT` : "Làm đề Toán miễn phí · Toán học TNT";
  }, [exam]);

  // Chuyển động + biểu đồ: dựng sau khi trang đã có nội dung, dọn khi rời trang.
  useEffect(() => {
    if (state.status === "loading" || !rootRef.current) return;
    return setupLandingMotion(rootRef.current, { total: total || 22 });
  }, [state.status, total, slug]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setStartError(null);
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    goRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  function onStart() {
    if (!exam) {
      document.getElementById("lpDeList")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (win !== "open") {
      document.getElementById("lpExamCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setStartError(null);
    setModalOpen(true);
  }

  async function startExam() {
    if (!exam || starting) return;
    const target = `/lam-bai/${exam.id}?src=${encodeURIComponent(source)}&de=${encodeURIComponent(exam.slug)}`;
    if (session && profile) {
      if (profile.role === "teacher") {
        setStartError("Bạn đang đăng nhập bằng tài khoản giáo viên. Mở đề ở trang soạn đề để xem trước, hoặc dùng trình duyệt ẩn danh để thử như học sinh.");
        return;
      }
      navigate(target);
      return;
    }
    if (session && !profile) {
      setStartError("Tài khoản của em chưa hoàn tất hồ sơ. Vào trang đăng nhập để hoàn tất trước nhé.");
      return;
    }
    setStarting(true);
    const { error } = await startGuestSession(source);
    setStarting(false);
    if (error) {
      console.error(error);
      setStartError(translateStartError(error));
      return;
    }
    navigate(target);
  }

  if (state.status === "loading") {
    return (
      <div className="tnt-landing">
        <div className="lp-loading">Đang tải đề…</div>
      </div>
    );
  }

  const chipText = exam?.grade ? `Đề miễn phí · Toán ${exam.grade}` : "Đề Toán miễn phí";
  const metaText = examMeta(exam);
  const durationText = exam?.duration_minutes ? `${exam.duration_minutes} phút` : null;
  const flowStep2Text = exam
    ? `${total} câu, ${parts.length} phần${parts.length === 3 ? ", giống cấu trúc đề tốt nghiệp" : ""}.`
    : "Đồng hồ chạy từ lúc em bấm vào làm bài.";
  const finaleText = exam
    ? `${total} câu${durationText ? `, ${durationText}` : ""}, một bản báo cáo của riêng em.`
    : "Chọn một đề, nhận một bản báo cáo của riêng em.";
  const loggedStudent = !!session && !!profile && profile.role === "student" && !profile.is_guest;

  const kicker =
    state.status === "error"
      ? "Chưa tải được đề"
      : !exam
        ? state.notFound
          ? "Không tìm thấy đề này"
          : "Đề đang mở"
        : win === "not_yet"
          ? `Mở lúc ${formatDateTime(exam.assigned_unlock_at!)}`
          : win === "closed"
            ? "Đề đã đóng"
            : exam.duration_minutes
              ? `Đề đang mở · ${exam.duration_minutes} phút`
              : "Đề đang mở";

  let heroAside: ReactNode;
  if (exam) {
    heroAside = (
      <div className="lp-exam-card lp-rise" id="lpExamCard" style={cv({ "--d": "260ms" })}>
        <div className="lp-exam-head">
          <div>
            <div className="lp-exam-kicker">{kicker}</div>
            <div className="lp-exam-title">{exam.title}</div>
          </div>
          {exam.submitted_count >= 10 && <span className="lp-demo-tag">{exam.submitted_count} lượt đã nộp</span>}
        </div>
        {exam.intro && <p className="lp-exam-intro">{exam.intro}</p>}
        <div className="lp-parts-bar" aria-hidden="true">
          {parts.map((p) => (
            <span key={p.key} style={{ flex: p.count }} />
          ))}
        </div>
        <div className="lp-parts-legend" style={{ gridTemplateColumns: `repeat(${Math.max(1, parts.length)}, minmax(0, 1fr))` }}>
          {parts.map((p) => (
            <span key={p.key}>
              <b>{PART_LABELS[p.key]}</b>
              {p.count} câu
            </span>
          ))}
        </div>
        <div className="lp-sheet" aria-label="Minh họa một lượt làm bài đang được chấm">
          <div className="lp-sheet-top">
            <span id="lpSheetPhase">Minh họa</span>
            <b id="lpSheetClock">0:00</b>
          </div>
          <div className="lp-sheet-grid" id="lpSheetGrid">
            {Array.from({ length: total }, (_, i) => (
              <span className="lp-sc" key={i}>
                {i + 1}
              </span>
            ))}
          </div>
          <div className="lp-sheet-result">
            <span className="lp-sheet-score" id="lpSheetScore" style={{ opacity: 0 }}>
              0.00 <small>/ 10</small>
            </span>
            <span className="lp-sheet-status" id="lpSheetStatus">
              Nộp xong là có báo cáo
            </span>
          </div>
        </div>
        <div className="lp-exam-foot">
          <span className="lp-note">
            {win === "open"
              ? "Bấm bắt đầu thì đồng hồ mới chạy."
              : win === "not_yet"
                ? "Chưa tới giờ mở đề, em quay lại đúng giờ nhé."
                : "Đề đã hết hạn làm bài."}
          </span>
          <button className="lp-btn lp-btn-primary lp-btn-sm" type="button" onClick={onStart} disabled={win !== "open"}>
            {win === "open" ? "Bắt đầu" : win === "not_yet" ? "Chưa mở" : "Đã đóng"}
          </button>
        </div>
      </div>
    );
  } else {
    const list = state.status === "ready" ? state.list : [];
    heroAside = (
      <div className="lp-exam-card lp-rise" id="lpExamCard" style={cv({ "--d": "260ms" })}>
        <div className="lp-exam-kicker">{kicker}</div>
        <div className="lp-exam-title">{state.status === "error" ? state.message : "Chọn một đề để bắt đầu"}</div>
        <ul className="lp-exam-list" id="lpDeList">
          {list.map((e) => (
            <li key={e.id}>
              <Link className="lp-exam-item" to={`/thi?de=${encodeURIComponent(e.slug)}&src=${encodeURIComponent(source)}`}>
                <b>{e.title}</b>
                <span>{examMeta(e)}</span>
              </Link>
            </li>
          ))}
          {state.status === "ready" && list.length === 0 && (
            <li className="lp-exam-empty">Hiện chưa có đề công khai nào. Theo dõi Fanpage Toán học TNT để nhận đề mới nhé.</li>
          )}
        </ul>
      </div>
    );
  }

  const modal = exam ? (
    <div
      className={`lp-modal${modalOpen ? " lp-is-open" : ""}`}
      aria-hidden={!modalOpen}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="lp-modal-box" role="dialog" aria-modal="true" aria-labelledby="lpModalTitle">
        <span className="lp-eyebrow">Trước khi bắt đầu</span>
        <h3 id="lpModalTitle">{exam.title}</h3>
        <ul className="lp-modal-list">
          <li>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx={8} cy={8} r={6} /><path d="M8 5v3l2 1.5" /></svg>
            <span>
              {durationText ? (
                <>
                  <b>{durationText}</b>, đồng hồ chạy từ lúc em bấm vào làm bài.
                </>
              ) : (
                "Không giới hạn thời gian."
              )}
            </span>
          </li>
          <li>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" /></svg>
            <span>
              <b>{total} câu</b>: {parts.map((p) => `${p.count} ${PART_SHORT[p.key]}`).join(", ")}.
            </span>
          </li>
          {exam.mode === "nghiem_tuc" && (
            <li>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2l6 11H2z" /><path d="M8 7v3M8 11.5v.5" /></svg>
              <span>Phòng thi nghiêm túc: làm ở chế độ toàn màn hình, rời trang quá nhiều lần thì bài bị huỷ.</span>
            </li>
          )}
          <li>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
            <span>
              {loggedStudent
                ? `Bài làm sẽ lưu vào tài khoản ${profile!.full_name}.`
                : "Không cần tài khoản. Nộp xong mới hỏi họ tên, trường, tỉnh/thành, lớp."}
            </span>
          </li>
        </ul>
        <p className="lp-modal-msg" role="status">
          {startError}
        </p>
        <div className="lp-modal-actions">
          <button className="lp-btn lp-btn-sm" type="button" onClick={closeModal}>
            Để sau
          </button>
          <button ref={goRef} className="lp-btn lp-btn-primary lp-btn-sm" type="button" onClick={startExam} disabled={starting}>
            {starting ? "Đang chuẩn bị đề…" : "Vào làm bài"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="tnt-landing" ref={rootRef}>
      <header className="lp-topbar">
        <div className="lp-wrap">
          <a className="lp-brand" href="#lpTop" aria-label="Toán học TNT, về đầu trang">
            <span className="lp-brand-mark" aria-hidden="true">TNT</span>
            <span className="lp-brand-name"><b>Toán học TNT</b><span>Thi online</span></span>
          </a>
          <nav className="lp-nav" aria-label="Các phần của trang">
            <a href="#du-lieu">Bài làm thành dữ liệu</a>
            <a href="#bao-cao">Báo cáo</a>
            <a href="#mat-diem">Vì sao mất điểm</a>
            <a href="#quy-trinh">Cách làm</a>
            <a href="#hoi-dap">Hỏi đáp</a>
          </nav>
          <div className="lp-top-actions">
            <button className="lp-icon-btn" id="lpThemeBtn" type="button" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối">
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" /></svg>
            </button>
            <button className="lp-btn lp-btn-primary lp-btn-sm" type="button" onClick={onStart}>Làm bài miễn phí</button>
          </div>
        </div>
        <span className="lp-read-progress" id="lpReadProgress" aria-hidden="true" />
      </header>
      <main>
        {/* =====================================================================
         HERO
         ===================================================================== */}
        <section className="lp-hero" id="lpTop">
          <div className="lp-hero-grid-bg" aria-hidden="true" />
          <svg className="lp-hero-curve" id="lpHeroCurve" viewBox="0 0 720 420" fill="none" aria-hidden="true">
            <path d="M10 380 C 120 380 150 90 260 90 C 360 90 380 300 470 300 C 560 300 600 60 710 30" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            <circle cx={260} cy={90} r={5} fill="currentColor" /><circle cx={470} cy={300} r={5} fill="currentColor" />
            <path d="M260 90 V 400 M470 300 V 400" stroke="currentColor" strokeWidth={1} strokeDasharray="4 6" />
          </svg>
          <div className="lp-wrap">
            <div>
              <span className="lp-chip lp-rise" style={cv({"--d": '0ms'})}><i />{chipText}</span>
              <h1 className="lp-h1 lp-rise" style={cv({"--d": '80ms'})}>Không chỉ biết điểm.<br />
                <span className="lp-l2">Biết mình đang ở đâu.<svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d="M3 10 C 80 3 200 2 297 9" stroke="currentColor" strokeWidth={4} strokeLinecap="round" fill="none" /></svg></span>
              </h1>
              <p className="lp-hero-lede lp-rise" style={cv({"--d": '200ms'})}><b>TNT không chỉ chấm điểm.</b> TNT biến một lượt làm bài thành dữ liệu để hiểu quá trình học: em mất điểm ở câu nào, vì sao mất, và nên làm gì tiếp theo.</p>
              <div className="lp-hero-cta lp-rise" style={cv({"--d": '320ms'})}>
                <button className="lp-btn lp-btn-primary" type="button" onClick={onStart}>Làm bài miễn phí
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </button>
                <a className="lp-btn" href="#du-lieu">Xem TNT phân tích gì</a>
              </div>
              <ul className="lp-assure lp-rise" style={cv({"--d": '440ms'})}>
                <li><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>Không cần tài khoản</li>
                <li><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>{metaText}</li>
                <li><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>Có báo cáo ngay khi nộp</li>
              </ul>
            </div>
            {heroAside}
          </div>
        </section>
        {/* =====================================================================
         01 — MỘT TỜ BÀI LÀM, BỐN LỚP DỮ LIỆU (morph theo cuộn)
         ===================================================================== */}
        <section className="lp-section" id="du-lieu" style={{paddingBottom: 40}}>
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Bên trong một lượt làm bài</span>
              <h2 className="lp-h2">Một tờ bài làm, <em>bốn lớp dữ liệu.</em></h2>
              <p className="lp-lede">Câu chuyện như thế này: hai bạn cùng 6.50 điểm, nhưng một bạn hổng kiến thức, bạn kia hết giờ. Cách ôn khác hẳn nhau. Kéo xuống để xem cùng 22 câu trả lời được TNT sắp xếp lại theo từng góc nhìn.</p>
            </div>
            <div className="lp-morph" id="lpMorph">
              <div className="lp-morph-fig" id="lpMorphFig">
                <div className="lp-mf-head">
                  <div className="lp-mf-title" id="lpMfTitle">
                    <span data-layer={0}>Lớp 1 · Kết quả từng câu</span>
                    <span data-layer={1} style={{opacity: 0}}>Lớp 2 · Thời gian tập trung</span>
                    <span data-layer={2} style={{opacity: 0}}>Lớp 3 · Tầng tư duy</span>
                    <span data-layer={3} style={{opacity: 0}}>Lớp 4 · Bài học trong chương</span>
                  </div>
                  <span className="lp-demo-tag">Dữ liệu minh họa</span>
                </div>
                <div className="lp-stage" id="lpStage" role="img" aria-label="22 câu của một bài làm, lần lượt sắp xếp theo kết quả, thời gian, tầng tư duy và bài học" />
                <div className="lp-mf-legend" aria-hidden="true">
                  <span><i className="lp-k-ok" />Trọn điểm</span>
                  <span><i className="lp-k-part" />Một phần</span>
                  <span><i className="lp-k-bad" />Mất điểm</span>
                  <span><i className="lp-k-blank" />Bỏ trống</span>
                </div>
              </div>
              <div className="lp-steps" id="lpSteps">
                <article className="lp-step" data-step={0}>
                  <span className="lp-step-kicker">Lớp 1 · Kết quả</span>
                  <h3>22 câu, 6.50 điểm.</h3>
                  <p>Mỗi ô là một câu. Ô xanh là trọn điểm, ô đất nung là mất điểm, ô gạch chéo là bỏ trống. <b>Tới đây, hệ thống chấm nào cũng làm được.</b> TNT mới bắt đầu từ chỗ này.</p>
                </article>
                <article className="lp-step" data-step={1}>
                  <span className="lp-step-kicker">Lớp 2 · Thời gian</span>
                  <h3>Câu 16 ngốn <em>6 phút 40 giây.</em></h3>
                  <p>TNT ghi thời gian em thật sự dừng ở từng câu rồi so với định mức của phần thi. Câu 16 gấp <b>2,7 lần</b> định mức. Câu 8 chỉ 30 giây, nhanh quá nên đọc sót dữ kiện. Câu 21, 22 chưa kịp mở thì đã hết giờ.</p>
                </article>
                <article className="lp-step" data-step={2}>
                  <span className="lp-step-kicker">Lớp 3 · Tầng tư duy</span>
                  <h3>Vững Nhận biết, <em>hụt từ Thông hiểu.</em></h3>
                  <p>Xếp lại theo 4 mức độ, điểm rơi không rải đều. Tầng Nhận biết trọn 6/6 câu; khoảng trống bắt đầu từ Thông hiểu. Biết vậy thì không cần ôn lại từ đầu chương.</p>
                </article>
                <article className="lp-step" data-step={3}>
                  <span className="lp-step-kicker">Lớp 4 · Bài học</span>
                  <h3>3 bài giữ <em>toàn bộ 3.50 điểm rơi.</em></h3>
                  <p>Gom theo bài trong chương: Bài 1 rơi 1.50, Bài 3 rơi 1.25, Bài 2 rơi 0.75, còn Bài 4 không mất điểm nào. Chú ý vô nha: ôn đúng 3 bài này hiệu quả hơn ôn cả chương.</p>
                </article>
              </div>
            </div>
          </div>
        </section>
        {/* =====================================================================
         02 — BÁO CÁO 4 CHƯƠNG
         ===================================================================== */}
        <section className="lp-section" id="bao-cao" style={{background: 'var(--surface)', borderBlock: '1px solid var(--line-soft)'}}>
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Nộp bài xong</span>
              <h2 className="lp-h2">Em nhận một bản báo cáo <em>trả lời 3 câu hỏi.</em></h2>
              <p className="lp-lede">Đang ở đâu, vì sao mất điểm, làm gì tiếp. Màn hình đầu tiên đã trả lời đủ cả ba, đọc chưa tới 10 giây. Phần căn cứ và từng câu có lời giải nằm bên dưới khi em cần.</p>
            </div>
            <div className="lp-report lp-is-auto" id="lpReport">
              <div className="lp-rtabs" role="tablist" aria-label="Các chương của báo cáo">
                <button className="lp-rtab lp-is-active" role="tab" aria-selected="true" aria-controls="lpPn-0" id="lpTb-0" data-tab={0} type="button">
                  <span className="lp-rtab-k">Chương 0 · Tóm lược</span><span className="lp-rtab-q">Một màn hình, đủ ý</span>
                  <span className="lp-rtab-d">Điểm, vị trí, nguyên nhân chính và việc số 1, không cần cuộn.</span><span className="lp-rtab-bar"><i /></span>
                </button>
                <button className="lp-rtab" role="tab" aria-selected="false" aria-controls="lpPn-1" id="lpTb-1" data-tab={1} type="button">
                  <span className="lp-rtab-k">Chương 1 · Vị trí</span><span className="lp-rtab-q">Em đang đứng ở đâu?</span>
                  <span className="lp-rtab-d">So với các lượt làm cùng đề, ẩn danh. Đề ít lượt làm thì so với thang 4 nhóm năng lực.</span><span className="lp-rtab-bar"><i /></span>
                </button>
                <button className="lp-rtab" role="tab" aria-selected="false" aria-controls="lpPn-2" id="lpTb-2" data-tab={2} type="button">
                  <span className="lp-rtab-k">Chương 2 · Chẩn đoán</span><span className="lp-rtab-q">Vì sao mất điểm?</span>
                  <span className="lp-rtab-d">Mỗi điểm rơi được xếp vào một nhóm nguyên nhân, kèm căn cứ.</span><span className="lp-rtab-bar"><i /></span>
                </button>
                <button className="lp-rtab" role="tab" aria-selected="false" aria-controls="lpPn-3" id="lpTb-3" data-tab={3} type="button">
                  <span className="lp-rtab-k">Chương 3 · Hành động</span><span className="lp-rtab-q">Làm gì tiếp theo?</span>
                  <span className="lp-rtab-d">Tối đa 3 việc, xếp theo số điểm gỡ lại được, có thời lượng.</span><span className="lp-rtab-bar"><i /></span>
                </button>
              </div>
              <div className="lp-device">
                <div className="lp-device-bar"><span className="lp-device-dots" aria-hidden="true"><i /><i /><i /></span><span className="lp-device-url">toanhoctnt · Báo cáo năng lực</span><span className="lp-demo-tag">Minh họa</span></div>
                <div className="lp-panels">
                  <div className="lp-panel lp-is-active" role="tabpanel" id="lpPn-0" aria-labelledby="lpTb-0">
                    <div className="lp-p-kicker lp-anim">Báo cáo năng lực · Khảo sát Chương 1</div>
                    <div className="lp-p-title lp-anim" style={cv({"--d": '60ms'})}>Nền tảng ở mức khá. Điểm rơi dồn vào nhịp độ làm bài.</div>
                    <div className="lp-p-score lp-anim" style={cv({"--d": '140ms'})}><b id="lpPScore">6.50</b><span>/ 10</span></div>
                    <ul className="lp-p-rows">
                      <li className="lp-anim" style={cv({"--d": '260ms'})}><span className="lp-k">Vị trí</span><span className="lp-v">Trên 60% số lượt làm đề này</span></li>
                      <li className="lp-anim" style={cv({"--d": '360ms'})}><span className="lp-k">Nguyên nhân</span><span className="lp-v">Nhịp độ chiếm <em>2.00 / 3.50</em> điểm rơi</span></li>
                      <li className="lp-anim" style={cv({"--d": '460ms'})}><span className="lp-k">Việc số 1</span><span className="lp-v">Làm lại Câu 16, 21, 22 không bấm giờ</span></li>
                    </ul>
                  </div>
                  <div className="lp-panel" role="tabpanel" id="lpPn-1" aria-labelledby="lpTb-1">
                    <div className="lp-p-kicker lp-anim">Chương 1 · Vị trí</div>
                    <div className="lp-pos-big lp-anim" style={cv({"--d": '60ms'})}>60%<small>số lượt làm đề có điểm thấp hơn em · 42 lượt</small></div>
                    <div className="lp-dist lp-anim" style={cv({"--d": '120ms'})} id="lpDist" role="img" aria-label="Phân bố điểm ẩn danh của 42 lượt làm; điểm của em 6.50">
                      <div className="lp-dist-plot" id="lpDistPlot">
                        <span className="lp-marker" style={cv({"--x": 65})}><b>Em · 6.50</b><i /></span>
                      </div>
                      <div className="lp-axis" aria-hidden="true"><span style={{left: '0%'}}>0</span><span style={{left: '20%'}}>2</span><span style={{left: '40%'}}>4</span><span style={{left: '60%'}}>6</span><span style={{left: '80%'}}>8</span><span style={{left: '100%'}}>10</span></div>
                    </div>
                    <div className="lp-meters">
                      <div className="lp-anim" style={cv({"--d": '300ms'})}><div className="lp-meter-l">Phần I</div><div className="lp-meter-v">1.75 <small>/ 3.00</small></div><div className="lp-meter"><i style={cv({"--v": '.583', "--d": '400ms'})} /></div></div>
                      <div className="lp-anim" style={cv({"--d": '380ms'})}><div className="lp-meter-l">Phần II</div><div className="lp-meter-v">3.25 <small>/ 4.00</small></div><div className="lp-meter"><i style={cv({"--v": '.8125', "--d": '480ms'})} /></div></div>
                      <div className="lp-anim" style={cv({"--d": '460ms'})}><div className="lp-meter-l">Phần III</div><div className="lp-meter-v">1.50 <small>/ 3.00</small></div><div className="lp-meter"><i style={cv({"--v": '.5', "--d": '560ms'})} /></div></div>
                    </div>
                  </div>
                  <div className="lp-panel" role="tabpanel" id="lpPn-2" aria-labelledby="lpTb-2">
                    <div className="lp-p-kicker lp-anim">Chương 2 · Chẩn đoán</div>
                    <div className="lp-p-title lp-anim" style={cv({"--d": '60ms'})}>Vì sao mất 3.50 điểm</div>
                    <div className="lp-cause-rows">
                      <div className="lp-crow lp-anim" style={cv({"--d": '140ms'})}><b>Nhịp độ</b><span className="lp-track"><i style={cv({"--v": 1, "--w": '100%', "--d": '240ms'})} /></span><span className="lp-val">−2.00</span></div>
                      <div className="lp-crow lp-anim" style={cv({"--d": '220ms'})}><b>Thực thi</b><span className="lp-track"><i style={cv({"--v": '.25', "--w": '70%', "--d": '320ms'})} /></span><span className="lp-val">−0.50</span></div>
                      <div className="lp-crow lp-anim" style={cv({"--d": '300ms'})}><b>Kiến thức</b><span className="lp-track"><i style={cv({"--v": '.125', "--w": '46%', "--d": '400ms'})} /></span><span className="lp-val">−0.25</span></div>
                      <div className="lp-crow lp-unloc lp-anim" style={cv({"--d": '380ms'})}><b>Chưa định vị</b><span className="lp-track"><i style={cv({"--v": '.375', "--d": '480ms'})} /></span><span className="lp-val">−0.75</span></div>
                    </div>
                    <p className="lp-p-foot lp-anim" style={cv({"--d": '520ms'})}>Câu 16: 6 phút 40 giây, gấp 2,7 lần định mức. Câu 21, 22: chưa kịp mở trước khi hết giờ.</p>
                  </div>
                  <div className="lp-panel" role="tabpanel" id="lpPn-3" aria-labelledby="lpTb-3">
                    <div className="lp-p-kicker lp-anim">Chương 3 · Hành động</div>
                    <div className="lp-p-title lp-anim" style={cv({"--d": '60ms'})}>Kế hoạch 3 bước</div>
                    <ol className="lp-acts">
                      <li className="lp-anim" style={cv({"--d": '140ms'})}><span className="lp-n">01</span><span className="lp-t">Làm lại Câu 16, 21, 22 không bấm giờ</span><span className="lp-m">khoảng 20 phút · gỡ tới 1.75 điểm</span></li>
                      <li className="lp-anim" style={cv({"--d": '240ms'})}><span className="lp-n">02</span><span className="lp-t">Ôn lại Quy tắc tính đạo hàm (Lớp 11)</span><span className="lp-m">khoảng 25 phút · bài nền của Bài 1</span></li>
                      <li className="lp-anim" style={cv({"--d": '340ms'})}><span className="lp-n">03</span><span className="lp-t">Luyện lại trong Ôn tập câu sai</span><span className="lp-m">khoảng 15 phút mỗi buổi</span></li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
            <p className="lp-note" style={{marginTop: 18}}>Vị trí theo phần trăm chỉ hiện khi đề có từ 20 lượt làm lần đầu trở lên. Ít hơn, báo cáo dùng thang 4 nhóm năng lực: Củng cố nền · Tăng tốc · Vững · Bứt phá.</p>
          </div>
        </section>
        {/* =====================================================================
         03 — THÁC ĐIỂM RƠI
         ===================================================================== */}
        <section className="lp-section" id="mat-diem">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Chẩn đoán</span>
              <h2 className="lp-h2">Mất 3.50 điểm. <em>Điểm nào cũng có địa chỉ.</em></h2>
              <p className="lp-lede">Từ 10 điểm xuống 6.50, từng đoạn rơi được gắn với một nhóm nguyên nhân và những câu cụ thể. Rê chuột hoặc chạm vào từng cột để xem câu nào nằm trong đó.</p>
            </div>
            <div className="lp-loss">
              <div className="lp-chart-card">
                <div className="lp-chart-top"><h3>Từ 10 điểm xuống điểm của em</h3><span className="lp-demo-tag">Dữ liệu minh họa</span></div>
                <svg className="lp-wf" id="lpWf" role="img" aria-labelledby="lpWfDesc" />
                <table className="lp-sr-only" id="lpWfDesc">
                  <caption>Điểm rơi theo nhóm nguyên nhân</caption>
                  <tbody><tr><th>Mốc</th><th>Điểm</th></tr>
                    <tr><td>Điểm tối đa</td><td>10.00</td></tr><tr><td>Nhịp độ</td><td>−2.00</td></tr><tr><td>Thực thi</td><td>−0.50</td></tr>
                    <tr><td>Kiến thức</td><td>−0.25</td></tr><tr><td>Chưa định vị</td><td>−0.75</td></tr><tr><td>Điểm của em</td><td>6.50</td></tr>
                  </tbody></table>
              </div>
              <div>
                <div className="lp-causes">
                  <div className="lp-cause"><div className="lp-cause-h"><b>Nhịp độ</b><span>−2.00</span></div>
                    <p>Câu làm quá lâu, làm quá vội, hoặc chưa kịp mở trước khi hết giờ.</p>
                    <p className="lp-basis"><b>Căn cứ</b>thời gian từng câu so với định mức của phần thi</p></div>
                  <div className="lp-cause"><div className="lp-cause-h"><b>Thực thi</b><span>−0.50</span></div>
                    <p>Hướng làm đúng nhưng lệch ở một bước biến đổi hoặc tính toán.</p>
                    <p className="lp-basis"><b>Căn cứ</b>nhãn lỗi thầy đã đối soát cho phương án em chọn</p></div>
                  <div className="lp-cause"><div className="lp-cause-h"><b>Kiến thức</b><span>−0.25</span></div>
                    <p>Khái niệm hoặc định lý chưa chắc, nên chọn sai ngay từ hướng làm.</p>
                    <p className="lp-basis"><b>Căn cứ</b>nhãn lỗi thầy đã đối soát cho phương án em chọn</p></div>
                </div>
                <p className="lp-honest"><b>Chưa đủ căn cứ thì TNT ghi “Chưa định vị”</b>, không đoán bừa cho đẹp báo cáo. 0.75 điểm ở Câu 12 và Câu 20 đang nằm ở nhóm này.</p>
              </div>
            </div>
          </div>
        </section>
        {/* =====================================================================
         04 — QUY TRÌNH
         ===================================================================== */}
        <section className="lp-section" id="quy-trinh" style={{background: 'var(--surface)', borderBlock: '1px solid var(--line-soft)'}}>
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Cách làm</span>
              <h2 className="lp-h2">Từ lúc bấm nút <em>tới lúc có báo cáo.</em></h2>
              <p className="lp-lede">Không đăng ký trước, không cài ứng dụng. Thông tin cá nhân chỉ hỏi sau khi em nộp bài.</p>
            </div>
            <div className="lp-flow" id="lpFlow">
              <span className="lp-flow-line" aria-hidden="true"><i /></span>
              <div className="lp-fstep"><span className="lp-fdot">1</span><h3>Bấm làm bài</h3><p>Không cần tài khoản, không cần đăng nhập.</p>
                <div className="lp-fvis"><div className="lp-fv-btn">Làm bài miễn phí</div><div className="lp-fv-sub"><span>Mở từ Facebook</span><span>Vào thẳng đề</span></div></div></div>
              <div className="lp-fstep"><span className="lp-fdot">2</span><h3>{durationText ? `Làm bài ${durationText}` : "Làm bài"}</h3><p>{flowStep2Text}</p>
                <div className="lp-fvis"><div className="lp-fv-clock"><svg width={44} height={44} viewBox="0 0 44 44" aria-hidden="true"><circle cx={22} cy={22} r={18} fill="none" stroke="var(--line)" strokeWidth={4} /><circle cx={22} cy={22} r={18} fill="none" stroke="var(--brand)" strokeWidth={4} strokeLinecap="round" pathLength={100} strokeDasharray="62 100" transform="rotate(-90 22 22)" /></svg><div><b>56:12</b><div style={{color: 'var(--muted)'}}>còn lại</div></div></div><div className="lp-fv-sub"><span>Câu 9 / 22</span></div></div></div>
              <div className="lp-fstep"><span className="lp-fdot">3</span><h3>Nộp bài, điền vài dòng</h3><p>Họ tên, trường, tỉnh/thành, lớp. Email nếu em muốn.</p>
                <div className="lp-fvis"><div className="lp-fv-field">Họ tên</div><div className="lp-fv-field">Trường</div><div className="lp-fv-field">Tỉnh / Thành · Lớp</div><div className="lp-fv-field">Email <em>không bắt buộc</em></div></div></div>
              <div className="lp-fstep"><span className="lp-fdot">4</span><h3>Nhận báo cáo ngay</h3><p>Điểm, vị trí, nguyên nhân, 3 việc cần làm.</p>
                <div className="lp-fvis"><div className="lp-fv-mini-score">6.50</div><div className="lp-fv-mini-rows"><i style={{width: '90%'}} /><i style={{width: '74%'}} /><i style={{width: '82%'}} /></div></div></div>
              <div className="lp-fstep"><span className="lp-fdot">5</span><h3>Lưu hồ sơ nếu muốn</h3><p>Tạo tài khoản để gộp các đề sau vào một hồ sơ.</p>
                <div className="lp-fvis"><div className="lp-fv-lock"><div><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><rect x={3} y={7} width={10} height={7} rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg><b>Hồ sơ năng lực</b></div><span style={{color: 'var(--muted)'}}>Xu hướng điểm, lỗi lặp lại, ôn tập câu sai</span><span className="lp-fv-opt">Không bắt buộc</span></div></div></div>
            </div>
            <div className="lp-privacy">
              <svg width={20} height={20} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 1.5l5 2v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4z" /><path d="M5.5 8l2 2 3-3.5" /></svg>
              <span><b>Điểm của em không công khai với ai.</b> Phần so sánh vị trí chỉ dùng phân bố điểm ẩn danh: em thấy mình đứng ở đâu, nhưng không thấy điểm của bất kỳ bạn nào.</span>
            </div>
          </div>
        </section>
        {/* =====================================================================
         05 — HỒ SƠ NHIỀU ĐỀ (lý do tạo tài khoản)
         ===================================================================== */}
        <section className="lp-section" id="ho-so">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Khi có tài khoản</span>
              <h2 className="lp-h2">Một đề cho biết kết quả. <em>Nhiều đề cho biết quá trình.</em></h2>
              <p className="lp-lede">Báo cáo đầu tiên đã đủ dùng. Nếu em làm tiếp các đề sau trong cùng một hồ sơ, TNT nhìn được những thứ mà một đề không đủ dữ liệu để thấy.</p>
            </div>
            <div className="lp-profile-grid">
              <div className="lp-card lp-card-wide">
                <span className="lp-card-k">Truy vết gốc</span>
                <h3>Đôi khi gốc của điểm rơi nằm ở lớp dưới.</h3>
                <p>Đối chiếu các bài trong đề với bài nền tảng ở Lớp 11, dựa trên kết quả tích lũy qua nhiều đề.</p>
                <div className="lp-chain" id="lpChain">
                  <svg className="lp-chain-svg" id="lpChainSvg" aria-hidden="true" />
                  <div className="lp-chain-col">
                    <span className="lp-chain-col-h">Lớp 11 · bài nền tảng</span>
                    <div className="lp-node lp-is-path lp-is-origin" id="lpN-qt"><b>Quy tắc tính đạo hàm</b><span>Tích lũy: đúng 40% · 5 câu</span></div>
                    <div className="lp-node" id="lpN-hh"><b>Đạo hàm của hàm hợp</b><span>Tích lũy: đúng 78% · 9 câu</span></div>
                    <div className="lp-node" id="lpN-gh"><b>Giới hạn của hàm số</b><span>Tích lũy: đúng 82% · 6 câu</span></div>
                  </div>
                  <div className="lp-chain-col">
                    <span className="lp-chain-col-h">Lớp 12 · bài trong đề</span>
                    <div className="lp-node lp-is-path lp-is-target" id="lpN-b1"><b>Bài 1 · Đơn điệu và cực trị</b><span>Rơi −1.50 điểm ở đề này</span></div>
                    <div className="lp-node" id="lpN-b3"><b>Bài 3 · Tiệm cận</b><span>Rơi −1.25 điểm</span></div>
                    <div className="lp-node" id="lpN-b2"><b>Bài 2 · GTLN và GTNN</b><span>Rơi −0.75 điểm</span></div>
                  </div>
                </div>
                <p className="lp-chain-explain">Bài 1 rơi nhiều điểm nhất, và bài nền của nó là Quy tắc tính đạo hàm, nơi em mới đúng 40% qua 5 câu ở các đề trước. Ôn lại bài nền có thể gỡ được nhiều hơn là chỉ làm thêm bài tập Bài 1.</p>
                <p className="lp-disclaimer">Đây là gợi ý dựa trên số liệu, không phải kết luận chắc chắn. Càng nhiều đề trong hồ sơ, gợi ý càng đáng tin.</p>
              </div>
              <div className="lp-card">
                <span className="lp-card-k">Xu hướng</span>
                <h3>Điểm qua 5 đề gần nhất</h3>
                <svg className="lp-trend" id="lpTrend" role="img" aria-label="Điểm 5 đề: 5.25, 5.75, 6.50, 6.25, 7.25" />
                <div className="lp-pattern" aria-label="Một mẫu lỗi lặp lại qua các đề">
                  <span style={{fontWeight: 600}}>Lỗi lặp lại “xét dấu y′ khi có nghiệm kép”:</span>
                  <span className="lp-pi lp-is-hit">Đề 1</span><span className="lp-pi lp-is-hit">Đề 3</span>
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                  <span className="lp-pi lp-is-fix">Đề 5 đã làm đúng</span>
                </div>
              </div>
              <div className="lp-card">
                <span className="lp-card-k">Ôn tập câu sai</span>
                <h3>Câu sai chỉ rời danh sách khi đúng 3 buổi liền.</h3>
                <p>Mỗi lần mở màn hình ôn tập là một buổi. Sai giữa chừng thì đếm lại từ đầu, để chắc là em hiểu chứ không phải nhớ đáp án.</p>
                <div className="lp-leit" id="lpLeit" aria-label="Minh họa: Câu 16 qua các buổi ôn tập">
                  <div className="lp-leit-row"><span>Lượt 1</span><span className="lp-lbox">Buổi 1</span><span className="lp-lbox">Buổi 2</span><span className="lp-lbox">Buổi 3</span><span className="lp-leit-res">—</span></div>
                  <div className="lp-leit-row"><span>Lượt 2</span><span className="lp-lbox">Buổi 4</span><span className="lp-lbox">Buổi 5</span><span className="lp-lbox">Buổi 6</span><span className="lp-leit-res">—</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* =====================================================================
         06 — CHUYỂN CẢNH: THẺ NHỎ BUNG THÀNH CTA TOÀN MÀN HÌNH
         ===================================================================== */}
        <section className="lp-finale" id="lpFinale" aria-label="Bắt đầu làm bài">
          <div className="lp-finale-sticky" id="lpFinaleSticky">
            <div className="lp-finale-card" id="lpFinaleCard">
              <div className="lp-k">Đến lượt em</div>
              <div className="lp-t">{finaleText}</div>
              <div className="lp-s">Kéo xuống để bắt đầu</div>
            </div>
            <div className="lp-finale-bg" id="lpFinaleBg" aria-hidden="true" />
            <div className="lp-finale-b" id="lpFinaleB">
              <span className="lp-k">Miễn phí · Không cần tài khoản</span>
              <h2>Thử một đề. Xem TNT đọc được gì từ bài làm của em.</h2>
              <p>Thầy làm cái này vì tin rằng một con điểm không nói hết được một bạn học sinh. Phần còn lại nằm trong cách em làm bài.</p>
              <button className="lp-btn lp-btn-light" type="button" onClick={onStart}>Làm bài miễn phí
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
              </button>
              <ul className="lp-assure"><li><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>{metaText}</li><li><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>Có báo cáo ngay khi nộp</li></ul>
            </div>
          </div>
        </section>
        {/* =====================================================================
         07 — HỎI ĐÁP
         ===================================================================== */}
        <section className="lp-section" id="hoi-dap">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <span className="lp-eyebrow">Hỏi đáp</span>
              <h2 className="lp-h2">Vài điều em hay hỏi.</h2>
            </div>
            <div className="lp-faq">
              <details><summary>Làm đề có mất phí không?<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></summary>
                <div className="lp-a">Không. Đề khảo sát này miễn phí, báo cáo sau khi nộp cũng miễn phí.</div></details>
              <details><summary>Có bắt buộc tạo tài khoản không?<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></summary>
                <div className="lp-a">Không. Em làm bài ngay, nộp xong điền họ tên, trường, tỉnh/thành và lớp là xem được báo cáo. Tài khoản chỉ cần khi em muốn lưu hồ sơ qua nhiều đề.</div></details>
              <details><summary>Làm trên điện thoại được không?<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></summary>
                <div className="lp-a">Được. Nhưng đề có hình và bảng biến thiên, nên nếu có máy tính hoặc máy tính bảng thì em sẽ đọc đề thoải mái hơn.</div></details>
              <details><summary>Điểm của em có bị người khác thấy không?<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></summary>
                <div className="lp-a">Không. Phần so sánh vị trí dùng phân bố điểm ẩn danh. Không ai thấy tên hay điểm của em trong đó.</div></details>
              <details><summary>Báo cáo dựa vào đâu mà nói em mất điểm vì nhịp độ hay vì kiến thức?<svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg></summary>
                <div className="lp-a">Dựa vào thời gian em dừng ở từng câu, đáp án em chọn, và nhãn lỗi thầy đã đối soát cho từng phương án sai. Câu nào chưa đủ căn cứ thì báo cáo ghi rõ là chưa định vị.</div></details>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap">
          <span><b style={{color: 'var(--ink)'}}>Toán học TNT</b> · Thầy Tường</span>
          <span>Các hình mẫu trên trang dùng dữ liệu minh họa, không phải bài làm của em.</span>
        </div>
      </footer>
      <div className="lp-mbar" id="lpMbar">
        <div className="lp-mbar-t"><b>{exam?.title ?? "Đề Toán miễn phí"}</b><span>{metaText} · miễn phí</span></div>
        <button className="lp-btn lp-btn-primary lp-btn-sm" type="button" onClick={onStart}>Làm bài</button>
      </div>
      <div className="lp-tip" id="lpTip" role="tooltip" />
      {modal}
    </div>

  );
}
