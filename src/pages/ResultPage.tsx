import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { AttemptDiagnostics, AttemptReviewItem, ExamScoreDistribution, StudentLearningBundle } from "../lib/api";
import { diagnoseTopic } from "../lib/diagnosis";
import {
  buildExamAutopsy,
  factToOutcome,
  summarizePatternRecurrence,
  toPatternOccurrences,
  type ErrorInstance,
} from "../lib/errorIntelligence";
import { buildBloomBreakdown, buildLearningProfile, generateInsightNarrative, type BloomCell } from "../lib/learningState";
import { buildLessonEvidence, type LessonEvidence, type PrereqEdge } from "../lib/knowledgeGraph";
import {
  CAUSE_LABELS,
  buildActions,
  buildHeadline,
  classifyLosses,
  dominantCause,
  lessonLossRows,
  lossBlocks,
  percentileOf,
  scoreBand,
  summarizeCauses,
  tierSummary,
  type QuestionOutcomeInput,
} from "../lib/resultReport";
import { ResultSlip } from "../components/ResultSlip";
import { useAuth } from "../lib/auth";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";
import "../components/student-result/student-intelligence.css";
import "../components/student-result/student-intelligence-report.css";
import { scrollToSection, useScrollSpy } from "../components/student-result/useScrollSpy";
import { requestScrollFrame } from "../components/student-result/scrollFrames";
import { ReportTopBar } from "../components/student-result/ReportTopBar";
import { ReportNav, type ReportNavItem } from "../components/student-result/ReportNav";
import { StackedPair } from "../components/student-result/StackedPair";
import { SummaryChapter, type SummaryAnswer } from "../components/student-result/SummaryChapter";
import { PositionChapter, type TierChip } from "../components/student-result/PositionChapter";
import { DiagnosisChapter } from "../components/student-result/DiagnosisChapter";
import { ChapterTransition } from "../components/student-result/ChapterTransition";
import { ActionChapter } from "../components/student-result/ActionChapter";
import { GuestSaveCard } from "../components/student-result/GuestSaveCard";
import { AppendixChapter, type AppendixItem } from "../components/student-result/AppendixChapter";
import { MobileActionBar } from "../components/student-result/MobileActionBar";
import { topRootCauseChain } from "../components/student-result/rootCauseChain";
import { PointLossMap } from "../components/student-result/PointLossMap";
import { ErrorDnaPanel } from "../components/student-result/ErrorDnaPanel";
import { ThinkingProfile } from "../components/student-result/ThinkingProfile";
import { PatternInsights } from "../components/student-result/PatternInsights";
import { RootCauseInsight, type RootCauseTarget } from "../components/student-result/RootCauseInsight";
import { QuestionReviewSection, type ReviewCommand } from "../components/student-result/QuestionReviewSection";
import { formatPoints } from "../components/student-result/resultFormat";

/**
 * Báo cáo năng lực sau khi nộp bài (01/10/2026) — 4 chương + phụ lục, kể
 * chuyện theo cuộn (scrollytelling). Đã chốt với Thầy Tường:
 *
 *  Tóm lược  — trả lời 3 câu hỏi ngay màn đầu: Vị trí / Nguyên nhân / Việc số 1.
 *  Vị trí    — phân vị (đề >= 20 lượt làm lần đầu, RPC migration_021) hoặc nhóm
 *              năng lực theo thang cố định; 3 phần thi; tầng tư duy.
 *  Chẩn đoán — 3 nhóm nguyên nhân Kiến thức / Thực thi / Nhịp độ (+ Chưa định vị),
 *              tính theo ĐIỂM rơi; 1 mắt xích gốc rễ mạnh nhất.
 *  Hành động — tối đa 3 việc cụ thể (lib/resultReport.ts → buildActions).
 *  Phụ lục   — ngăn kéo chứa chi tiết, dùng lại các component đã có
 *              (QuestionReviewSection, PatternInsights, ThinkingProfile,
 *              PointLossMap, ErrorDnaPanel, RootCauseInsight).
 *
 * Chuyển động theo cuộn (kéo tới đâu chạy tới đó): điểm số bay lên thanh trên,
 * xếp lớp CHỈ ở 2 chỗ (Vị trí đè Tóm lược; Hành động trượt lên nền chuyển cảnh),
 * parallax ở Vị trí, 14 ô điểm rơi biến hình ở Chẩn đoán, thẻ bung toàn màn hình
 * trước Hành động. Tất cả tắt khi máy bật "giảm chuyển động".
 *
 * Giữ nguyên: phiếu in <ResultSlip/> (chỉ hiện khi in), cảnh báo bài bị huỷ,
 * ghi chú điểm thầy điều chỉnh. Không thêm endpoint nào ngoài RPC phân bố điểm.
 */

const FULL_SCORE_EPSILON = 0.005;

function isBlank(item: AttemptReviewItem): boolean {
  return item.finalAnswer === null || item.finalAnswer === undefined;
}

function isFullScore(item: AttemptReviewItem): boolean {
  return item.maxScore > 0 && item.score >= item.maxScore - FULL_SCORE_EPSILON;
}

type Loadable<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

interface GraphData {
  edges: PrereqEdge[];
  tableMissing: boolean;
  lessonNames: Map<string, string>;
  lessonGrades: Map<string, number>;
}

const EMPTY_NAMES = new Map<string, string>();
const EMPTY_GRADES = new Map<string, number>();
const EMPTY_EVIDENCE = new Map<string, LessonEvidence>();
const EMPTY_ERRORS = new Map<string, ErrorInstance>();

const NAV_ITEMS: ReportNavItem[] = [
  { id: "tom-luoc", label: "Tóm lược" },
  { id: "vi-tri", label: "Vị trí" },
  { id: "chan-doan", label: "Chẩn đoán" },
  { id: "hanh-dong", label: "Hành động" },
  { id: "phu-luc", label: "Phụ lục", appendix: true },
];
const NUMBER_WORDS = ["Không có việc", "Một việc", "Hai việc", "Ba việc"];

export function ResultPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { attemptId } = useParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<(ExamAttemptRow & { exam: ExamRow }) | null>(null);
  const [score, setScore] = useState<AttemptScoreRow | null>(null);
  const [diagnostics, setDiagnostics] = useState<AttemptDiagnostics | null>(null);
  const [review, setReview] = useState<AttemptReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bundleState, setBundleState] = useState<Loadable<StudentLearningBundle>>({ status: "loading" });
  const [graphState, setGraphState] = useState<Loadable<GraphData>>({ status: "loading" });
  const [distribution, setDistribution] = useState<ExamScoreDistribution | null>(null);
  const [reviewCommand, setReviewCommand] = useState<ReviewCommand | null>(null);
  const [appendixOpen, setAppendixOpen] = useState<Set<string>>(() => new Set());
  const [appendixMounted, setAppendixMounted] = useState<Set<string>>(() => new Set());
  // Tên lớp cho phiếu kết quả (ResultSlip) — tra qua bảng classes (migration_013).
  const [className, setClassName] = useState<string | null>(null);

  // Khách vừa tạo tài khoản ngay trên trang này: giữ thẻ "Lưu hồ sơ" để hiện
  // lời xác nhận (lúc đó profile.is_guest đã thành false).
  const [shownAsGuest, setShownAsGuest] = useState(false);
  useEffect(() => {
    if (profile?.is_guest) setShownAsGuest(true);
  }, [profile?.is_guest]);

  const hostRef = useRef<HTMLDivElement>(null);
  const scorePlaceholderRef = useRef<HTMLSpanElement>(null);
  const appendixRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!profile?.class_id) {
      setClassName(null);
      return;
    }
    api
      .listClasses()
      .then((classes) => setClassName(classes.find((c) => c.id === profile.class_id)?.name ?? null))
      .catch((err) => console.error("Không lấy được tên lớp:", err));
  }, [profile?.class_id]);

  useEffect(() => {
    if (!attemptId) return;
    (async () => {
      const a = await api.getAttempt(attemptId);
      setAttempt(a);
      const [s, d, r] = await Promise.all([
        api.getAttemptScore(attemptId),
        a ? api.getAttemptDiagnostics(attemptId, a.exam_id) : Promise.resolve(null),
        a ? api.getAttemptReview(attemptId, a.exam_id) : Promise.resolve([]),
      ]);
      setScore(s);
      setDiagnostics(d);
      setReview(r);
      setLoading(false);
    })();
  }, [attemptId]);

  // Dữ liệu phân tích — tải riêng, KHÔNG chặn phần điểm.
  const studentId = attempt?.student_id ?? null;
  const examId = attempt?.exam_id ?? null;
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setBundleState({ status: "loading" });
    api
      .getStudentLearningBundle(studentId)
      .then((data) => !cancelled && setBundleState({ status: "ready", data }))
      .catch((err) => {
        console.error("Không tải được dữ liệu phân tích:", err);
        if (!cancelled) setBundleState({ status: "error", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    api
      .getExamScoreDistribution(examId)
      .then((d) => !cancelled && setDistribution(d))
      .catch((err) => console.error("Không lấy được phân bố điểm:", err));
    return () => {
      cancelled = true;
    };
  }, [examId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listSkillPrerequisites(), api.listLessons(), api.listTopics()])
      .then(([prereq, lessons, topics]) => {
        if (cancelled) return;
        const gradeOfTopic = new Map(topics.map((t) => [t.id, t.grade]));
        const lessonGrades = new Map<string, number>();
        for (const l of lessons) {
          const g = gradeOfTopic.get(l.topic_id);
          if (g) lessonGrades.set(l.id, g);
        }
        setGraphState({
          status: "ready",
          data: { edges: prereq.edges, tableMissing: prereq.tableMissing, lessonNames: new Map(lessons.map((l) => [l.id, l.name])), lessonGrades },
        });
      })
      .catch((err) => {
        console.error("Không tải được bản đồ kiến thức:", err);
        if (!cancelled) setGraphState({ status: "error", message: (err as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Font tải xong / dữ liệu về làm bố cục đổi -> đo lại các hiệu ứng theo cuộn.
  useEffect(() => {
    requestScrollFrame();
    document.fonts?.ready.then(() => requestScrollFrame()).catch(() => undefined);
  }, [loading, bundleState.status, distribution]);

  const analysis = useMemo(() => {
    if (bundleState.status !== "ready" || !attemptId) return null;
    const bundle = bundleState.data;
    const attemptFacts = bundle.facts.filter((f) => f.attemptId === attemptId);
    const attemptInstances = bundle.instances.filter((i) => i.attemptId === attemptId);
    const autopsy = buildExamAutopsy(attemptFacts, attemptInstances);
    const recurring = summarizePatternRecurrence(toPatternOccurrences(bundle.instances));
    const bloom = buildBloomBreakdown(attemptFacts);
    const narrative = generateInsightNarrative(
      { bloom, errorDna: autopsy.errorDna, mastery: diagnoseTopic(attemptFacts.map(factToOutcome)) },
      "student",
    );
    // Bằng chứng theo Bài (số liệu TÍCH LUỸ) — dựng giống trang Hồ sơ năng lực.
    const learning = buildLearningProfile(bundle.facts, bundle.instances, {
      now: new Date(),
      audience: "student",
      patternQuestions: bundle.patternQuestions,
    });
    const evidence = buildLessonEvidence(
      learning.topics.flatMap((t) => t.lessons).map((l) => ({ lessonId: l.id, name: l.name, diagnosis: l.mastery })),
      bundle.instances,
    );
    const errorByQuestion = new Map<string, ErrorInstance>(autopsy.wrongQuestions.map((w) => [w.questionId, w]));
    const lessonOf = new Map(attemptFacts.map((f) => [f.questionId, { id: f.lessonId, name: f.lessonName }]));
    return { attemptFacts, autopsy, recurring, bloom, narrative, evidence, errorByQuestion, lessonOf };
  }, [bundleState, attemptId]);
  const analysisStatus: "loading" | "error" | "ready" = bundleState.status;

  // perQuestion đã sắp theo Phần 1 -> 2 -> 3 = số câu học sinh thấy lúc làm bài.
  const questionNumbers = useMemo(
    () => new Map((diagnostics?.perQuestion ?? []).map((q, i) => [q.question_id, i + 1])),
    [diagnostics],
  );

  // ----- Điểm rơi theo nhóm nguyên nhân (lib/resultReport.ts) -------------------
  const report = useMemo(() => {
    const blankReason = new Map((diagnostics?.blankQuestions.items ?? []).map((b) => [b.question_id, b.reason]));
    const inputs: QuestionOutcomeInput[] = (diagnostics?.perQuestion ?? []).map((q, i) => {
      const err = analysis?.errorByQuestion.get(q.question_id) ?? null;
      const lesson = analysis?.lessonOf.get(q.question_id);
      return {
        questionId: q.question_id,
        number: i + 1,
        part: q.part,
        score: q.score,
        maxScore: q.maxScore,
        answered: q.answered,
        timeSpentSeconds: q.timeSpentSeconds,
        lessonId: lesson?.id ?? null,
        lessonName: lesson?.name ?? null,
        errorType: err?.errorType ?? null,
        patternLabel: err?.patternLabel ?? null,
        blankReason: blankReason.get(q.question_id) ?? null,
      };
    });
    const losses = classifyLosses(inputs);
    const summary = summarizeCauses(losses);
    const totalLost = Math.round(losses.reduce((s, l) => s + l.lost, 0) * 100) / 100;
    const lessons = lessonLossRows(losses);
    const { unit, blocks } = lossBlocks(losses);
    return { losses, summary, totalLost, lessons, unit, blocks, dominant: dominantCause(summary) };
  }, [diagnostics, analysis]);

  const bloomCells: BloomCell[] = useMemo(
    () =>
      analysis?.bloom ??
      (diagnostics?.byDifficulty ?? []).map((d) => ({
        difficulty: d.difficulty,
        sampleCount: d.sampleCount,
        accuracy: d.sampleCount > 0 ? d.avgScoreRatio : null,
        label: d.label,
      })),
    [analysis, diagnostics],
  );
  const tierInfo = useMemo(() => tierSummary(bloomCells), [bloomCells]);

  const chainResult = useMemo(() => {
    if (!analysis || graphState.status !== "ready" || graphState.data.tableMissing) return null;
    const targets = report.lessons
      .filter((l) => l.key !== "none")
      .slice(0, 3)
      .map((l) => ({ lessonId: l.key, name: l.name, lost: l.lost }));
    return topRootCauseChain({
      targets,
      edges: graphState.data.edges,
      lessonNames: graphState.data.lessonNames,
      lessonGrades: graphState.data.lessonGrades,
      evidence: analysis.evidence,
    });
  }, [analysis, graphState, report.lessons]);

  const actions = useMemo(() => {
    const recurringHere = analysis?.recurring.find(
      (r) => r.isRecurring && analysis.autopsy.wrongQuestions.some((w) => w.patternLabel === r.patternLabel),
    );
    return buildActions({
      summary: report.summary,
      lessons: report.lessons,
      rootCause: chainResult?.hint ?? null,
      recurringLabel: recurringHere?.patternLabel ?? null,
      allQuestionIds: (diagnostics?.perQuestion ?? []).map((q) => q.question_id),
    });
  }, [report, chainResult, analysis, diagnostics]);

  // ----- Điều hướng ------------------------------------------------------------
  const sectionIds = useMemo(() => NAV_ITEMS.map((n) => n.id), []);
  const { activeId, pin } = useScrollSpy(sectionIds, { enabled: !loading && !!score });

  const navigateTo = useCallback(
    (id: string) => {
      pin(id);
      if (id === "tom-luoc") {
        // Tóm lược là tấm dính (sticky) — cuộn về đầu trang thay vì scrollIntoView.
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      scrollToSection(id);
    },
    [pin],
  );

  const openAppendix = useCallback((key: string) => {
    setAppendixOpen((prev) => new Set(prev).add(key));
    setAppendixMounted((prev) => new Set(prev).add(key));
  }, []);
  const toggleAppendix = useCallback((key: string) => {
    setAppendixOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setAppendixMounted((prev) => new Set(prev).add(key));
  }, []);

  // Deep-link tới 1 hoặc nhiều câu: mở ngăn "Bản kiểm tra từng câu" ở Phụ lục, mở sẵn câu, cuộn tới, nhấn sáng.
  const focusQuestion = useCallback(
    (questionId: string) => {
      openAppendix("review");
      pin("phu-luc");
      setReviewCommand({ kind: "open", questionId, nonce: Date.now() });
    },
    [openAppendix, pin],
  );
  const openQuestions = useCallback(
    (questionIds: string[]) => {
      openAppendix("review");
      pin("phu-luc");
      if (questionIds.length === 0) {
        setReviewCommand({ kind: "filter", filter: "all", nonce: Date.now() });
        window.setTimeout(() => scrollToSection("phu-luc"), 60);
        return;
      }
      setReviewCommand({ kind: "open-many", questionIds, nonce: Date.now() });
    },
    [openAppendix, pin],
  );

  // Khách (đề công khai) phải điền thông tin cơ bản trước khi xem kết quả.
  const isGuest = !!profile?.is_guest;
  if (isGuest && !profile?.info_completed_at && attemptId) {
    return <Navigate to={`/thi/thong-tin/${attemptId}`} replace />;
  }
  if (loading) return <div className="page-loading">Đang tải kết quả...</div>;
  if (!score) return <div className="page-loading">Không tìm thấy kết quả.</div>;

  // ----- Số liệu hiển thị ---------------------------------------------------------
  const total = score.total_score;
  const partStats = ([1, 2, 3] as const).map((part) => {
    const items = review.filter((r) => r.part === part);
    return {
      part,
      count: items.length,
      full: items.filter(isFullScore).length,
      maxPoints: items.reduce((sum, r) => sum + r.maxScore, 0),
      points: part === 1 ? score.part1_score : part === 2 ? score.part2_score : score.part3_score,
    };
  });
  const fullCount = review.filter(isFullScore).length;
  const wrongCount = review.filter((r) => !isBlank(r) && !isFullScore(r)).length;
  const blankCount = review.filter(isBlank).length;

  let durationSeconds: number | null = null;
  if (attempt?.submitted_at) {
    const secs = (new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000;
    if (Number.isFinite(secs) && secs > 0) durationSeconds = secs;
  }
  if (durationSeconds === null) {
    const sum = (diagnostics?.perQuestion ?? []).reduce((s, q) => s + q.timeSpentSeconds, 0);
    if (sum > 0) durationSeconds = sum;
  }
  const limit = attempt?.exam.duration_minutes ?? null;
  const minutesUsed = durationSeconds !== null ? Math.round(durationSeconds / 60) : null;
  const basisParts = [
    `${fullCount}/${review.length} câu trọn điểm`,
    minutesUsed !== null
      ? `${minutesUsed}${limit ? `/${limit}` : ""} phút${limit && durationSeconds !== null && durationSeconds >= limit * 60 - 30 ? ", nộp khi hết giờ" : ""}`
      : null,
    analysis && analysis.autopsy.wrongQuestions.length > 0
      ? `${analysis.autopsy.highConfidenceCount}/${analysis.autopsy.wrongQuestions.length} câu sai có nhãn thầy đối soát`
      : null,
  ].filter(Boolean) as string[];

  const percentile = percentileOf(distribution?.scores, total);
  const band = scoreBand(total);
  const tiers: TierChip[] = bloomCells.map((c) => ({ difficulty: c.difficulty, accuracy: c.accuracy, count: c.sampleCount }));

  // ----- Tóm lược -----------------------------------------------------------------
  const attemptTime = attempt ? new Date(attempt.submitted_at ?? attempt.started_at) : null;
  const metaItems = [
    "Báo cáo năng lực",
    attempt?.exam.title ?? "Bài làm",
    attemptTime ? attemptTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "",
  ].filter(Boolean);
  const analysisPending = analysisStatus === "loading";
  const headline = analysisPending
    ? "Kết quả bài làm"
    : buildHeadline({ totalLost: report.totalLost, dominant: report.dominant, basic: tierInfo.basic });

  const comma = (n: number) => String(n).replace(".", ",");
  const positionAnswer: SummaryAnswer = percentile
    ? { key: "pos", label: "Vị trí", main: `Trên ${percentile.pct}% số lượt làm đề này`, sub: `So với ${percentile.n} lượt làm lần đầu, ẩn danh` }
    : {
        key: "pos",
        label: "Vị trí",
        main: `Nhóm ${band.name} · thang ${comma(band.from)}–${comma(band.to)} điểm`,
        sub: distribution
          ? `Đề mới có ${distribution.n} lượt làm lần đầu, chưa đủ 20 lượt để so vị trí`
          : "Chưa có dữ liệu so sánh giữa các lượt làm đề này",
      };
  const dom = report.dominant ? report.summary.find((s) => s.cause === report.dominant)! : null;
  const causeAnswer: SummaryAnswer = analysisPending
    ? { key: "cause", label: "Nguyên nhân", main: "Đang đối chiếu nhãn lỗi…", sub: "Phần này hiện sau vài giây" }
    : dom
      ? {
          key: "cause",
          label: "Nguyên nhân",
          main: `${CAUSE_LABELS[dom.cause]} chiếm ${formatPoints(dom.points)} / ${formatPoints(report.totalLost)} điểm rơi`,
          highlight: `${formatPoints(dom.points)} / ${formatPoints(report.totalLost)}`,
          sub: dom.questions
            .slice(0, 2)
            .map((q) => `Câu ${q.number}: ${q.note.charAt(0).toLowerCase()}${q.note.slice(1)}`)
            .join("; "),
        }
      : { key: "cause", label: "Nguyên nhân", main: "Không mất điểm câu nào", sub: "Không có điểm rơi cần chẩn đoán" };
  const first = actions[0];
  const actionAnswer: SummaryAnswer = {
    key: "act",
    label: "Việc số 1",
    main: analysisPending ? "Đang lập kế hoạch…" : first.title,
    sub: analysisPending ? "" : `Khoảng ${first.minutes} phút${first.gain !== null ? ` · gỡ được tới ${formatPoints(first.gain)} điểm` : ""}`,
  };
  const ctaLabel =
    first.kind === "questions"
      ? first.questionIds && first.questionIds.length > 0 && report.totalLost > 0
        ? `Bắt đầu với ${first.questionIds.length} câu này`
        : "Xem lại bài làm"
      : first.ctaLabel;
  const scrollToSaveCard = () =>
    document.getElementById("luu-ho-so")?.scrollIntoView({ behavior: "smooth", block: "center" });
  const runFirstAction = () => {
    if (first.kind === "questions") openQuestions(first.questionIds ?? []);
    else if (isGuest) scrollToSaveCard(); // trang học sinh cần tài khoản
    else navigate(first.to ?? "/hoc-sinh");
  };

  const navMeta = [
    { label: "Học sinh", value: profile?.full_name ?? "—" },
    ...(className ? [{ label: "Lớp", value: className }] : []),
    ...(attemptTime
      ? [{ label: "Nộp lúc", value: attemptTime.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) }]
      : []),
  ];
  const chapterLabel = NAV_ITEMS.find((n) => n.id === activeId)?.label ?? "Tóm lược";
  const customScoring = attempt?.exam.scoring_mode === "tuy_chinh";

  // ----- Phụ lục (dùng lại component đã có) ---------------------------------------
  const rootTargets: RootCauseTarget[] = report.lessons
    .filter((l) => l.key !== "none")
    .slice(0, 3)
    .map((l) => ({ lessonId: l.key, name: l.name, pointsLost: l.lost }));
  const graphStatus: "loading" | "error" | "ready" =
    graphState.status === "error" || analysisStatus === "error" ? "error" : graphState.status === "ready" && analysisStatus === "ready" ? "ready" : "loading";
  const appendixItems: AppendixItem[] = [
    {
      key: "review",
      title: "Bản kiểm tra từng câu",
      meta: `${review.length} câu · ${wrongCount} chưa đúng · ${blankCount} bỏ trống`,
      render: () => (
        <QuestionReviewSection
          items={review}
          questionNumbers={questionNumbers}
          errorByQuestion={analysis?.errorByQuestion ?? EMPTY_ERRORS}
          command={reviewCommand}
        />
      ),
    },
    {
      key: "pace",
      title: "Nhịp độ & mẫu lỗi lặp lại",
      meta: "thời gian từng câu so với định mức",
      render: () => (
        <PatternInsights
          patternStatus={analysisStatus}
          recurring={analysis?.recurring ?? []}
          wrongQuestions={analysis?.autopsy.wrongQuestions ?? []}
          perQuestion={diagnostics?.perQuestion ?? []}
          blankSummary={diagnostics?.blankQuestions ?? null}
          onQuestionSelect={focusQuestion}
        />
      ),
    },
    {
      key: "bloom",
      title: "Hồ sơ nhận thức 4 tầng",
      meta:
        tierInfo.basic !== null && tierInfo.advanced !== null
          ? `Nền tảng ${Math.round(tierInfo.basic * 100)}% · Vận dụng ${Math.round(tierInfo.advanced * 100)}%`
          : "độ chính xác theo mức độ tư duy",
      render: () => (
        <ThinkingProfile
          bloom={analysis?.bloom ?? null}
          byDifficulty={diagnostics?.byDifficulty ?? null}
          narrative={analysis?.narrative ?? null}
          narrativeStatus={analysisStatus}
        />
      ),
    },
    {
      key: "loss",
      title: "Bản đồ điểm rơi theo bài",
      meta: `${report.lessons.length} bài`,
      render: () => (
        <PointLossMap
          status={analysisStatus}
          autopsy={analysis?.autopsy ?? null}
          facts={analysis?.attemptFacts ?? []}
          questionNumbers={questionNumbers}
          customScoring={customScoring}
        />
      ),
    },
    {
      key: "dna",
      title: "Giải trình phân loại lỗi từng câu",
      meta: `${report.losses.length} câu có điểm rơi`,
      render: () => (
        <ErrorDnaPanel
          status={analysisStatus}
          autopsy={analysis?.autopsy ?? null}
          recurring={analysis?.recurring ?? []}
          questionNumbers={questionNumbers}
          onQuestionSelect={focusQuestion}
        />
      ),
    },
    {
      key: "root",
      title: "Truy vết nguyên nhân đầy đủ",
      meta: "các bài nền tảng có thể liên quan",
      render: () => (
        <RootCauseInsight
          status={graphStatus}
          tableMissing={graphState.status === "ready" && graphState.data.tableMissing}
          targets={rootTargets}
          edges={graphState.status === "ready" ? graphState.data.edges : []}
          lessonNames={graphState.status === "ready" ? graphState.data.lessonNames : EMPTY_NAMES}
          lessonGrades={graphState.status === "ready" ? graphState.data.lessonGrades : EMPTY_GRADES}
          evidence={analysis?.evidence ?? EMPTY_EVIDENCE}
        />
      ),
    },
  ];

  return (
    <div className="student-intelligence-root student-intelligence-report" ref={hostRef}>
      <ReportTopBar total={total} chapterLabel={chapterLabel} placeholderRef={scorePlaceholderRef} hostRef={hostRef} />

      <div className="student-intelligence-layout">
        <ReportNav items={NAV_ITEMS} activeId={activeId} onNavigate={navigateTo} meta={navMeta} />

        <article className="student-intelligence-report-stream" aria-label="Báo cáo năng lực">
          <StackedPair
            underId="tom-luoc"
            overId="vi-tri"
            underLabel="Tóm lược"
            overLabel="Vị trí"
            under={
              <SummaryChapter
                metaItems={metaItems}
                invalidated={!!attempt?.invalidated}
                adjustment={
                  score.adjusted_at
                    ? { adjustedAt: score.adjusted_at, originalTotal: score.original_total_score ?? null, reason: score.adjustment_reason ?? null }
                    : null
                }
                headline={headline}
                total={total}
                placeholderRef={scorePlaceholderRef}
                answers={[positionAnswer, causeAnswer, actionAnswer]}
                ctaLabel={ctaLabel}
                onCta={runFirstAction}
                onPrint={() => window.print()}
              />
            }
            over={
              <PositionChapter
                total={total}
                percentile={percentile}
                distributionCount={distribution ? distribution.n : null}
                scores={distribution?.scores ?? null}
                parts={partStats}
                tiers={tiers}
                tierInfo={tierInfo}
                basis={basisParts.join(" · ")}
              />
            }
          />

          <section className="student-intelligence-sheet" id="chan-doan" aria-labelledby="t-chan-doan" tabIndex={-1}>
            <span className="student-intelligence-eyebrow">Chương 2 · Chẩn đoán</span>
            <h2 className="student-intelligence-chapter-title" id="t-chan-doan">
              {report.totalLost > 0 ? `Vì sao mất ${formatPoints(report.totalLost)} điểm` : "Không có điểm rơi"}
            </h2>
            <p className="student-intelligence-lede" style={{ marginBottom: 32 }}>
              Mỗi câu chưa trọn điểm được xếp vào một nhóm nguyên nhân, theo căn cứ có thật.
            </p>
            <DiagnosisChapter
              status={analysisStatus}
              totalLost={report.totalLost}
              summary={report.summary}
              blocks={report.blocks}
              unit={report.unit}
              lessons={report.lessons}
              chain={chainResult?.chain ?? null}
              onQuestionSelect={focusQuestion}
            />
          </section>

          <ChapterTransition
            cardKicker="Tiếp theo"
            cardTitle={report.totalLost > 0 ? `${actions.length} việc cho ${formatPoints(report.totalLost)} điểm rơi` : "Giữ phong độ ở đề sau"}
            cardSub="Kéo xuống để mở kế hoạch"
            stageKicker="Chương 3 · Hành động"
            stageTitle={`${NUMBER_WORDS[actions.length] ?? "Các việc"}, xếp theo số điểm gỡ lại được`}
            stageSub={`Bắt đầu từ việc số 1, khoảng ${first.minutes} phút`}
            fadeOutRef={appendixRef}
          />

          <section className="student-intelligence-sheet student-intelligence-sheet--lift" id="hanh-dong" aria-label="Hành động" tabIndex={-1}>
            <ActionChapter
              actions={actions}
              onOpenQuestions={openQuestions}
              lockedLink={isGuest ? { label: "Lưu hồ sơ để mở", onClick: scrollToSaveCard } : undefined}
            />
            {(isGuest || shownAsGuest) && <GuestSaveCard id="luu-ho-so" />}
          </section>

          <section className="student-intelligence-sheet" id="phu-luc" ref={appendixRef} aria-label="Phụ lục" tabIndex={-1}>
            <AppendixChapter items={appendixItems} open={appendixOpen} mounted={appendixMounted} onToggle={toggleAppendix} />
          </section>

          <div className="student-intelligence-report-foot">
            <Link className="student-intelligence-button" to={isGuest ? "/thi" : "/hoc-sinh"}>
              {isGuest ? "Xem các đề miễn phí khác" : "Về trang chủ"}
            </Link>
          </div>
        </article>
      </div>

      <MobileActionBar scoreText={null} ctaLabel={ctaLabel} onCta={runFirstAction} />

      {/* Bản in riêng — chỉ hiện khi in/lưu PDF (xem @media print trong styles.css và ResultSlip.tsx). */}
      {attempt && (
        <ResultSlip
          studentName={profile?.full_name ?? "—"}
          studentClass={className}
          examTitle={attempt.exam.title}
          attemptDateLabel={new Date(attempt.started_at).toLocaleDateString("vi-VN")}
          score={score}
          diagnostics={diagnostics}
          generatedAtLabel={new Date().toLocaleDateString("vi-VN")}
        />
      )}
    </div>
  );
}
