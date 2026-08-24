import { supabase } from "./supabaseClient";
import {
  combineScores,
  scorePart1Question,
  scorePart2Question,
  scorePart3Question,
} from "./scoring";
import {
  classifyBlankQuestions,
  computeActiveSeconds,
  diagnoseAllTopics,
  type BlankQuestionSummary,
  type TopicOutcomeGroup,
} from "./diagnosis";
import { applyReviewResult, markWrongFromExam, type JournalStreakState } from "./leitner";
import { mergeChapterStats, type ChapterStat } from "./chapterStats";
import type {
  AttemptScoreRow,
  Difficulty,
  ExamAttemptRow,
  ExamQuestionRow,
  ExamRow,
  ExamTag,
  ExamTagKind,
  ExamTopicRow,
  Part1Answer,
  Part2Answer,
  Part3Answer,
  PomodoroSessionRow,
  ProctoringEventRow,
  Profile,
  QuestionRow,
  QuestionType,
  QuestionViewEventRow,
  ReviewSessionRow,
  StudentPlaylistRow,
  Topic,
  WrongAnswerJournalRow,
} from "./types";

// ---------------------------------------------------------------------------
// Khung kiến thức (topics / question_types)
// ---------------------------------------------------------------------------

export async function listTopics(): Promise<Topic[]> {
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .order("grade")
    .order("name");
  if (error) throw error;
  return data as Topic[];
}

export async function createTopic(input: {
  name: string;
  chapter: string | null;
  grade: 10 | 11 | 12;
}): Promise<Topic> {
  const { data, error } = await supabase
    .from("topics")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Topic;
}

export async function listQuestionTypes(): Promise<QuestionType[]> {
  const { data, error } = await supabase
    .from("question_types")
    .select("*")
    .order("name");
  if (error) throw error;
  return data as QuestionType[];
}

export async function createQuestionType(input: {
  topic_id: string;
  name: string;
  description: string | null;
}): Promise<QuestionType> {
  const { data, error } = await supabase
    .from("question_types")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as QuestionType;
}

// ---------------------------------------------------------------------------
// Ảnh minh hoạ câu hỏi (bảng biến thiên, đồ thị...)
// ---------------------------------------------------------------------------

const QUESTION_IMAGES_BUCKET = "question-images";

/** Tải 1 ảnh lên, trả về URL công khai để lưu vào questions.image_url. */
export async function uploadQuestionImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(QUESTION_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(QUESTION_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Ngân hàng câu hỏi
// ---------------------------------------------------------------------------

export async function listQuestions(filters?: {
  part?: 1 | 2 | 3;
  question_type_id?: string;
}): Promise<QuestionRow[]> {
  let q = supabase.from("questions").select("*").order("created_at", {
    ascending: false,
  });
  if (filters?.part) q = q.eq("part", filters.part);
  if (filters?.question_type_id)
    q = q.eq("question_type_id", filters.question_type_id);
  const { data, error } = await q;
  if (error) throw error;
  return data as QuestionRow[];
}

export async function createQuestion(input: {
  part: 1 | 2 | 3;
  question_type_id: string | null;
  /** Chương — không bắt buộc, xem giải thích ở migration_007. */
  topic_id?: string | null;
  ai_suggested_topic_id?: string | null;
  difficulty: Difficulty | null;
  content_latex: string;
  image_url: string | null;
  options: unknown;
  correct_answer: unknown;
  /** Lời giải chi tiết (LaTeX), không bắt buộc — null nếu chưa có. */
  solution_latex?: string | null;
  default_points: number | null;
  ai_suggested_type_id: string | null;
  created_by: string;
  source?: "manual" | "word_import";
}): Promise<QuestionRow> {
  const { data, error } = await supabase
    .from("questions")
    .insert({ source: "manual", ...input })
    .select()
    .single();
  if (error) throw error;
  return data as QuestionRow;
}

export async function updateQuestion(
  id: string,
  patch: Partial<QuestionRow>,
): Promise<void> {
  const { error } = await supabase.from("questions").update(patch).eq(
    "id",
    id,
  );
  if (error) throw error;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await supabase.from("questions").delete().eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Đề thi
// ---------------------------------------------------------------------------

export async function listExams(): Promise<ExamRow[]> {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as ExamRow[];
}

// ---------------------------------------------------------------------------
// Thư mục/tuyển tập ('folder') và Chương trình/kỳ thi ('term') — exam_tags
// ---------------------------------------------------------------------------

/** Danh sách tag theo loại (kind), sắp xếp tên A-Z — dùng cho ô chọn thư mục/chương trình. */
export async function listExamTags(kind: ExamTagKind): Promise<ExamTag[]> {
  const { data, error } = await supabase
    .from("exam_tags")
    .select("*")
    .eq("kind", kind)
    .order("name");
  if (error) throw error;
  return data as ExamTag[];
}

/** Tạo mới 1 thư mục/chương trình — chặn trùng tên (case-sensitive theo unique(kind, name) ở DB). */
export async function createExamTag(input: {
  kind: ExamTagKind;
  name: string;
  description?: string | null;
  created_by: string;
}): Promise<ExamTag> {
  const { data, error } = await supabase
    .from("exam_tags")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ExamTag;
}

/** Sửa tên/mô tả 1 thư mục/chương trình — áp dụng ngay cho mọi đề đang tham chiếu tới nó. */
export async function updateExamTag(
  id: string,
  patch: Partial<Pick<ExamTag, "name" | "description">>,
): Promise<void> {
  const { error } = await supabase.from("exam_tags").update(patch).eq("id", id);
  if (error) throw error;
}

export async function createExam(input: {
  title: string;
  description: string | null;
  duration_minutes?: number | null;
  grade?: 10 | 11 | 12 | null;
  folder_id?: string | null;
  term_id?: string | null;
  drive_link?: string | null;
  mode?: "thoai_mai" | "nghiem_tuc";
  assigned_unlock_at?: string | null;
  assigned_lock_at?: string | null;
  created_by: string;
}): Promise<ExamRow> {
  const { data, error } = await supabase
    .from("exams")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as ExamRow;
}

export async function updateExam(
  id: string,
  patch: Partial<
    Pick<
      ExamRow,
      | "title"
      | "description"
      | "duration_minutes"
      | "grade"
      | "folder_id"
      | "term_id"
      | "drive_link"
      | "mode"
      | "assigned_unlock_at"
      | "assigned_lock_at"
    >
  >,
): Promise<void> {
  const { error } = await supabase.from("exams").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Chương mà cả đề bao phủ (exam_topics, m:n — khác questions.topic_id)
// ---------------------------------------------------------------------------

export async function getExamTopicIds(examId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("exam_topics")
    .select("topic_id")
    .eq("exam_id", examId);
  if (error) throw error;
  return (data as { topic_id: string }[]).map((r) => r.topic_id);
}

/** Toàn bộ exam_topics (mọi đề) — dùng để dựng bộ lọc theo Chương ở Kho đề. */
export async function listAllExamTopics(): Promise<ExamTopicRow[]> {
  const { data, error } = await supabase.from("exam_topics").select("exam_id, topic_id");
  if (error) throw error;
  return data as ExamTopicRow[];
}

export async function setExamTopics(examId: string, topicIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from("exam_topics").delete().eq("exam_id", examId);
  if (delErr) throw delErr;
  if (topicIds.length === 0) return;
  const { error } = await supabase
    .from("exam_topics")
    .insert(topicIds.map((topic_id) => ({ exam_id: examId, topic_id })));
  if (error) throw error;
}

export async function getExam(id: string): Promise<ExamRow | null> {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ExamRow | null;
}

export async function setExamQuestions(
  examId: string,
  questions: { question_id: string; order_index: number; part: 1 | 2 | 3 }[],
): Promise<void> {
  // Xoá hết rồi chèn lại cho đơn giản (số lượng câu hỏi mỗi đề rất nhỏ, không cần tối ưu diff)
  const { error: delErr } = await supabase
    .from("exam_questions")
    .delete()
    .eq("exam_id", examId);
  if (delErr) throw delErr;
  if (questions.length === 0) return;
  const { error } = await supabase.from("exam_questions").insert(
    questions.map((q) => ({ exam_id: examId, ...q })),
  );
  if (error) throw error;
}

export async function getExamQuestions(
  examId: string,
): Promise<(ExamQuestionRow & { question: QuestionRow })[]> {
  const { data, error } = await supabase
    .from("exam_questions")
    .select("*, question:questions(*)")
    .eq("exam_id", examId)
    .order("part")
    .order("order_index");
  if (error) throw error;
  return data as unknown as (ExamQuestionRow & { question: QuestionRow })[];
}

// ---------------------------------------------------------------------------
// Làm bài: lượt làm bài, log sự kiện, chấm điểm
// ---------------------------------------------------------------------------

/**
 * Bắt đầu 1 lượt làm bài mới. Với đề "được chỉ định" (assigned_unlock_at /
 * assigned_lock_at), việc chặn ngoài khung giờ được thực hiện ở TẦNG SERVER
 * bằng trigger check_exam_assignment_window (migration_010, dùng đồng hồ
 * Postgres) — nếu ngoài khung giờ, lệnh insert bên dưới sẽ ném lỗi với message
 * "exam_not_unlocked_yet" hoặc "exam_locked", ExamTakingPage.tsx bắt lỗi này
 * để hiện đúng màn hình thông báo cho học sinh.
 */
export async function startAttempt(
  examId: string,
  studentId: string,
): Promise<ExamAttemptRow> {
  const { count } = await supabase
    .from("exam_attempts")
    .select("*", { count: "exact", head: true })
    .eq("exam_id", examId)
    .eq("student_id", studentId);
  const attemptNumber = (count ?? 0) + 1;

  const { data, error } = await supabase
    .from("exam_attempts")
    .insert({
      exam_id: examId,
      student_id: studentId,
      attempt_number: attemptNumber,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ExamAttemptRow;
}

export async function logAnswerEvent(input: {
  attempt_id: string;
  question_id: string;
  event_type: "select" | "change" | "clear";
  answer_value: unknown;
}): Promise<void> {
  const { error } = await supabase.from("answer_events").insert(input);
  if (error) throw error;
}

/**
 * Ghi lại thời điểm học sinh bắt đầu/rời khỏi việc xem 1 câu hỏi (câu hỏi hiện
 * trong vùng nhìn thấy). Dùng để tính thời gian "tập trung" thực tế vào từng
 * câu, cộng dồn qua nhiều lượt quay lại xem — xem thêm computeActiveSeconds
 * trong diagnosis.ts.
 */
export async function logQuestionViewEvent(input: {
  attempt_id: string;
  question_id: string;
  event_type: "enter" | "leave";
}): Promise<void> {
  const { error } = await supabase.from("question_view_events").insert(input);
  if (error) throw error;
}

export type ProctoringEventType =
  | "tab_hidden"
  | "tab_visible"
  | "window_blur"
  | "window_focus"
  | "fullscreen_exit"
  | "copy_attempt"
  | "paste_attempt";

/**
 * Ghi lại 1 dấu hiệu giám sát trong lúc học sinh làm bài (chuyển tab, thoát
 * toàn màn hình, cố sao chép/dán...). Chỉ để gợi ý mức độ nghi ngờ cho giáo
 * viên, không phải bằng chứng gian lận chắc chắn.
 */
export async function logProctoringEvent(input: {
  attempt_id: string;
  event_type: ProctoringEventType;
}): Promise<void> {
  const { error } = await supabase.from("proctoring_events").insert(input);
  if (error) throw error;
}

const SUSPICIOUS_EVENT_TYPES: ProctoringEventType[] = [
  "tab_hidden",
  "fullscreen_exit",
  "copy_attempt",
  "paste_attempt",
];

/**
 * Đếm số lần có dấu hiệu khả nghi (rời tab, thoát toàn màn hình, cố
 * copy/paste) cho từng lượt làm bài — dùng để hiển thị "mức độ nghi ngờ"
 * cho giáo viên. Không đếm window_blur/focus riêng vì dễ bị nhiễu (ví dụ bấm
 * vào thanh địa chỉ trình duyệt cũng tính là blur).
 */
export async function getProctoringCounts(
  attemptIds: string[],
): Promise<Record<string, number>> {
  if (attemptIds.length === 0) return {};
  const { data, error } = await supabase
    .from("proctoring_events")
    .select("attempt_id, event_type")
    .in("attempt_id", attemptIds)
    .in("event_type", SUSPICIOUS_EVENT_TYPES);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data as { attempt_id: string; event_type: string }[]) {
    counts[row.attempt_id] = (counts[row.attempt_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Đếm nhanh số câu bỏ trống (và nguyên nhân chưa-kịp-đọc/đọc-rồi-bỏ-qua) cho
 * NHIỀU lượt làm bài cùng lúc — dùng để hiện badge tổng quan ở bảng danh sách
 * lượt làm bài của giáo viên, không cần bấm vào từng dòng mới thấy.
 * Xem classifyBlankQuestions (diagnosis.ts) cho ý nghĩa của 2 nguyên nhân.
 */
export async function getBlankQuestionCounts(
  attemptIds: string[],
): Promise<Record<string, BlankQuestionSummary>> {
  if (attemptIds.length === 0) return {};
  const [{ data: blankResponses, error: rErr }, { data: viewEvents, error: veErr }] =
    await Promise.all([
      supabase
        .from("question_responses")
        .select("attempt_id, question_id")
        .in("attempt_id", attemptIds)
        .is("final_answer", null),
      supabase
        .from("question_view_events")
        .select("attempt_id, question_id")
        .in("attempt_id", attemptIds)
        .eq("event_type", "enter"),
    ]);
  if (rErr) throw rErr;
  if (veErr) throw veErr;

  const viewedByAttempt = new Map<string, Set<string>>();
  for (const row of viewEvents as { attempt_id: string; question_id: string }[]) {
    const set = viewedByAttempt.get(row.attempt_id) ?? new Set<string>();
    set.add(row.question_id);
    viewedByAttempt.set(row.attempt_id, set);
  }

  const blankByAttempt = new Map<string, string[]>();
  for (const row of blankResponses as { attempt_id: string; question_id: string }[]) {
    const list = blankByAttempt.get(row.attempt_id) ?? [];
    list.push(row.question_id);
    blankByAttempt.set(row.attempt_id, list);
  }

  const result: Record<string, BlankQuestionSummary> = {};
  for (const [attemptId, blankIds] of blankByAttempt) {
    result[attemptId] = classifyBlankQuestions(
      blankIds,
      viewedByAttempt.get(attemptId) ?? new Set<string>(),
    );
  }
  return result;
}

/** Toàn bộ dấu hiệu giám sát của 1 lượt làm bài, theo đúng thứ tự thời gian —
 * dùng cho "Xem chi tiết vi phạm" ở trang chi tiết học sinh (biên bản đầy đủ
 * cho giáo viên, thay vì chỉ 1 con số nghi ngờ). */
export async function getProctoringEvents(attemptId: string): Promise<ProctoringEventRow[]> {
  const { data, error } = await supabase
    .from("proctoring_events")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("created_at");
  if (error) throw error;
  return data as ProctoringEventRow[];
}

/** Điểm tối đa của 1 câu, dùng cả để chấm và để biết câu đó có "làm sai/chưa
 * trọn điểm" hay không (ghi vào nhật ký câu sai) — tách hàm để dùng chung
 * với getAttemptReview và màn hình ôn tập câu sai, tránh lặp lại đúng 1 công
 * thức ở nhiều nơi. */
export function questionMaxScore(q: Pick<QuestionRow, "part" | "default_points">): number {
  return q.part === 1 ? 0.25 : q.part === 2 ? 1 : q.default_points ?? 0.5;
}

/**
 * Ghi/cập nhật nhật ký câu sai kiểu Leitner cho các câu làm sai/chưa trọn
 * điểm trong 1 lượt làm ĐỀ THẬT (không phải buổi ôn tập) — luôn đưa câu về
 * lại nhật ký với streak = 0 (xem markWrongFromExam trong leitner.ts), kể cả
 * khi trước đó câu này đã từng được rút ra khỏi nhật ký.
 */
async function recordWrongAnswersFromExam(
  studentId: string,
  wrongQuestionIds: string[],
): Promise<void> {
  if (wrongQuestionIds.length === 0) return;
  const nowIso = new Date().toISOString();
  const rows = wrongQuestionIds.map((question_id) => {
    const state = markWrongFromExam(nowIso);
    return {
      student_id: studentId,
      question_id,
      last_wrong_at: nowIso,
      correct_streak: state.correctStreak,
      last_reviewed_session_id: state.lastReviewedSessionId,
      retired_at: state.retiredAt,
    };
  });
  const { error } = await supabase
    .from("wrong_answer_journal")
    .upsert(rows, { onConflict: "student_id,question_id" });
  if (error) throw error;
}

/**
 * Chấm điểm toàn bộ 1 lượt làm bài dựa trên answer_events đã ghi nhận,
 * ghi vào question_responses + attempt_scores, rồi đánh dấu đã nộp bài.
 * `studentId` (không bắt buộc) dùng để tự động ghi câu sai vào nhật ký ôn
 * tập của học sinh đó — truyền vào từ trang làm bài (đã có sẵn qua useAuth).
 *
 * `invalidatedReason` (không bắt buộc): truyền vào khi bài bị TỰ ĐỘNG huỷ do
 * vi phạm giám sát (xem src/lib/proctoring.ts) — điểm vẫn được chấm và lưu
 * bình thường như mọi lượt khác, chỉ đánh dấu `invalidated=true` để giáo viên
 * biết đây không phải kết quả hợp lệ.
 */
export async function submitAttempt(
  attemptId: string,
  examId: string,
  studentId?: string,
  invalidatedReason?: string,
): Promise<AttemptScoreRow> {
  const examQuestions = await getExamQuestions(examId);
  const [{ data: events, error: evErr }, { data: viewEvents, error: veErr }] =
    await Promise.all([
      supabase
        .from("answer_events")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("created_at"),
      supabase
        .from("question_view_events")
        .select("*")
        .eq("attempt_id", attemptId)
        .order("created_at"),
    ]);
  if (evErr) throw evErr;
  if (veErr) throw veErr;

  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  const responsesToInsert: Record<string, unknown>[] = [];
  const wrongQuestionIds: string[] = [];

  for (const eq of examQuestions) {
    const q = eq.question;
    const qEvents = (events ?? []).filter(
      (e) => e.question_id === q.id,
    );
    const finalAnswer = qEvents.length
      ? qEvents[qEvents.length - 1].answer_value
      : null;
    const changeCount = Math.max(0, qEvents.length - 1);
    const firstAt = qEvents.length ? qEvents[0].created_at : null;
    const lastAt = qEvents.length
      ? qEvents[qEvents.length - 1].created_at
      : null;

    // Ưu tiên tính thời gian "tập trung" thực tế từ question_view_events (cộng dồn
    // mọi lượt quay lại xem câu này). Nếu vì lý do nào đó không có view events
    // (ví dụ lượt làm bài cũ trước khi có tính năng này) thì mới dùng cách cũ:
    // khoảng cách từ lần chọn đáp án đầu tới lần cuối.
    const qViewEvents = (viewEvents ?? []).filter(
      (e) => e.question_id === q.id,
    );
    const timeSpentSeconds =
      qViewEvents.length > 0
        ? computeActiveSeconds(qViewEvents)
        : firstAt && lastAt
          ? Math.max(
              0,
              Math.round(
                (new Date(lastAt).getTime() - new Date(firstAt).getTime()) /
                  1000,
              ),
            )
          : 0;

    let score = 0;
    let subCorrectCount: number | null = null;

    if (q.part === 1) {
      const correct = (q.correct_answer as Part1Answer).choice;
      score = scorePart1Question(
        correct,
        (finalAnswer as Part1Answer | null)?.choice ?? null,
      );
    } else if (q.part === 2) {
      const correct = q.correct_answer as Part2Answer;
      const result = scorePart2Question(
        correct,
        finalAnswer as Partial<Part2Answer> | null,
      );
      score = result.score;
      subCorrectCount = result.correctCount;
    } else {
      const correct = q.correct_answer as Part3Answer;
      score = scorePart3Question(
        correct.value,
        (finalAnswer as Part3Answer | null)?.value ?? null,
        q.default_points ?? 0.5,
      );
    }

    if (q.part === 1) part1Score += score;
    else if (q.part === 2) part2Score += score;
    else part3Score += score;

    if (score < questionMaxScore(q)) wrongQuestionIds.push(q.id);

    responsesToInsert.push({
      attempt_id: attemptId,
      question_id: q.id,
      final_answer: finalAnswer,
      score,
      sub_correct_count: subCorrectCount,
      time_spent_seconds: timeSpentSeconds,
      change_count: changeCount,
      first_response_at: firstAt,
      last_response_at: lastAt,
    });
  }

  // Ghi đè question_responses cho lượt làm bài này (idempotent nếu bấm nộp lại)
  await supabase.from("question_responses").delete().eq(
    "attempt_id",
    attemptId,
  );
  if (responsesToInsert.length > 0) {
    const { error: respErr } = await supabase
      .from("question_responses")
      .insert(responsesToInsert);
    if (respErr) throw respErr;
  }

  const totals = combineScores(part1Score, part2Score, part3Score);

  const { data: scoreRow, error: scoreErr } = await supabase
    .from("attempt_scores")
    .upsert({
      attempt_id: attemptId,
      part1_score: totals.part1Score,
      part2_score: totals.part2Score,
      part3_score: totals.part3Score,
      total_score: totals.totalScore,
    })
    .select()
    .single();
  if (scoreErr) throw scoreErr;

  await supabase
    .from("exam_attempts")
    .update({
      submitted_at: new Date().toISOString(),
      ...(invalidatedReason ? { invalidated: true, invalidated_reason: invalidatedReason } : {}),
    })
    .eq("id", attemptId);

  if (studentId) {
    await recordWrongAnswersFromExam(studentId, wrongQuestionIds);
  }

  return scoreRow as AttemptScoreRow;
}

export async function getAttempt(
  attemptId: string,
): Promise<(ExamAttemptRow & { exam: ExamRow }) | null> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*, exam:exams(*)")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as (ExamAttemptRow & { exam: ExamRow }) | null;
}

export async function getAttemptScore(
  attemptId: string,
): Promise<AttemptScoreRow | null> {
  const { data, error } = await supabase
    .from("attempt_scores")
    .select("*")
    .eq("attempt_id", attemptId)
    .maybeSingle();
  if (error) throw error;
  return data as AttemptScoreRow | null;
}

export async function listStudentAttempts(
  studentId: string,
): Promise<(ExamAttemptRow & { exam: ExamRow; score: AttemptScoreRow | null })[]> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*, exam:exams(*), score:attempt_scores(*)")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data as unknown[]).map((row) => {
    const r = row as ExamAttemptRow & {
      exam: ExamRow;
      score: AttemptScoreRow[] | AttemptScoreRow | null;
    };
    return {
      ...r,
      score: Array.isArray(r.score) ? r.score[0] ?? null : r.score,
    };
  });
}

export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function listStudents(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "student")
    .order("full_name");
  if (error) throw error;
  return data as Profile[];
}

/**
 * Thống kê đúng/sai theo DẠNG BÀI (question_type_id) cho 1 học sinh.
 *
 * KHÔNG CÒN ĐƯỢC GỌI Ở ĐÂU (audit 24/08/2026) — trước đây dùng cho báo cáo
 * phụ huynh + dashboard GV, nhưng vì question_type_id chưa được giáo viên
 * gán cho câu hỏi nào nên kết quả luôn gần như rỗng; đã đổi 2 nơi đó sang
 * getStudentChapterStats (theo CHƯƠNG, có dữ liệu thật). Giữ lại hàm này
 * (không xoá) vì vẫn đúng và sẽ hữu ích lại ngay khi dạng bài được gán thật
 * (xem dự án "Learning Lab" — tạm hoãn, không phải bị bỏ).
 */
export async function getStudentTopicStats(studentId: string): Promise<
  { question_type_id: string; type_name: string; total: number; correctScore: number; maxScore: number }[]
> {
  const { data, error } = await supabase
    .from("question_responses")
    .select(
      "score, question:questions(part, default_points, question_type:question_types!questions_question_type_id_fkey(id, name)), attempt:exam_attempts!inner(student_id)",
    )
    .eq("attempt.student_id", studentId);
  if (error) throw error;

  const map = new Map<
    string,
    { type_name: string; total: number; correctScore: number; maxScore: number }
  >();

  for (const row of data as unknown[]) {
    const r = row as {
      score: number;
      question: {
        part: 1 | 2 | 3;
        default_points: number | null;
        question_type: { id: string; name: string } | null;
      };
    };
    const qt = r.question.question_type;
    if (!qt) continue;
    const maxForQuestion =
      r.question.part === 1 ? 0.25 : r.question.part === 2 ? 1 : r.question.default_points ?? 0.5;
    const existing = map.get(qt.id) ?? {
      type_name: qt.name,
      total: 0,
      correctScore: 0,
      maxScore: 0,
    };
    existing.total += 1;
    existing.correctScore += r.score;
    existing.maxScore += maxForQuestion;
    map.set(qt.id, existing);
  }

  return Array.from(map.entries()).map(([question_type_id, v]) => ({
    question_type_id,
    ...v,
  }));
}

/**
 * Thống kê đúng/sai theo CHƯƠNG (topics) cho 1 học sinh — dùng cho dashboard
 * tổng quan giáo viên (mục 19.4 — Đợt 3). Xem chapterStats.ts để biết lý do
 * dùng CHƯƠNG thay vì "dạng bài" (question_type_id).
 *
 * LƯU Ý QUAN TRỌNG: bảng `questions` có 2 khoá ngoại tới `topics`
 * (`topic_id` và `ai_suggested_topic_id`) — PostgREST không tự biết nên dùng
 * khoá nào khi embed `topics` từ `questions` nếu không chỉ rõ, sẽ ném lỗi
 * PGRST201 "more than one relationship was found". Vì vậy bắt buộc chỉ rõ
 * `topics!questions_topic_id_fkey(...)` ở đây (đúng khoá `topic_id` đã được
 * giáo viên XÁC NHẬN, không phải `ai_suggested_topic_id` — gợi ý AI chưa
 * chắc đúng nên không dùng để thống kê).
 */
export async function getStudentChapterStats(studentId: string): Promise<ChapterStat[]> {
  const { data, error } = await supabase
    .from("question_responses")
    .select(
      "score, question:questions(part, default_points, topic:topics!questions_topic_id_fkey(id, name)), attempt:exam_attempts!inner(student_id)",
    )
    .eq("attempt.student_id", studentId);
  if (error) throw error;

  const map = new Map<string, ChapterStat>();

  for (const row of data as unknown[]) {
    const r = row as {
      score: number;
      question: {
        part: 1 | 2 | 3;
        default_points: number | null;
        topic: { id: string; name: string } | null;
      };
    };
    const topic = r.question.topic;
    if (!topic) continue; // câu chưa được gán chương (topic_id null) -> không tính vào thống kê chương
    const maxForQuestion = questionMaxScore(r.question);
    const existing = map.get(topic.id) ?? {
      topic_id: topic.id,
      topic_name: topic.name,
      total: 0,
      correctScore: 0,
      maxScore: 0,
    };
    existing.total += 1;
    existing.correctScore += r.score;
    existing.maxScore += maxForQuestion;
    map.set(topic.id, existing);
  }

  return Array.from(map.values());
}

/** Thống kê theo chương gộp của NHIỀU học sinh (mặc định "cả lớp") — gọi
 * song song getStudentChapterStats cho từng học sinh rồi gộp bằng
 * mergeChapterStats (hàm thuần, xem chapterStats.ts). */
export async function getClassChapterStats(studentIds: string[]): Promise<ChapterStat[]> {
  if (studentIds.length === 0) return [];
  const perStudent = await Promise.all(studentIds.map((id) => getStudentChapterStats(id)));
  return mergeChapterStats(perStudent);
}

export interface AttemptQuestionDetail {
  question_id: string;
  part: 1 | 2 | 3;
  order_index: number;
  content_latex: string;
  /** ĐỔI 24/08/2026: trước đây là question_type_id/type_name (dạng bài, luôn
   * null trong thực tế) — xem ghi chú đầy đủ tại TopicOutcomeGroup trong
   * diagnosis.ts. Đổi sang CHƯƠNG (topic_id), có dữ liệu thật. */
  topic_id: string | null;
  topic_name: string | null;
  score: number;
  maxScore: number;
  scoreRatio: number;
  timeSpentSeconds: number;
  changeCount: number;
  /** false nếu học sinh không nộp đáp án nào cho câu này (final_answer = null). */
  answered: boolean;
}

export interface AttemptDiagnostics {
  perQuestion: AttemptQuestionDetail[];
  byTopic: ReturnType<typeof diagnoseAllTopics>;
  /** Chẩn đoán nguyên nhân bỏ trống — xem classifyBlankQuestions trong diagnosis.ts. */
  blankQuestions: BlankQuestionSummary;
}

/**
 * Dữ liệu chi tiết cho dashboard hiển thị ngay sau khi học sinh nộp bài:
 * điểm/thời gian/số lần đổi đáp án từng câu, và chẩn đoán theo CHƯƠNG (chỉ
 * dựa trên lượt làm bài NÀY — xem getStudentChapterStats nếu cần gộp nhiều
 * lượt làm bài để chẩn đoán chính xác hơn).
 */
export async function getAttemptDiagnostics(
  attemptId: string,
  examId: string,
): Promise<AttemptDiagnostics> {
  const [examQuestions, { data: responses, error }, { data: viewEvents, error: veErr }] =
    await Promise.all([
      getExamQuestions(examId),
      supabase
        .from("question_responses")
        .select(
          "question_id, final_answer, score, time_spent_seconds, change_count, question:questions(topic_id, topic:topics!questions_topic_id_fkey(name))",
        )
        .eq("attempt_id", attemptId),
      // Chỉ cần sự kiện "enter" để biết học sinh có từng mở câu hỏi ra xem hay
      // chưa — dùng cho chẩn đoán "chua_kip_doc" vs "doc_roi_bo_qua" bên dưới.
      supabase
        .from("question_view_events")
        .select("question_id")
        .eq("attempt_id", attemptId)
        .eq("event_type", "enter"),
    ]);
  if (error) throw error;
  if (veErr) throw veErr;

  type ResponseRow = {
    question_id: string;
    final_answer: unknown;
    score: number;
    time_spent_seconds: number;
    change_count: number;
    question: {
      topic_id: string | null;
      topic: { name: string } | null;
    } | null;
  };
  const responseMap = new Map<string, ResponseRow>(
    (responses as unknown as ResponseRow[]).map((r) => [r.question_id, r]),
  );
  const viewedQuestionIds = new Set(
    (viewEvents as { question_id: string }[]).map((e) => e.question_id),
  );

  const perQuestion: AttemptQuestionDetail[] = examQuestions.map((eq) => {
    const q = eq.question;
    const resp = responseMap.get(q.id);
    const maxScore =
      q.part === 1 ? 0.25 : q.part === 2 ? 1 : q.default_points ?? 0.5;
    const score = resp?.score ?? 0;
    return {
      question_id: q.id,
      part: q.part,
      order_index: eq.order_index,
      content_latex: q.content_latex,
      topic_id: resp?.question?.topic_id ?? q.topic_id,
      topic_name: resp?.question?.topic?.name ?? null,
      score,
      maxScore,
      scoreRatio: maxScore > 0 ? Math.min(1, score / maxScore) : 0,
      timeSpentSeconds: resp?.time_spent_seconds ?? 0,
      changeCount: resp?.change_count ?? 0,
      answered: (resp?.final_answer ?? null) !== null,
    };
  });

  const blankQuestions = classifyBlankQuestions(
    perQuestion.filter((pq) => !pq.answered).map((pq) => pq.question_id),
    viewedQuestionIds,
  );

  const groupMap = new Map<string, TopicOutcomeGroup>();
  for (const pq of perQuestion) {
    if (!pq.topic_id) continue;
    const key = pq.topic_id;
    const existing = groupMap.get(key) ?? {
      topic_id: key,
      topic_name: pq.topic_name ?? "(chưa gán chương)",
      outcomes: [],
    };
    existing.outcomes.push({
      part: pq.part,
      scoreRatio: pq.scoreRatio,
      timeSpentSeconds: pq.timeSpentSeconds,
      changeCount: pq.changeCount,
    });
    groupMap.set(key, existing);
  }

  return {
    perQuestion,
    byTopic: diagnoseAllTopics(Array.from(groupMap.values())),
    blankQuestions,
  };
}

export interface AttemptReviewItem {
  question_id: string;
  part: 1 | 2 | 3;
  order_index: number;
  question: QuestionRow;
  finalAnswer: unknown;
  score: number;
  maxScore: number;
}

/**
 * Dữ liệu đầy đủ để hiển thị lại bài làm của học sinh sau khi nộp bài: từng
 * câu hỏi (nội dung, các phương án, đáp án đúng, lời giải) kèm đáp án học sinh
 * đã chọn và điểm đạt được — dùng cho màn hình "Xem lại bài làm" ở ResultPage.
 * Thứ tự trả về đúng thứ tự học sinh nhìn thấy lúc làm bài (Phần 1 -> 2 -> 3,
 * theo order_index), giống getExamQuestions.
 */
export async function getAttemptReview(
  attemptId: string,
  examId: string,
): Promise<AttemptReviewItem[]> {
  const [examQuestions, { data: responses, error }] = await Promise.all([
    getExamQuestions(examId),
    supabase
      .from("question_responses")
      .select("question_id, final_answer, score")
      .eq("attempt_id", attemptId),
  ]);
  if (error) throw error;

  const responseMap = new Map(
    (responses as { question_id: string; final_answer: unknown; score: number }[]).map(
      (r) => [r.question_id, r],
    ),
  );

  return examQuestions.map((eq) => {
    const q = eq.question;
    const resp = responseMap.get(q.id);
    const maxScore = questionMaxScore(q);
    return {
      question_id: q.id,
      part: q.part,
      order_index: eq.order_index,
      question: q,
      finalAnswer: resp?.final_answer ?? null,
      score: resp?.score ?? 0,
      maxScore,
    };
  });
}

// ---------------------------------------------------------------------------
// Báo cáo
// ---------------------------------------------------------------------------

export async function createReport(input: {
  student_id: string;
  period_start: string;
  period_end: string;
  summary_text: string | null;
  chart_data: unknown;
}) {
  const { data, error } = await supabase
    .from("reports")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listReportsForStudent(studentId: string) {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("student_id", studentId)
    .order("generated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPublicReportByToken(token: string) {
  const { data, error } = await supabase.rpc("get_report_by_token", {
    token,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Ôn tập câu sai (nhật ký + buổi ôn tập kiểu Leitner) — xem src/lib/leitner.ts
// cho toàn bộ logic đếm streak/rút khỏi nhật ký (hàm thuần, có unit test).
// ---------------------------------------------------------------------------

/** Số câu đang cần ôn (chưa rút khỏi nhật ký) — hiện ở trang chủ học sinh. */
export async function getWrongAnswerJournalCount(studentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("wrong_answer_journal")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .is("retired_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function startReviewSession(studentId: string): Promise<ReviewSessionRow> {
  const { data, error } = await supabase
    .from("review_sessions")
    .insert({ student_id: studentId })
    .select()
    .single();
  if (error) throw error;
  return data as ReviewSessionRow;
}

export async function finishReviewSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from("review_sessions")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

/**
 * Đếm số buổi ôn tập (review_sessions, CẢ LỚP) bắt đầu từ mốc thời gian
 * `sinceIso` trở đi — dùng cho dải thống kê dashboard GV (audit 24/08/2026,
 * bổ sung "Buổi ôn tập tuần này" mà TeacherDashboard.tsx đã cố tình để trống
 * trước đây; chỉ riêng "học sinh cần chú ý" mới cần quy tắc nghiệp vụ chưa
 * chốt, còn số đếm thuần này không cần quy tắc gì cả nên bổ sung được ngay).
 * RLS cho phép giáo viên đọc review_sessions của mọi học sinh.
 */
export async function getReviewSessionCountSince(sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("review_sessions")
    .select("*", { count: "exact", head: true })
    .gte("started_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Toàn bộ câu đang cần ôn (retired_at null) của 1 học sinh — KHÔNG giới hạn
 * số lượng ở đây nữa (trước đây giới hạn cứng 10 câu/lần, bỏ sót các câu còn
 * lại nếu nhật ký có nhiều hơn 10 câu). Trang ôn tập tự chịu trách nhiệm xáo
 * ngẫu nhiên + chia thành nhiều đợt an toàn bằng `reviewBatching.ts`, đảm bảo
 * TẤT CẢ câu trong nhật ký đều được luyện tới trong 1 lượt mở màn hình (chỉ
 * chia nhỏ ra nhiều đợt để không dồn quá tải, không bỏ sót câu nào).
 */
export async function listActiveJournalEntries(
  studentId: string,
): Promise<(WrongAnswerJournalRow & { question: QuestionRow })[]> {
  const { data, error } = await supabase
    .from("wrong_answer_journal")
    .select("*, question:questions(*)")
    .eq("student_id", studentId)
    .is("retired_at", null);
  if (error) throw error;
  return data as unknown as (WrongAnswerJournalRow & { question: QuestionRow })[];
}

/**
 * Ghi nhận 1 lượt trả lời trong buổi ôn tập: cập nhật streak theo đúng quy
 * tắc Leitner (applyReviewResult, đã unit test riêng) rồi ghi lại vào
 * wrong_answer_journal + log vào review_session_answers.
 */
export async function submitReviewAnswer(input: {
  sessionId: string;
  studentId: string;
  questionId: string;
  isCorrect: boolean;
}): Promise<void> {
  const { sessionId, studentId, questionId, isCorrect } = input;
  const { data: existing, error: fetchErr } = await supabase
    .from("wrong_answer_journal")
    .select("correct_streak, last_reviewed_session_id, retired_at")
    .eq("student_id", studentId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const current: JournalStreakState = existing
    ? {
        correctStreak: existing.correct_streak,
        lastReviewedSessionId: existing.last_reviewed_session_id,
        retiredAt: existing.retired_at,
      }
    : { correctStreak: 0, lastReviewedSessionId: null, retiredAt: null };

  const nowIso = new Date().toISOString();
  const next = applyReviewResult(current, sessionId, isCorrect, nowIso);

  const { error: updateErr } = await supabase
    .from("wrong_answer_journal")
    .update({
      correct_streak: next.correctStreak,
      last_reviewed_session_id: next.lastReviewedSessionId,
      retired_at: next.retiredAt,
    })
    .eq("student_id", studentId)
    .eq("question_id", questionId);
  if (updateErr) throw updateErr;

  const { error: logErr } = await supabase.from("review_session_answers").insert({
    session_id: sessionId,
    question_id: questionId,
    is_correct: isCorrect,
  });
  if (logErr) throw logErr;
}

// ---------------------------------------------------------------------------
// Đồng hồ tập trung Pomodoro (kiểu "vườn cây") — xem src/lib/pomodoro.ts cho
// toàn bộ logic tính cấp độ/số cây hôm nay/tháng này (hàm thuần, có unit
// test). Ở đây chỉ ghi/đọc sự kiện thô, không lưu số đã tính sẵn.
// ---------------------------------------------------------------------------

/** Toàn bộ phiên Pomodoro đã hoàn thành của 1 học sinh, mới nhất trước —
 * dùng để tính cấp độ (toàn bộ lịch sử) + số cây hôm nay/tháng này. */
export async function listPomodoroSessions(studentId: string): Promise<PomodoroSessionRow[]> {
  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .select("*")
    .eq("student_id", studentId)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data as PomodoroSessionRow[];
}

/** Ghi nhận 1 phiên tập trung đã hoàn thành trọn vẹn (gọi khi đồng hồ đếm về
 * 0, KHÔNG gọi khi học sinh bấm đặt lại/huỷ giữa chừng). */
export async function recordPomodoroSession(
  studentId: string,
  focusMinutes: number,
): Promise<PomodoroSessionRow> {
  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .insert({ student_id: studentId, focus_minutes: focusMinutes })
    .select()
    .single();
  if (error) throw error;
  return data as PomodoroSessionRow;
}

// ---------------------------------------------------------------------------
// Góc âm nhạc — tối đa 3 playlist YouTube yêu thích/học sinh (vị trí 0/1/2).
// Chỉ lưu URL học sinh dán vào, không gọi API YouTube nào — xem
// src/lib/youtube.ts để trích ID playlist khi nhúng iframe phát nhạc.
// ---------------------------------------------------------------------------

export async function listStudentPlaylists(studentId: string): Promise<StudentPlaylistRow[]> {
  const { data, error } = await supabase
    .from("student_playlists")
    .select("*")
    .eq("student_id", studentId)
    .order("position");
  if (error) throw error;
  return data as StudentPlaylistRow[];
}

/** Thêm/thay playlist ở đúng vị trí (0/1/2) — dùng upsert vì mỗi học sinh chỉ
 * có đúng 1 dòng cho mỗi vị trí (unique(student_id, position) ở migration_009). */
export async function saveStudentPlaylist(input: {
  student_id: string;
  position: 0 | 1 | 2;
  label: string;
  url: string;
}): Promise<StudentPlaylistRow> {
  const { data, error } = await supabase
    .from("student_playlists")
    .upsert(input, { onConflict: "student_id,position" })
    .select()
    .single();
  if (error) throw error;
  return data as StudentPlaylistRow;
}

export async function deleteStudentPlaylist(id: string): Promise<void> {
  const { error } = await supabase.from("student_playlists").delete().eq("id", id);
  if (error) throw error;
}
