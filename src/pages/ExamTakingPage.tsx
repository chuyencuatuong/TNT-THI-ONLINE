import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
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

export function ExamTakingPage() {
  const { examId } = useParams<{ examId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [items, setItems] = useState<(ExamQuestionRow & { question: QuestionRow })[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnyAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const visibleSince = useRef<Set<string>>(new Set());
  const attemptIdRef = useRef<string | null>(null);
  const autoSubmitted = useRef(false);
  const submitRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!examId || !profile) return;
    let cancelled = false;
    (async () => {
      const [exQuestions, attempt, examRow] = await Promise.all([
        api.getExamQuestions(examId),
        api.startAttempt(examId, profile.id),
        api.getExam(examId),
      ]);
      if (cancelled) return;
      setItems(exQuestions);
      setAttemptId(attempt.id);
      attemptIdRef.current = attempt.id;
      setExam(examRow);
      if (examRow?.duration_minutes) {
        const deadline =
          new Date(attempt.started_at).getTime() + examRow.duration_minutes * 60_000;
        setRemainingSeconds(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, profile?.id]);

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
    if (!attemptIdRef.current || !examId || submitting) return;
    const unanswered = items.filter((it) => answers[it.question.id] === undefined).length;
    if (unanswered > 0 && !autoSubmitted.current) {
      const ok = confirm(
        `Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await api.submitAttempt(attemptIdRef.current, examId);
      navigate(`/ket-qua/${attemptIdRef.current}`);
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi nộp bài, vui lòng thử lại.");
      setSubmitting(false);
    }
  }
  submitRef.current = handleSubmit;

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

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function scrollToQuestion(questionId: string) {
    questionRefs.current[questionId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (loading) return <div className="page-loading">Đang tải đề thi...</div>;

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
    <div className="exam-page">
      <div className="exam-topbar">
        <button className="btn-link exam-back" onClick={handleBack}>
          ← Quay lại
        </button>
        <div className="exam-title-block">
          <div className="exam-title">{exam?.title ?? "Bài kiểm tra"}</div>
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
