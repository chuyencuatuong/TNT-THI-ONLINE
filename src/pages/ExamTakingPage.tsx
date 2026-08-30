import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { getAssignmentStatus } from "../lib/examAssignment";
import {
  AUTO_CANCEL_THRESHOLD,
  INVALIDATED_REASON_TOO_MANY_EXITS,
  VIOLATION_GRACE_PERIOD_MS,
  shouldAutoCancel,
  violationModalMessage,
  violationModalTitle,
  violationSeverity,
} from "../lib/proctoring";
import type {
  ExamQuestionRow,
  ExamRow,
  Part1Answer,
  Part2Answer,
  Part3Answer,
  QuestionRow,
} from "../lib/types";
import { Part1Question } from "../components/Part1Question";
import { Part2Question } from "../components/Part2Question";
import { Part3Question } from "../components/Part3Question";

type AnyAnswer = Part1Answer | Partial<Part2Answer> | Part3Answer;

/** Trạng thái "cửa vào" bài thi — tách khỏi việc tải câu hỏi để có thể chặn
 * (chưa mở khoá / đã khoá) hoặc yêu cầu xác nhận (đề nghiêm túc) TRƯỚC khi
 * thật sự tạo 1 lượt làm bài mới trong CSDL. */
type Phase = "loading" | "not_unlocked" | "locked" | "confirm" | "taking";

const PART_LABELS: Record<1 | 2 | 3, string> = {
  1: "Phần 1. Trắc nghiệm 4 phương án",
  2: "Phần 2. Đúng - Sai",
  3: "Phần 3. Trả lời ngắn",
};

function formatCountdown(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ExamTakingPage() {
  const { examId } = useParams<{ examId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("loading");
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [items, setItems] = useState<(ExamQuestionRow & { question: QuestionRow })[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnyAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationModal, setViolationModal] = useState<{ count: number } | null>(null);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const visibleSince = useRef<Set<string>>(new Set());
  const attemptIdRef = useRef<string | null>(null);
  const autoSubmitted = useRef(false);
  const invalidatedRef = useRef(false);
  const violationCountRef = useRef(0);
  const submitRef = useRef<() => void>(() => {});
  // Đếm ngược "khoảng đệm" (VIOLATION_GRACE_PERIOD_MS) cho mỗi lần rời trang
  // — chỉ tính là vi phạm thật sự nếu vẫn còn rời trang khi hết khoảng đệm.
  const awayTimers = useRef<Partial<Record<"tab_hidden" | "fullscreen_exit", ReturnType<typeof setTimeout>>>>({});

  const isStrict = exam?.mode === "nghiem_tuc";

  // Bước 1: tải thông tin đề trước — quyết định có được vào làm bài luôn hay
  // không (đề "được chỉ định" ngoài khung giờ mở/khoá, hoặc đề nghiêm túc cần
  // xác nhận trước). CHƯA tạo lượt làm bài ở bước này.
  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    api.getExam(examId).then((examRow) => {
      if (cancelled || !examRow) return;
      setExam(examRow);
      const status = getAssignmentStatus(examRow, Date.now());
      if (status === "before_unlock") setPhase("not_unlocked");
      else if (status === "after_lock") setPhase("locked");
      else if (examRow.mode === "nghiem_tuc") setPhase("confirm");
      else setPhase("taking");
    });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  // Bước 2: chỉ chạy khi đã qua "cửa vào" (phase === "taking") — tạo lượt làm
  // bài + tải câu hỏi. Việc chặn ngoài khung giờ còn được chặn LẦN NỮA ở tầng
  // server (trigger check_exam_assignment_window, migration_010) — nếu học
  // sinh lách qua bước 1 bằng cách chỉnh giờ máy, insert dưới đây vẫn bị chặn.
  useEffect(() => {
    if (phase !== "taking" || !examId || !profile || attemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const [exQuestions, attempt] = await Promise.all([
          api.getExamQuestions(examId),
          api.startAttempt(examId, profile.id),
        ]);
        if (cancelled) return;
        setItems(exQuestions);
        setAttemptId(attempt.id);
        attemptIdRef.current = attempt.id;
        if (exam?.duration_minutes) {
          const deadline =
            new Date(attempt.started_at).getTime() + exam.duration_minutes * 60_000;
          setRemainingSeconds(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
        }
        if (exam?.mode === "nghiem_tuc" && !document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {
            /* trình duyệt có thể chặn — không quan trọng, bỏ qua */
          });
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("exam_not_unlocked_yet")) setPhase("not_unlocked");
        else if (msg.includes("exam_locked")) setPhase("locked");
        else {
          console.error(err);
          alert("Có lỗi khi bắt đầu làm bài, vui lòng thử lại.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, examId, profile?.id, attemptId]);

  // Đếm ngược thời gian, tự động nộp bài khi hết giờ.
  useEffect(() => {
    if (remainingSeconds === null) return;
    if (remainingSeconds <= 0) {
      if (!autoSubmitted.current) {
        autoSubmitted.current = true;
        submitRef.current();
      }
      return;
    }
    const timer = setInterval(() => {
      setRemainingSeconds((s) => (s === null ? null : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(timer);
  }, [remainingSeconds]);

  // Theo dõi câu hỏi nào đang hiện trong màn hình để tính thời gian tập trung
  // vào từng câu (cộng dồn qua nhiều lượt xem, xem diagnosis.ts).
  useEffect(() => {
    if (items.length === 0 || !attemptId) return;

    function flushLeave(questionId: string) {
      if (!visibleSince.current.has(questionId)) return;
      visibleSince.current.delete(questionId);
      api
        .logQuestionViewEvent({
          attempt_id: attemptIdRef.current!,
          question_id: questionId,
          event_type: "leave",
        })
        .catch((err) => console.error("Không ghi được view_event (leave):", err));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const questionId = entry.target.getAttribute("data-question-id");
          if (!questionId) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!visibleSince.current.has(questionId)) {
              visibleSince.current.add(questionId);
              api
                .logQuestionViewEvent({
                  attempt_id: attemptIdRef.current!,
                  question_id: questionId,
                  event_type: "enter",
                })
                .catch((err) => console.error("Không ghi được view_event (enter):", err));
            }
            setActiveQuestionId(questionId);
          } else {
            flushLeave(questionId);
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );

    for (const it of items) {
      const el = questionRefs.current[it.question_id];
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
      // Rời trang / đổi đề giữa chừng -> đóng lại các lượt xem đang mở.
      for (const id of Array.from(visibleSince.current)) flushLeave(id);
    };
  }, [items, attemptId]);

  function logEvent(questionId: string, value: AnyAnswer, isFirstAnswer: boolean) {
    if (!attemptId) return;
    api
      .logAnswerEvent({
        attempt_id: attemptId,
        question_id: questionId,
        event_type: isFirstAnswer ? "select" : "change",
        answer_value: value,
      })
      .catch((err) => console.error("Không ghi được answer_event:", err));
  }

  function handleAnswerChange(question: QuestionRow, value: AnyAnswer) {
    const isFirst = answers[question.id] === undefined;
    setAnswers((prev) => ({ ...prev, [question.id]: value }));

    if (question.part === 3) {
      // Gõ chữ liên tục -> gộp log lại, chỉ ghi sau khi ngừng gõ 800ms
      clearTimeout(debounceTimers.current[question.id]);
      debounceTimers.current[question.id] = setTimeout(() => {
        logEvent(question.id, value, isFirst);
      }, 800);
    } else {
      logEvent(question.id, value, isFirst);
    }
  }

  async function handleSubmit() {
    if (!attemptIdRef.current || !examId || submitting || invalidatedRef.current) return;
    const unanswered = items.filter((it) => answers[it.question.id] === undefined).length;
    if (unanswered > 0 && !autoSubmitted.current) {
      const ok = confirm(
        `Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await api.submitAttempt(attemptIdRef.current, examId, profile?.id);
      navigate(`/ket-qua/${attemptIdRef.current}`);
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi nộp bài, vui lòng thử lại.");
      setSubmitting(false);
    }
  }
  submitRef.current = handleSubmit;

  /** Bài bị TỰ ĐỘNG huỷ vì rời trang quá số lần cho phép (chỉ áp dụng đề chế
   * độ nghiêm túc) — nộp thẳng luôn, không hỏi xác nhận như handleSubmit. */
  async function invalidateAndSubmit() {
    if (!attemptIdRef.current || !examId || invalidatedRef.current) return;
    invalidatedRef.current = true;
    setSubmitting(true);
    try {
      await api.submitAttempt(
        attemptIdRef.current,
        examId,
        profile?.id,
        INVALIDATED_REASON_TOO_MANY_EXITS,
      );
    } catch (err) {
      console.error("Không nộp được bài bị huỷ:", err);
    } finally {
      navigate(`/ket-qua/${attemptIdRef.current}`);
    }
  }

  function handleBack() {
    const ok = confirm("Thoát khỏi bài làm? Các câu đã trả lời vẫn được lưu, bạn có thể vào làm tiếp sau.");
    if (ok) navigate("/hoc-sinh");
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        /* trình duyệt có thể chặn — không quan trọng, bỏ qua */
      });
    }
  }

  function handleConfirmStrictMode() {
    setPhase("taking");
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /** Đăng ký 1 lần vi phạm THẬT SỰ (đã qua khoảng đệm) — hiện cảnh báo giữa
   * màn hình, hoặc huỷ + nộp bài luôn nếu đã vượt ngưỡng cho phép. */
  function registerViolation() {
    if (invalidatedRef.current) return;
    violationCountRef.current += 1;
    const count = violationCountRef.current;
    if (shouldAutoCancel(count)) {
      setViolationModal(null);
      void invalidateAndSubmit();
    } else {
      setViolationModal({ count });
    }
  }

  function clearAwayTimer(kind: "tab_hidden" | "fullscreen_exit") {
    const timer = awayTimers.current[kind];
    if (timer) {
      clearTimeout(timer);
      delete awayTimers.current[kind];
    }
  }

  function startAwayTimer(kind: "tab_hidden" | "fullscreen_exit") {
    clearAwayTimer(kind);
    awayTimers.current[kind] = setTimeout(() => {
      delete awayTimers.current[kind];
      registerViolation();
    }, VIOLATION_GRACE_PERIOD_MS);
  }

  // Giám sát trong lúc làm bài: ghi lại các dấu hiệu khả nghi (rời tab, thoát
  // toàn màn hình) cho giáo viên xem sau, đồng thời CHẶN hẳn việc sao chép đề
  // hoặc dán nội dung vào bài làm. Đây chỉ là công cụ giảm bớt gian lận dễ
  // dàng, không thể ngăn học sinh dùng thiết bị khác để tra cứu.
  //
  // Ở đề "nghiêm túc": mỗi lần rời tab/thoát fullscreen ĐÃ QUÁ khoảng đệm
  // VIOLATION_GRACE_PERIOD_MS (rời dưới ngưỡng này vẫn ghi log như bình
  // thường nhưng KHÔNG tính vi phạm — tránh oan vì lỗi máy/thông báo hệ
  // thống thoáng qua) mới hiện cảnh báo giữa màn hình và cộng vào bộ đếm huỷ
  // bài (xem src/lib/proctoring.ts). Đề "thoải mái" vẫn ghi log như cũ để
  // giáo viên tham khảo nhưng KHÔNG đếm/không huỷ — giữ đúng tinh thần luyện
  // tập nhẹ nhàng.
  useEffect(() => {
    if (!attemptId) return;

    function logRaw(type: api.ProctoringEventType) {
      api
        .logProctoringEvent({ attempt_id: attemptIdRef.current!, event_type: type })
        .catch((err) => console.error("Không ghi được proctoring_event:", err));
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        logRaw("tab_hidden");
        if (isStrict) startAwayTimer("tab_hidden");
      } else {
        logRaw("tab_visible");
        clearAwayTimer("tab_hidden");
      }
    };
    const onBlur = () => logRaw("window_blur");
    const onFocus = () => logRaw("window_focus");
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        logRaw("fullscreen_exit");
        if (isStrict) startAwayTimer("fullscreen_exit");
      } else {
        clearAwayTimer("fullscreen_exit");
      }
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logRaw("copy_attempt");
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logRaw("paste_attempt");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      clearAwayTimer("tab_hidden");
      clearAwayTimer("fullscreen_exit");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, isStrict]);

  function scrollToQuestion(questionId: string) {
    questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (phase === "loading") return <div className="page-loading">Đang tải đề thi...</div>;

  if (phase === "not_unlocked") {
    return (
      <div className="exam-gate">
        <div className="exam-gate-icon">🔒</div>
        <h2>Chưa đến giờ mở đề</h2>
        <p className="empty-hint">
          {exam?.title} sẽ mở khoá lúc{" "}
          <strong>{exam?.assigned_unlock_at ? formatDateTime(exam.assigned_unlock_at) : ""}</strong>.
          Quay lại đúng giờ để bắt đầu làm bài nhé.
        </p>
        <Link className="btn-secondary" to="/hoc-sinh">
          ← Về trang chủ
        </Link>
      </div>
    );
  }

  if (phase === "locked") {
    return (
      <div className="exam-gate">
        <div className="exam-gate-icon">🔒</div>
        <h2>Đề thi đã đóng</h2>
        <p className="empty-hint">
          {exam?.title} đã hết hạn làm bài
          {exam?.assigned_lock_at ? ` lúc ${formatDateTime(exam.assigned_lock_at)}` : ""}. Liên hệ
          giáo viên nếu bạn cần làm bù.
        </p>
        <Link className="btn-secondary" to="/hoc-sinh">
          ← Về trang chủ
        </Link>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div className="exam-gate exam-gate--strict">
        <div className="exam-gate-icon">📋</div>
        <h2>Phòng thi nghiêm túc</h2>
        <p className="exam-gate-exam-title">{exam?.title}</p>
        <ul className="exam-gate-rules">
          <li>Bài làm cần được thực hiện ở chế độ toàn màn hình trong suốt thời gian thi.</li>
          <li>Hệ thống ghi nhận thời điểm mỗi lần bạn rời tab hoặc thoát toàn màn hình.</li>
          <li>
            Rời trang quá {AUTO_CANCEL_THRESHOLD} lần, bài làm sẽ tự động bị huỷ (điểm không được
            công nhận). Rời trang dưới 3 giây (ví dụ lỗi phát sinh trên máy) sẽ không bị tính vào
            số lần vi phạm.
          </li>
          <li>Không thể sao chép đề hoặc dán nội dung vào bài làm.</li>
        </ul>
        <button className="btn-primary" onClick={handleConfirmStrictMode}>
          Tôi đã hiểu, bắt đầu làm bài
        </button>
      </div>
    );
  }

  if (!attemptId) return <div className="page-loading">Đang tải đề thi...</div>;

  const numberMap: Record<string, number> = {};
  items.forEach((it, i) => {
    numberMap[it.question_id] = i + 1;
  });
  const byPart: Record<1 | 2 | 3, (ExamQuestionRow & { question: QuestionRow })[]> = {
    1: items.filter((i) => i.part === 1),
    2: items.filter((i) => i.part === 2),
    3: items.filter((i) => i.part === 3),
  };
  const answeredCount = Object.keys(answers).length;

  return (
    <div className={`exam-page ${isStrict ? "exam-page--strict" : ""}`}>
      {violationModal && (
        <div className="exam-violation-backdrop">
          <div
            className={`exam-violation-modal exam-violation-modal--level-${
              violationSeverity(violationModal.count) ?? 3
            }`}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="exam-violation-modal-title">{violationModalTitle(violationModal.count)}</div>
            <p className="exam-violation-modal-message">{violationModalMessage(violationModal.count)}</p>
            <button
              className="btn-primary exam-violation-modal-btn"
              onClick={() => setViolationModal(null)}
            >
              Tôi cam kết làm bài nghiêm túc
            </button>
          </div>
        </div>
      )}

      <div className="exam-topbar">
        <button className="btn-link exam-back" onClick={handleBack}>
          ← Quay lại
        </button>
        <div className="exam-title-block">
          <div className="exam-title">
            {exam?.title ?? "Bài kiểm tra"}
            {isStrict && <span className="exam-strict-badge">Nghiêm túc</span>}
          </div>
          <div className="exam-progress">
            Đã trả lời {answeredCount}/{items.length} câu
          </div>
        </div>
        {remainingSeconds !== null && (
          <div className={`exam-timer ${remainingSeconds < 60 ? "exam-timer--danger" : ""}`}>
            ⏱ {formatCountdown(remainingSeconds)}
          </div>
        )}
        <button className="btn-secondary" onClick={toggleFullscreen}>
          {isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
        </button>
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Đang nộp..." : "Nộp bài"}
        </button>
      </div>

      <p className="exam-proctor-notice">
        {isStrict
          ? `Phòng thi nghiêm túc: hệ thống ghi nhận thời điểm mỗi lần bạn rời tab/thoát toàn màn hình. Rời trang quá ${AUTO_CANCEL_THRESHOLD} lần, bài làm sẽ tự động bị huỷ.`
          : "Hệ thống ghi nhận nếu bạn rời khỏi tab/cửa sổ làm bài hoặc thoát toàn màn hình, và không cho phép sao chép/dán nội dung trong lúc thi. Nên bấm \"Toàn màn hình\" trước khi bắt đầu."}
      </p>

      <div className="exam-body">
        <div className="exam-questions">
          {([1, 2, 3] as const).map(
            (part) =>
              byPart[part].length > 0 && (
                <section key={part}>
                  <h3 className="part-title">{PART_LABELS[part]}</h3>
                  {byPart[part].map((it) => (
                    <div
                      key={it.question_id}
                      data-question-id={it.question_id}
                      ref={(el) => {
                        questionRefs.current[it.question_id] = el;
                      }}
                    >
                      {part === 1 && (
                        <Part1Question
                          number={numberMap[it.question_id]}
                          question={it.question}
                          value={(answers[it.question.id] as Part1Answer) ?? null}
                          onChange={(v) => handleAnswerChange(it.question, v)}
                        />
                      )}
                      {part === 2 && (
                        <Part2Question
                          number={numberMap[it.question_id]}
                          question={it.question}
                          value={(answers[it.question.id] as Partial<Part2Answer>) ?? null}
                          onChange={(v) => handleAnswerChange(it.question, v)}
                        />
                      )}
                      {part === 3 && (
                        <Part3Question
                          number={numberMap[it.question_id]}
                          question={it.question}
                          value={(answers[it.question.id] as Part3Answer) ?? null}
                          onChange={(v) => handleAnswerChange(it.question, v)}
                        />
                      )}
                    </div>
                  ))}
                </section>
              ),
          )}

          <button className="btn-primary btn-submit" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Đang nộp bài..." : "Nộp bài"}
          </button>
        </div>

        <aside className="exam-sidebar">
          <div className="exam-sidebar-title">Danh sách câu hỏi</div>
          {([1, 2, 3] as const).map(
            (part) =>
              byPart[part].length > 0 && (
                <div key={part} className="exam-sidebar-group">
                  <div className="exam-sidebar-group-title">Phần {part}</div>
                  <div className="exam-sidebar-grid">
                    {byPart[part].map((it) => {
                      const num = numberMap[it.question_id];
                      const answered = answers[it.question.id] !== undefined;
                      const isActive = activeQuestionId === it.question_id;
                      return (
                        <button
                          key={it.question_id}
                          type="button"
                          className={[
                            "exam-nav-btn",
                            answered ? "exam-nav-btn--answered" : "",
                            isActive ? "exam-nav-btn--active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => scrollToQuestion(it.question_id)}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
          )}
        </aside>
      </div>
    </div>
  );
}
