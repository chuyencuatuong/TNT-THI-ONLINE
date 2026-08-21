import { supabase } from "./supabaseClient";
import {
  combineScores,
  scorePart1Question,
  scorePart2Question,
  scorePart3Question,
} from "./scoring";
import { computeActiveSeconds, diagnoseAllTopics, type TopicOutcomeGroup } from "./diagnosis";
import type {
  AttemptScoreRow,
  Difficulty,
  ExamAttemptRow,
  ExamQuestionRow,
  ExamRow,
  Part1Answer,
  Part2Answer,
  Part3Answer,
  Profile,
  QuestionRow,
  QuestionType,
  QuestionViewEventRow,
  Topic,
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
  difficulty: Difficulty | null;
  content_latex: string;
  image_url: string | null;
  options: unknown;
  correct_answer: unknown;
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

export async function createExam(input: {
  title: string;
  description: string | null;
  duration_minutes?: number | null;
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
  patch: Partial<Pick<ExamRow, "title" | "description" | "duration_minutes">>,
): Promise<void> {
  const { error } = await supabase.from("exams").update(patch).eq("id", id);
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

/**
 * Chấm điểm toàn bộ 1 lượt làm bài dựa trên answer_events đã ghi nhận,
 * ghi vào question_responses + attempt_scores, rồi đánh dấu đã nộp bài.
 */
export async function submitAttempt(
  attemptId: string,
  examId: string,
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
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", attemptId);

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

export async function listStudents(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "student")
    .order("full_name");
  if (error) throw error;
  return data as Profile[];
}

/** Thống kê đúng/sai theo dạng bài cho 1 học sinh, dùng cho báo cáo & dashboard GV. */
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

export interface AttemptQuestionDetail {
  question_id: string;
  part: 1 | 2 | 3;
  order_index: number;
  content_latex: string;
  question_type_id: string | null;
  type_name: string | null;
  score: number;
  maxScore: number;
  scoreRatio: number;
  timeSpentSeconds: number;
  changeCount: number;
}

export interface AttemptDiagnostics {
  perQuestion: AttemptQuestionDetail[];
  byTopic: ReturnType<typeof diagnoseAllTopics>;
}

/**
 * Dữ liệu chi tiết cho dashboard hiển thị ngay sau khi học sinh nộp bài:
 * điểm/thời gian/số lần đổi đáp án từng câu, và chẩn đoán theo dạng bài
 * (chỉ dựa trên lượt làm bài NÀY — xem getStudentTopicStats nếu cần gộp
 * nhiều lượt làm bài để chẩn đoán chính xác hơn).
 */
export async function getAttemptDiagnostics(
  attemptId: string,
  examId: string,
): Promise<AttemptDiagnostics> {
  const [examQuestions, { data: responses, error }] = await Promise.all([
    getExamQuestions(examId),
    supabase
      .from("question_responses")
      .select(
        "question_id, score, time_spent_seconds, change_count, question:questions(question_type_id, question_type:question_types!questions_question_type_id_fkey(name))",
      )
      .eq("attempt_id", attemptId),
  ]);
  if (error) throw error;

  type ResponseRow = {
    question_id: string;
    score: number;
    time_spent_seconds: number;
    change_count: number;
    question: {
      question_type_id: string | null;
      question_type: { name: string } | null;
    } | null;
  };
  const responseMap = new Map<string, ResponseRow>(
    (responses as unknown as ResponseRow[]).map((r) => [r.question_id, r]),
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
      question_type_id: resp?.question?.question_type_id ?? q.question_type_id,
      type_name: resp?.question?.question_type?.name ?? null,
      score,
      maxScore,
      scoreRatio: maxScore > 0 ? Math.min(1, score / maxScore) : 0,
      timeSpentSeconds: resp?.time_spent_seconds ?? 0,
      changeCount: resp?.change_count ?? 0,
    };
  });

  const groupMap = new Map<string, TopicOutcomeGroup>();
  for (const pq of perQuestion) {
    if (!pq.question_type_id) continue;
    const key = pq.question_type_id;
    const existing = groupMap.get(key) ?? {
      question_type_id: key,
      type_name: pq.type_name ?? "(chưa gán dạng bài)",
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
  };
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
