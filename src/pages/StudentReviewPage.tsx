import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { questionMaxScore } from "../lib/api";
import { scorePart1Question, scorePart2Question, scorePart3Question } from "../lib/scoring";
import { MathText } from "../components/MathText";
import { Part1Question } from "../components/Part1Question";
import { Part2Question } from "../components/Part2Question";
import { Part3Question } from "../components/Part3Question";
import type {
  Part1Answer,
  Part2Answer,
  Part3Answer,
  QuestionRow,
  WrongAnswerJournalRow,
} from "../lib/types";

const REVIEW_BATCH_SIZE = 10;

type AnyAnswer = Part1Answer | Partial<Part2Answer> | Part3Answer;

/**
 * Chấm 1 câu ôn tập bằng đúng bộ máy chấm điểm đã dùng cho đề thi thật
 * (scoring.ts) — "đúng" ở đây nghĩa là ĐẠT TRỌN ĐIỂM (không tính đúng 1 phần
 * cho Phần 2), vì mục tiêu ôn tập là chắc hẳn, không phải "gần đúng".
 */
function isFullyCorrect(question: QuestionRow, answer: AnyAnswer | null): boolean {
  const maxScore = questionMaxScore(question);
  if (question.part === 1) {
    const score = scorePart1Question(
      (question.correct_answer as Part1Answer).choice,
      (answer as Part1Answer | null)?.choice ?? null,
    );
    return score >= maxScore;
  }
  if (question.part === 2) {
    const { score } = scorePart2Question(
      question.correct_answer as Part2Answer,
      answer as Partial<Part2Answer> | null,
    );
    return score >= maxScore;
  }
  const score = scorePart3Question(
    (question.correct_answer as Part3Answer).value,
    (answer as Part3Answer | null)?.value ?? null,
    question.default_points ?? 0.5,
  );
  return score >= maxScore;
}

/**
 * Màn hình "Ôn tập câu sai" — lấy ngẫu nhiên 1 đợt câu đang cần ôn (chưa rút
 * khỏi nhật ký), không tính giờ, học sinh trả lời lại y hệt lúc làm đề gốc.
 *
 * MỞ RỘNG SAU (chưa làm ở lần này, đã bàn với người dùng): thay vì chỉ trả
 * lời lại, có thể thêm chế độ "sắp xếp lại các bước lời giải" (kéo thả), tự
 * tách từ solution_latex. Vì trang này chỉ cần biết kết quả cuối (đúng/sai)
 * để gọi api.submitReviewAnswer, sau này thêm chế độ mới chỉ cần thêm 1
 * nhánh render khác cho khu vực trả lời, không cần đổi phần điều phối buổi
 * ôn tập (bắt đầu buổi, lấy câu ngẫu nhiên, tính streak, kết thúc buổi).
 */
export function StudentReviewPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<(WrongAnswerJournalRow & { question: QuestionRow })[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<AnyAnswer | null>(null);
  const [checked, setChecked] = useState<{ isCorrect: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const items = await api.pickReviewQuestions(profile.id, REVIEW_BATCH_SIZE);
      setQueue(items);
      if (items.length === 0) {
        // Không tạo buổi ôn tập nếu chẳng có câu nào để ôn — tránh để lại
        // review_sessions "rỗng" không bao giờ có review_session_answers nào.
        setFinished(true);
        setLoading(false);
        return;
      }
      const session = await api.startReviewSession(profile.id);
      setSessionId(session.id);
      setLoading(false);
    })();
  }, [profile]);

  const current = queue[index];

  async function handleCheck() {
    if (!current || !sessionId || !profile) return;
    const isCorrect = isFullyCorrect(current.question, answer);
    setChecked({ isCorrect });
    setSubmitting(true);
    try {
      await api.submitReviewAnswer({
        sessionId,
        studentId: profile.id,
        questionId: current.question.id,
        isCorrect,
      });
      setTally((prev) => ({
        correct: prev.correct + (isCorrect ? 1 : 0),
        wrong: prev.wrong + (isCorrect ? 0 : 1),
      }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleNext() {
    setAnswer(null);
    setChecked(null);
    if (index + 1 >= queue.length) {
      if (sessionId) await api.finishReviewSession(sessionId);
      setFinished(true);
    } else {
      setIndex(index + 1);
    }
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  if (finished) {
    return (
      <div className="result-page">
        <h2>Đã xong buổi ôn tập</h2>
        {queue.length === 0 ? (
          <p className="empty-hint">
            Nhật ký ôn tập hiện đang trống — chưa có câu nào cần ôn. Quay lại đây sau khi bạn làm
            sai 1 câu nào đó trong lúc làm đề nhé.
          </p>
        ) : (
          <p className="empty-hint">
            Buổi này bạn làm đúng {tally.correct}/{queue.length} câu. Câu làm sai vẫn còn trong
            nhật ký (streak về 0), câu làm đúng đã tính thêm 1 buổi liên tiếp — quay lại ôn tiếp
            vào buổi sau để rút dần các câu ra khỏi nhật ký.
          </p>
        )}
        <Link className="btn-primary" to="/hoc-sinh">
          Về trang chủ
        </Link>
      </div>
    );
  }

  if (!current) return <div className="page-loading">Đang tải...</div>;

  const q = current.question;

  return (
    <div className="result-page result-page--wide">
      <div className="page-header-row">
        <h2>Ôn tập câu sai</h2>
        <span className="empty-hint">
          Câu {index + 1}/{queue.length} · không tính giờ
        </span>
      </div>

      {q.part === 1 && (
        <Part1Question
          number={index + 1}
          question={q}
          value={(answer as Part1Answer | null) ?? null}
          onChange={(v) => !checked && setAnswer(v)}
        />
      )}
      {q.part === 2 && (
        <Part2Question
          number={index + 1}
          question={q}
          value={(answer as Partial<Part2Answer> | null) ?? null}
          onChange={(v) => !checked && setAnswer(v)}
        />
      )}
      {q.part === 3 && (
        <Part3Question
          number={index + 1}
          question={q}
          value={(answer as Part3Answer | null) ?? null}
          onChange={(v) => !checked && setAnswer(v)}
        />
      )}

      {checked && (
        <div className={`ai-hint ${checked.isCorrect ? "review-feedback--correct" : "review-feedback--wrong"}`}>
          <strong>{checked.isCorrect ? "Đúng!" : "Chưa đúng."}</strong>
          {q.solution_latex && (
            <div style={{ marginTop: 8 }}>
              <MathText text={q.solution_latex} />
            </div>
          )}
        </div>
      )}

      <div className="page-header-row" style={{ marginTop: 20 }}>
        {!checked ? (
          <button className="btn-primary" onClick={handleCheck} disabled={submitting || !answer}>
            Kiểm tra
          </button>
        ) : (
          <button className="btn-primary" onClick={handleNext}>
            {index + 1 >= queue.length ? "Hoàn tất buổi ôn tập" : "Câu tiếp theo"}
          </button>
        )}
      </div>
    </div>
  );
}
