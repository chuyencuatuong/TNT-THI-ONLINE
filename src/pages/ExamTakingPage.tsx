import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import type {
  ExamQuestionRow,
  Part1Answer,
  Part2Answer,
  Part3Answer,
  QuestionRow,
} from "../lib/types";
import { Part1Question } from "../components/Part1Question";
import { Part2Question } from "../components/Part2Question";
import { Part3Question } from "../components/Part3Question";

type AnyAnswer = Part1Answer | Partial<Part2Answer> | Part3Answer;

export function ExamTakingPage() {
  const { examId } = useParams<{ examId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [examTitle, setExamTitle] = useState("");
  const [items, setItems] = useState<(ExamQuestionRow & { question: QuestionRow })[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnyAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!examId || !profile) return;
    let cancelled = false;
    (async () => {
      const [exQuestions, attempt] = await Promise.all([
        api.getExamQuestions(examId),
        api.startAttempt(examId, profile.id),
      ]);
      if (cancelled) return;
      setItems(exQuestions);
      setAttemptId(attempt.id);
      const { data } = await import("../lib/supabaseClient").then((m) =>
        m.supabase.from("exams").select("title").eq("id", examId).single(),
      );
      setExamTitle(data?.title ?? "Bài kiểm tra");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, profile?.id]);

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
    if (!attemptId || !examId) return;
    const unanswered = items.filter((it) => answers[it.question.id] === undefined).length;
    if (unanswered > 0) {
      const ok = confirm(
        `Bạn còn ${unanswered} câu chưa trả lời. Vẫn muốn nộp bài?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await api.submitAttempt(attemptId, examId);
      navigate(`/ket-qua/${attemptId}`);
    } catch (err) {
      console.error(err);
      alert("Có lỗi khi nộp bài, vui lòng thử lại.");
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-loading">Đang tải đề thi...</div>;

  const part1Items = items.filter((i) => i.part === 1);
  const part2Items = items.filter((i) => i.part === 2);
  const part3Items = items.filter((i) => i.part === 3);
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="exam-page">
      <div className="exam-sticky-header">
        <h2>{examTitle}</h2>
        <span className="exam-progress">
          Đã trả lời {answeredCount}/{items.length} câu
        </span>
      </div>

      {part1Items.length > 0 && (
        <section>
          <h3 className="part-title">Phần 1. Trắc nghiệm 4 phương án</h3>
          {part1Items.map((it, idx) => (
            <Part1Question
              key={it.question_id}
              index={idx}
              question={it.question}
              value={(answers[it.question.id] as Part1Answer) ?? null}
              onChange={(v) => handleAnswerChange(it.question, v)}
            />
          ))}
        </section>
      )}

      {part2Items.length > 0 && (
        <section>
          <h3 className="part-title">Phần 2. Đúng - Sai</h3>
          {part2Items.map((it, idx) => (
            <Part2Question
              key={it.question_id}
              index={idx}
              question={it.question}
              value={(answers[it.question.id] as Partial<Part2Answer>) ?? null}
              onChange={(v) => handleAnswerChange(it.question, v)}
            />
          ))}
        </section>
      )}

      {part3Items.length > 0 && (
        <section>
          <h3 className="part-title">Phần 3. Trả lời ngắn</h3>
          {part3Items.map((it, idx) => (
            <Part3Question
              key={it.question_id}
              index={idx}
              question={it.question}
              value={(answers[it.question.id] as Part3Answer) ?? null}
              onChange={(v) => handleAnswerChange(it.question, v)}
            />
          ))}
        </section>
      )}

      <button className="btn-primary btn-submit" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Đang nộp bài..." : "Nộp bài"}
      </button>
    </div>
  );
}
