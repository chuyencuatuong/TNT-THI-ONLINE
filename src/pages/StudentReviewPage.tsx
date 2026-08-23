import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { questionMaxScore } from "../lib/api";
import { pickRandomForSession } from "../lib/leitner";
import { splitIntoBatches } from "../lib/reviewBatching";
import { shuffleQuestionForReview } from "../lib/reviewShuffle";
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

type AnyAnswer = Part1Answer | Partial<Part2Answer> | Part3Answer;
type JournalEntryWithQuestion = WrongAnswerJournalRow & { question: QuestionRow };

/**
 * Chấm 1 câu ôn tập bằng đúng bộ máy chấm điểm đã dùng cho đề thi thật
 * (scoring.ts) — "đúng" ở đây nghĩa là ĐẠT TRỌN ĐIỂM (không tính đúng 1 phần
 * cho Phần 2), vì mục tiêu ôn tập là chắc hẳn, không phải "gần đúng".
 *
 * LƯU Ý: `question` truyền vào đây phải là bản đã xáo đáp án (nếu có) — hàm
 * này chỉ so đúng/sai theo đúng `question.correct_answer` được truyền vào,
 * không quan tâm nó là bản gốc hay bản đã xáo vị trí.
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
 * Màn hình "Ôn tập câu sai" — lấy TOÀN BỘ câu đang cần ôn (chưa rút khỏi
 * nhật ký), xáo ngẫu nhiên thứ tự rồi chia thành nhiều "đợt" nhỏ (tối đa 10
 * câu/đợt, xem `reviewBatching.ts`) để không dồn quá tải trong 1 lần mở màn
 * hình — nhưng vẫn dùng CHUNG 1 buổi ôn tập (1 `sessionId`/`review_sessions`
 * row) cho mọi đợt, vì Leitner streak (mục 19.3, `leitner.ts`) tính theo
 * "buổi riêng biệt" = 1 lần MỞ MÀN HÌNH, không phải theo từng đợt nhỏ bên
 * trong — chia đợt chỉ để đỡ mỏi, không phải để nhân thêm số buổi tính streak.
 *
 * Đáp án mỗi câu được xáo vị trí ngẫu nhiên (`reviewShuffle.ts`) mỗi lần hiện
 * ra, để học sinh không thể "đối phó" bằng cách nhớ đúng vị trí đã bấm ở lần
 * trước rồi bấm lại y hệt cả 3 buổi liên tiếp mà không thực sự hiểu bài.
 *
 * MỞ RỘNG SAU (chưa làm ở lần này, đã bàn với người dùng): thay vì chỉ trả
 * lời lại, có thể thêm chế độ "sắp xếp lại các bước lời giải" (kéo thả), tự
 * tách từ solution_latex. Vì trang này chỉ cần biết kết quả cuối (đúng/sai)
 * để gọi api.submitReviewAnswer, sau này thêm chế độ mới chỉ cần thêm 1
 * nhánh render khác cho khu vực trả lời, không cần đổi phần điều phối buổi
 * ôn tập (bắt đầu buổi, chia đợt, tính streak, kết thúc buổi).
 */
export function StudentReviewPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [batches, setBatches] = useState<JournalEntryWithQuestion[][]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [awaitingNextRound, setAwaitingNextRound] = useState(false);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<AnyAnswer | null>(null);
  const [checked, setChecked] = useState<{ isCorrect: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [finished, setFinished] = useState(false);

  const totalCount = useMemo(() => batches.reduce((sum, b) => sum + b.length, 0), [batches]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const entries = await api.listActiveJournalEntries(profile.id);
      if (entries.length === 0) {
        // Không tạo buổi ôn tập nếu chẳng có câu nào để ôn — tránh để lại
        // review_sessions "rỗng" không bao giờ có review_session_answers nào.
        setFinished(true);
        setLoading(false);
        return;
      }
      const shuffledOrder = pickRandomForSession(entries, entries.length);
      setBatches(splitIntoBatches(shuffledOrder));
      const session = await api.startReviewSession(profile.id);
      setSessionId(session.id);
      setLoading(false);
    })();
  }, [profile]);

  const queue = batches[roundIndex] ?? [];
  const currentEntry = queue[index];

  // Xáo vị trí đáp án — nhớ lại (memo) theo id câu hỏi + đợt + số thứ tự
  // trong đợt, để đáp án không bị đổi vị trí giữa chừng khi học sinh đang
  // chọn (component chỉ re-shuffle khi CHUYỂN sang câu khác, không phải mỗi
  // lần re-render do state answer/checked thay đổi).
  const current = useMemo(() => {
    if (!currentEntry) return null;
    return { ...currentEntry, question: shuffleQuestionForReview(currentEntry.question) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.id, roundIndex, index]);

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
    if (index + 1 < queue.length) {
      setIndex(index + 1);
      return;
    }
    // Hết đợt hiện tại.
    if (roundIndex + 1 < batches.length) {
      setAwaitingNextRound(true);
    } else {
      if (sessionId) await api.finishReviewSession(sessionId);
      setFinished(true);
    }
  }

  function handleContinueNextRound() {
    setAwaitingNextRound(false);
    setRoundIndex((r) => r + 1);
    setIndex(0);
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  if (finished) {
    return (
      <div className="result-page">
        <h2>Đã xong buổi ôn tập</h2>
        {totalCount === 0 ? (
          <p className="empty-hint">
            Nhật ký ôn tập hiện đang trống — chưa có câu nào cần ôn. Quay lại đây sau khi bạn làm
            sai 1 câu nào đó trong lúc làm đề nhé.
          </p>
        ) : (
          <p className="empty-hint">
            Buổi này bạn làm đúng {tally.correct}/{totalCount} câu
            {batches.length > 1 ? ` (chia làm ${batches.length} đợt)` : ""}. Câu làm sai vẫn còn
            trong nhật ký (streak về 0), câu làm đúng đã tính thêm 1 buổi liên tiếp — quay lại ôn
            tiếp vào buổi sau để rút dần các câu ra khỏi nhật ký.
          </p>
        )}
        <Link className="btn-primary" to="/hoc-sinh">
          Về trang chủ
        </Link>
      </div>
    );
  }

  if (awaitingNextRound) {
    return (
      <div className="result-page">
        <h2>
          Xong đợt {roundIndex + 1}/{batches.length}
        </h2>
        <p className="empty-hint">
          Bạn vừa làm xong {queue.length} câu của đợt {roundIndex + 1}. Nhật ký còn{" "}
          {batches.slice(roundIndex + 1).reduce((s, b) => s + b.length, 0)} câu nữa, chia làm{" "}
          {batches.length - roundIndex - 1} đợt tiếp theo — nghỉ tay chút rồi làm tiếp đợt sau
          trong cùng buổi này nhé (vẫn tính chung 1 buổi ôn tập).
        </p>
        <button className="btn-primary" onClick={handleContinueNextRound}>
          Làm tiếp đợt {roundIndex + 2}/{batches.length}
        </button>
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
          {batches.length > 1 ? `Đợt ${roundIndex + 1}/${batches.length} · ` : ""}
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
            {index + 1 >= queue.length && roundIndex + 1 >= batches.length
              ? "Hoàn tất buổi ôn tập"
              : index + 1 >= queue.length
                ? "Hoàn tất đợt này"
                : "Câu tiếp theo"}
          </button>
        )}
      </div>
    </div>
  );
}
