import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import * as api from "../lib/api";
import { questionMaxScore } from "../lib/api";
import { pickRandomForSession } from "../lib/leitner";
import { locateInBatches, splitIntoBatches } from "../lib/reviewBatching";
import {
  clearReviewProgress,
  loadReviewProgress,
  reconcileReviewProgress,
  saveReviewProgress,
} from "../lib/reviewProgress";
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
  Topic,
  WrongAnswerJournalRow,
} from "../lib/types";

type AnyAnswer = Part1Answer | Partial<Part2Answer> | Part3Answer;
type JournalEntryWithQuestion = WrongAnswerJournalRow & { question: QuestionRow };
/** Giai đoạn hiện tại của trang — thay cho các cờ boolean rời rạc trước đây
 * (finished/awaitingNextRound) để luồng chuyển màn hình rõ ràng, không thể
 * rơi vào trạng thái mâu thuẫn (vd. vừa finished vừa awaitingNextRound). */
type Stage = "loading" | "resume-prompt" | "overview" | "session" | "awaiting-round" | "finished";

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

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("vi-VN");
  } catch {
    return iso;
  }
}

/**
 * Màn hình "Ôn tập câu sai" — làm mới toàn diện (đợt cải tiến sau audit thực
 * tế, mục 7 — trọng tâm được nhấn mạnh nhiều nhất): thay vì tự động xáo toàn
 * bộ nhật ký và vào thẳng câu hỏi như trước, trang này giờ có 1 màn hình
 * TỔNG QUAN trước khi bắt đầu (chọn lại câu muốn ôn) và LƯU LẠI vị trí đang
 * làm dở (localStorage, xem reviewProgress.ts) để tiếp tục đúng chỗ nếu thoát
 * giữa chừng — thay vì phải xáo lại từ đầu.
 *
 * Nền tảng Leitner (leitner.ts, applyReviewResult), cơ chế chia đợt tối đa 10
 * câu/đợt (reviewBatching.ts) và submitReviewAnswer GIỮ NGUYÊN HOÀN TOÀN —
 * đúng/sai từng câu đã được ghi thẳng vào CSDL ngay khi trả lời, nên phần
 * "lưu tiến trình" ở đây chỉ là CON TRỎ VỊ TRÍ của riêng thiết bị này (câu
 * nào đã chọn, làm tới câu thứ mấy), không phải nguồn sự thật cho đúng/sai.
 *
 * Vị trí hiện tại được tính từ 1 con số DUY NHẤT — `answeredCount` — qua
 * `locateInBatches` (reviewBatching.ts), thay vì lưu riêng `roundIndex` +
 * `index` như bản cũ. Lý do: sau khi đối chiếu (reconcile) danh sách câu đã
 * chọn với danh sách câu ĐANG THẬT SỰ active (có thể đã đổi từ lần trước),
 * chỉ cần dồn (clamp) đúng 1 con số là xong — không có rủi ro 2 con số lệch
 * nhau.
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
  const [stage, setStage] = useState<Stage>("loading");

  // Toàn bộ nhật ký đang active (chưa rút) + map chương, dùng cho màn hình
  // tổng quan lẫn để đối chiếu (reconcile) tiến trình đã lưu.
  const [allEntries, setAllEntries] = useState<JournalEntryWithQuestion[]>([]);
  const [topicsById, setTopicsById] = useState<Map<string, Topic>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Tìm nhanh trong danh sách câu sai (mục "trình bày đẹp/dễ quản lý hơn khi
  // số câu sai nhiều lên", phản hồi sau khi thử Đợt 5) — chỉ lọc HIỂN THỊ,
  // không đổi selectedIds, để việc chọn/bỏ chọn không mất khi gõ tìm kiếm.
  const [overviewSearch, setOverviewSearch] = useState("");

  // Buổi ôn tập đang diễn ra (khi stage === "session"/"awaiting-round").
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [orderedEntries, setOrderedEntries] = useState<JournalEntryWithQuestion[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });

  // Gợi ý tiếp tục buổi cũ (khi stage === "resume-prompt").
  const [resumeData, setResumeData] = useState<{
    sessionId: string;
    questionIds: string[];
    answeredCount: number;
    tally: { correct: number; wrong: number };
  } | null>(null);

  const [answer, setAnswer] = useState<AnyAnswer | null>(null);
  const [checked, setChecked] = useState<{ isCorrect: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [entries, topics] = await Promise.all([
        api.listActiveJournalEntries(profile.id),
        api.listTopics(),
      ]);
      setAllEntries(entries);
      setSelectedIds(new Set(entries.map((e) => e.id)));
      setTopicsById(new Map(topics.map((t) => [t.id, t])));

      if (entries.length === 0) {
        setStage("finished");
        return;
      }

      const saved = loadReviewProgress(profile.id);
      const activeQuestionIds = new Set(entries.map((e) => e.question_id));
      const reconciled = saved ? reconcileReviewProgress(saved, activeQuestionIds) : null;
      if (saved && reconciled) {
        setResumeData({
          sessionId: saved.sessionId,
          questionIds: reconciled.questionIds,
          answeredCount: reconciled.answeredCount,
          tally: reconciled.tally,
        });
        setStage("resume-prompt");
      } else {
        if (saved) {
          // Có tiến trình cũ nhưng không còn câu nào active — dọn luôn, tránh
          // hỏi lại "tiếp tục" ở lần mở kế tiếp cho 1 buổi đã hết ý nghĩa.
          clearReviewProgress(profile.id);
        }
        setStage("overview");
      }
    })();
  }, [profile]);

  const batches = useMemo(() => splitIntoBatches(orderedEntries), [orderedEntries]);
  const batchSizes = useMemo(() => batches.map((b) => b.length), [batches]);
  const totalCount = orderedEntries.length;
  const position = useMemo(
    () => locateInBatches(batchSizes, answeredCount),
    [batchSizes, answeredCount],
  );

  const queue = position ? batches[position.roundIndex] ?? [] : [];
  const currentEntry = position ? queue[position.indexInRound] : undefined;

  // Xáo vị trí đáp án — nhớ lại (memo) theo id câu hỏi, để đáp án không bị
  // đổi vị trí giữa chừng khi học sinh đang chọn (component chỉ re-shuffle
  // khi CHUYỂN sang câu khác, không phải mỗi lần re-render do state
  // answer/checked thay đổi).
  const current = useMemo(() => {
    if (!currentEntry) return null;
    return { ...currentEntry, question: shuffleQuestionForReview(currentEntry.question) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEntry?.id]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setManySelected(ids: string[], selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  // Nhóm theo chương (topic) để màn hình tổng quan không còn là 1 danh sách
  // dài phẳng lì — dễ quét mắt và quản lý hơn khi nhật ký nhiều câu (phản hồi
  // Thầy Tường sau khi thử Đợt 5). Lọc theo ô tìm kiếm TRƯỚC khi nhóm, để
  // nhóm nào không còn câu nào khớp thì tự ẩn luôn.
  const overviewGroups = useMemo(() => {
    const query = overviewSearch.trim().toLowerCase();
    const filtered = query
      ? allEntries.filter((e) => e.question.content_latex.toLowerCase().includes(query))
      : allEntries;
    const byTopic = new Map<string, { topicName: string; entries: JournalEntryWithQuestion[] }>();
    for (const entry of filtered) {
      const topic = entry.question.topic_id ? topicsById.get(entry.question.topic_id) : null;
      const key = topic?.id ?? "__khac__";
      const group = byTopic.get(key) ?? { topicName: topic?.name ?? "Chưa gán chương", entries: [] };
      group.entries.push(entry);
      byTopic.set(key, group);
    }
    // Câu sai gần nhất lên đầu trong từng chương — ưu tiên ôn cái mới sai.
    for (const g of byTopic.values()) {
      g.entries.sort((a, b) => new Date(b.last_wrong_at).getTime() - new Date(a.last_wrong_at).getTime());
    }
    return Array.from(byTopic.values()).sort((a, b) => a.topicName.localeCompare(b.topicName, "vi"));
  }, [allEntries, topicsById, overviewSearch]);
  const overviewVisibleCount = overviewGroups.reduce((sum, g) => sum + g.entries.length, 0);

  async function handleStartSession(entries: JournalEntryWithQuestion[]) {
    if (!profile) return;
    const shuffledOrder = pickRandomForSession(entries, entries.length);
    const session = await api.startReviewSession(profile.id);
    setSessionId(session.id);
    setOrderedEntries(shuffledOrder);
    setAnsweredCount(0);
    setTally({ correct: 0, wrong: 0 });
    saveReviewProgress({
      studentId: profile.id,
      sessionId: session.id,
      questionIds: shuffledOrder.map((e) => e.question_id),
      answeredCount: 0,
      tally: { correct: 0, wrong: 0 },
    });
    setStage("session");
  }

  function handleBeginFromOverview() {
    const chosen = allEntries.filter((e) => selectedIds.has(e.id));
    if (chosen.length === 0) return;
    void handleStartSession(chosen);
  }

  async function handleResumeContinue() {
    if (!profile || !resumeData) return;
    // Dựng lại đúng hàng đợi cũ theo id đã lưu — tải dữ liệu câu hỏi MỚI NHẤT
    // (allEntries vừa fetch ở trên), giữ nguyên thứ tự đã xáo trước đó.
    const byQuestionId = new Map(allEntries.map((e) => [e.question_id, e]));
    const rebuilt = resumeData.questionIds
      .map((qid) => byQuestionId.get(qid))
      .filter((e): e is JournalEntryWithQuestion => !!e);
    setSessionId(resumeData.sessionId);
    setOrderedEntries(rebuilt);
    setAnsweredCount(Math.min(resumeData.answeredCount, rebuilt.length));
    setTally(resumeData.tally);
    setStage("session");
  }

  async function handleResumeStartNew() {
    if (!profile || !resumeData) return;
    // Đóng buổi cũ cho gọn (không để lại review_sessions dở dang mãi mãi),
    // rồi xoá tiến trình đã lưu và quay về màn hình tổng quan chọn câu.
    try {
      await api.finishReviewSession(resumeData.sessionId);
    } catch {
      // Buổi cũ có thể đã bị xoá/không hợp lệ — không chặn luồng vì lỗi này.
    }
    clearReviewProgress(profile.id);
    setResumeData(null);
    setStage("overview");
  }

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
    if (!profile || !sessionId) return;
    // Lưu ý: `tally` ở đây ĐÃ được cập nhật xong bởi handleCheck (setTally)
    // từ lần bấm "Kiểm tra" trước khi nút "Câu tiếp theo" xuất hiện — không
    // cộng thêm lần nữa ở đây, tránh đếm trùng.
    setAnswer(null);
    setChecked(null);
    const nextAnsweredCount = answeredCount + 1;
    setAnsweredCount(nextAnsweredCount);

    const nextPosition = locateInBatches(batchSizes, nextAnsweredCount);
    if (!nextPosition) {
      // Làm xong hết — kết thúc buổi, dọn tiến trình đã lưu.
      await api.finishReviewSession(sessionId);
      clearReviewProgress(profile.id);
      setStage("finished");
      return;
    }

    saveReviewProgress({
      studentId: profile.id,
      sessionId,
      questionIds: orderedEntries.map((e) => e.question_id),
      answeredCount: nextAnsweredCount,
      tally,
    });

    const prevPosition = locateInBatches(batchSizes, answeredCount);
    if (prevPosition && nextPosition.roundIndex > prevPosition.roundIndex) {
      setStage("awaiting-round");
    }
  }

  function handleContinueNextRound() {
    setStage("session");
  }

  if (stage === "loading") return <div className="page-loading">Đang tải...</div>;

  if (stage === "resume-prompt" && resumeData) {
    const remaining = resumeData.questionIds.length - resumeData.answeredCount;
    return (
      <div className="result-page">
        <h2>Tiếp tục buổi ôn tập đang dở?</h2>
        <p className="empty-hint">
          Bạn có 1 buổi ôn tập chưa làm xong — còn {remaining} câu (đã làm đúng {resumeData.tally.correct}
          , sai {resumeData.tally.wrong}). Tiếp tục sẽ vào đúng chỗ đang dở, không cần làm lại từ đầu.
        </p>
        <div className="page-header-row" style={{ marginTop: 12 }}>
          <button className="btn-primary" onClick={handleResumeContinue}>
            Tiếp tục ({remaining} câu còn lại)
          </button>
          <button className="btn-link" onClick={handleResumeStartNew}>
            Bắt đầu buổi mới
          </button>
        </div>
      </div>
    );
  }

  if (stage === "overview") {
    return (
      <div className="result-page review-overview">
        <div className="page-header-row">
          <h2>Ôn tập câu sai</h2>
          <span className="empty-hint">
            Đã chọn {selectedIds.size}/{allEntries.length} câu
          </span>
        </div>
        <p className="empty-hint">
          Chọn những câu bạn muốn ôn trong buổi này (mặc định chọn hết). Mỗi đợt tối đa 10 câu — nếu
          chọn nhiều hơn, hệ thống sẽ tự chia thành nhiều đợt liên tiếp trong cùng 1 buổi.
        </p>

        <div className="review-overview-toolbar">
          <input
            type="search"
            className="review-overview-search"
            placeholder="Tìm trong nội dung câu hỏi..."
            value={overviewSearch}
            onChange={(e) => setOverviewSearch(e.target.value)}
          />
          <div className="review-overview-toolbar-actions">
            <button
              type="button"
              className="btn-link"
              onClick={() => setManySelected(overviewGroups.flatMap((g) => g.entries.map((e) => e.id)), true)}
            >
              Chọn tất cả{overviewSearch ? " (đang lọc)" : ""}
            </button>
            <button
              type="button"
              className="btn-link"
              onClick={() => setManySelected(overviewGroups.flatMap((g) => g.entries.map((e) => e.id)), false)}
            >
              Bỏ chọn tất cả{overviewSearch ? " (đang lọc)" : ""}
            </button>
          </div>
        </div>

        {overviewVisibleCount === 0 ? (
          <p className="empty-hint" style={{ marginTop: 16 }}>
            Không có câu nào khớp với tìm kiếm "{overviewSearch}".
          </p>
        ) : (
          <div className="review-overview-groups">
            {overviewGroups.map((group) => {
              const groupIds = group.entries.map((e) => e.id);
              const selectedInGroup = groupIds.filter((id) => selectedIds.has(id)).length;
              const allSelected = selectedInGroup === groupIds.length;
              return (
                <details className="review-topic-group" key={group.topicName} open>
                  <summary className="review-topic-group-header">
                    <span className="review-topic-group-title">
                      {group.topicName}
                      <span className="tag tag--muted" style={{ marginLeft: 8 }}>
                        {selectedInGroup}/{groupIds.length} đã chọn
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={(e) => {
                        e.preventDefault();
                        setManySelected(groupIds, !allSelected);
                      }}
                    >
                      {allSelected ? "Bỏ hết chương này" : "Chọn hết chương này"}
                    </button>
                  </summary>
                  <div className="review-overview-grid">
                    {group.entries.map((entry) => (
                      <label className="review-overview-item" key={entry.id}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelected(entry.id)}
                        />
                        <span className="review-overview-item-body">
                          <span className="review-overview-item-text">
                            <MathText text={entry.question.content_latex} />
                          </span>
                          <span className="review-overview-item-meta">
                            <span
                              className="review-streak-dots"
                              title={`Đã đúng liên tiếp ${entry.correct_streak}/3 buổi`}
                            >
                              {Array.from({ length: 3 }, (_, i) => (
                                <span
                                  key={i}
                                  className={`review-streak-dot${i < entry.correct_streak ? " review-streak-dot--filled" : ""}`}
                                />
                              ))}
                            </span>
                            Sai gần nhất {formatShortDate(entry.last_wrong_at)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <div className="page-header-row" style={{ marginTop: 20 }}>
          <button className="btn-primary" onClick={handleBeginFromOverview} disabled={selectedIds.size === 0}>
            Bắt đầu ôn tập ({selectedIds.size} câu)
          </button>
        </div>
      </div>
    );
  }

  if (stage === "finished") {
    return (
      <div className="result-page">
        <h2>Đã xong buổi ôn tập</h2>
        {allEntries.length === 0 ? (
          <p className="empty-hint">
            Nhật ký ôn tập hiện đang trống — chưa có câu nào cần ôn. Quay lại đây sau khi bạn làm
            sai 1 câu nào đó trong lúc làm đề nhé.
          </p>
        ) : (
          <p className="empty-hint">
            Buổi này bạn làm đúng {tally.correct}/{totalCount} câu
            {batchSizes.length > 1 ? ` (chia làm ${batchSizes.length} đợt)` : ""}. Câu làm sai vẫn còn
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

  if (stage === "awaiting-round" && position === null) {
    // Vừa chuyển sang awaiting-round ngay sau round cuối của batchSizes hiện
    // tại nhưng chưa hết tổng — position luôn khác null ở nhánh này trong
    // luồng bình thường; phòng hờ dữ liệu lệch thì quay lại tổng quan an toàn
    // hơn là hiển thị màn hình trống.
    return <div className="page-loading">Đang tải...</div>;
  }

  if (stage === "awaiting-round") {
    const roundsDone = position ? position.roundIndex : 0;
    const remaining = totalCount - answeredCount;
    return (
      <div className="result-page">
        <h2>
          Xong đợt {roundsDone}/{batchSizes.length}
        </h2>
        <p className="empty-hint">
          Bạn vừa làm xong {batchSizes[roundsDone - 1] ?? 0} câu của đợt {roundsDone}. Còn {remaining}{" "}
          câu nữa, chia làm {batchSizes.length - roundsDone} đợt tiếp theo — nghỉ tay chút rồi làm
          tiếp đợt sau trong cùng buổi này nhé (vẫn tính chung 1 buổi ôn tập).
        </p>
        <button className="btn-primary" onClick={handleContinueNextRound}>
          Làm tiếp đợt {roundsDone + 1}/{batchSizes.length}
        </button>
      </div>
    );
  }

  if (!current || !position) return <div className="page-loading">Đang tải...</div>;

  const q = current.question;

  return (
    <div className="result-page result-page--wide">
      <div className="page-header-row">
        <h2>Ôn tập câu sai</h2>
        <span className="empty-hint">
          {batchSizes.length > 1 ? `Đợt ${position.roundIndex + 1}/${batchSizes.length} · ` : ""}
          Câu {position.indexInRound + 1}/{queue.length} · không tính giờ
        </span>
      </div>

      {q.part === 1 && (
        <Part1Question
          number={position.indexInRound + 1}
          question={q}
          value={(answer as Part1Answer | null) ?? null}
          onChange={(v) => !checked && setAnswer(v)}
        />
      )}
      {q.part === 2 && (
        <Part2Question
          number={position.indexInRound + 1}
          question={q}
          value={(answer as Partial<Part2Answer> | null) ?? null}
          onChange={(v) => !checked && setAnswer(v)}
        />
      )}
      {q.part === 3 && (
        <Part3Question
          number={position.indexInRound + 1}
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
          <button className="btn-primary" onClick={() => void handleNext()}>
            {answeredCount + 1 >= totalCount
              ? "Hoàn tất buổi ôn tập"
              : position.indexInRound + 1 >= queue.length
                ? "Hoàn tất đợt này"
                : "Câu tiếp theo"}
          </button>
        )}
      </div>
    </div>
  );
}
