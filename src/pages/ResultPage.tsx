import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "../lib/api";
import type { AttemptDiagnostics, AttemptReviewItem, StudentLearningBundle } from "../lib/api";
import { DEFAULT_EXPECTED_TIME_SECONDS, diagnoseTopic } from "../lib/diagnosis";
import {
  buildExamAutopsy,
  factToOutcome,
  summarizePatternRecurrence,
  toPatternOccurrences,
  type ErrorInstance,
} from "../lib/errorIntelligence";
import {
  buildBloomBreakdown,
  buildLearningProfile,
  dominantClassifiedError,
  generateInsightNarrative,
} from "../lib/learningState";
import {
  buildLessonEvidence,
  buildPrereqTree,
  computeRootCauseCandidates,
  type LessonEvidence,
  type PrereqEdge,
} from "../lib/knowledgeGraph";
import { ResultSlip } from "../components/ResultSlip";
import { useAuth } from "../lib/auth";
import type { AttemptScoreRow, ExamAttemptRow, ExamRow } from "../lib/types";
import "../components/student-result/student-intelligence.css";
import { RESULT_SECTIONS, REVIEW_SECTION_ID } from "../components/student-result/resultSections";
import { ResultSection } from "../components/student-result/ResultSection";
import { ResultNav } from "../components/student-result/ResultNav";
import { MobileActionBar } from "../components/student-result/MobileActionBar";
import { scrollToSection, useScrollSpy } from "../components/student-result/useScrollSpy";
import { ResultHero, type HeroPart } from "../components/student-result/ResultHero";
import { ResultMetricStrip } from "../components/student-result/ResultMetricStrip";
import { PointLossMap } from "../components/student-result/PointLossMap";
import { ErrorDnaPanel } from "../components/student-result/ErrorDnaPanel";
import { ThinkingProfile } from "../components/student-result/ThinkingProfile";
import { PatternInsights } from "../components/student-result/PatternInsights";
import { RootCauseInsight, type RootCauseTarget } from "../components/student-result/RootCauseInsight";
import { NextStepPanel, type NextStepInput } from "../components/student-result/NextStepPanel";
import {
  QuestionReviewSection,
  type ReviewCommand,
  type ReviewFilter,
} from "../components/student-result/QuestionReviewSection";
import { formatPoints } from "../components/student-result/resultFormat";

/**
 * Hồ sơ đo lường kết quả (IMPLEMENTATION_PLAN_CLAUDE.md) — trang cuộn dài 8
 * phân mục, thay cho 4 tab cũ.
 *  - Desktop >= 960px: 2 cột bất đối xứng — mục lục dính 01-08 có scrollspy.
 *  - < 960px: 1 cột + thanh hành động dính đáy (MobileActionBar).
 *
 *  01 ResultHero + ResultMetricStrip   05 PatternInsights
 *  02 PointLossMap                     06 RootCauseInsight
 *  03 ErrorDnaPanel                    07 NextStepPanel
 *  04 ThinkingProfile                  08 QuestionReviewSection
 *
 * Nguồn dữ liệu (không thêm endpoint, không viết lại logic):
 *  - getAttempt / getAttemptScore / getAttemptDiagnostics / getAttemptReview:
 *    phần điểm, hiện ngay.
 *  - getStudentLearningBundle: Error DNA, Bloom, mẫu lỗi lặp lại, bằng chứng
 *    theo Bài — tải riêng, không chặn phần điểm.
 *  - listSkillPrerequisites / listLessons / listTopics: đồ thị tiên quyết cho
 *    phân mục 06 (listTopics chỉ để ghi "Lớp 11/12" cạnh tên Bài).
 *
 * Giữ nguyên: phiếu in <ResultSlip/> (chỉ hiện khi in), cảnh báo bài bị huỷ
 * (invalidated) và ghi chú điểm giáo viên điều chỉnh.
 */

const FULL_SCORE_EPSILON = 0.005;
/** Số Bài rơi nhiều điểm nhất được đem đi truy vết ở phân mục 06. */
const ROOT_CAUSE_TARGETS = 3;
const BOTTLENECK_RATIO = 2;

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

// Hằng rỗng ổn định (tránh tạo Map mới mỗi lần render làm useMemo con chạy lại).
const EMPTY_NAMES = new Map<string, string>();
const EMPTY_GRADES = new Map<string, number>();
const EMPTY_EVIDENCE = new Map<string, LessonEvidence>();
const EMPTY_ERRORS = new Map<string, ErrorInstance>();

export function ResultPage() {
  const { profile } = useAuth();
  const { attemptId } = useParams<{ attemptId: string }>();
  const [attempt, setAttempt] = useState<(ExamAttemptRow & { exam: ExamRow }) | null>(null);
  const [score, setScore] = useState<AttemptScoreRow | null>(null);
  const [diagnostics, setDiagnostics] = useState<AttemptDiagnostics | null>(null);
  const [review, setReview] = useState<AttemptReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bundleState, setBundleState] = useState<Loadable<StudentLearningBundle>>({ status: "loading" });
  const [graphState, setGraphState] = useState<Loadable<GraphData>>({ status: "loading" });
  const [reviewCommand, setReviewCommand] = useState<ReviewCommand | null>(null);
  // Tên lớp cho phiếu kết quả (ResultSlip) — tra qua bảng classes
  // (migration_013, 28/08/2026), thay cột student_class cũ đã xoá.
  const [className, setClassName] = useState<string | null>(null);
  // Chỉ bật hiệu ứng hiện dần khi trình duyệt có IntersectionObserver — nếu
  // không, nội dung hiện ngay (không bao giờ bị kẹt ở trạng thái ẩn).
  const [motionReady, setMotionReady] = useState(false);

  useEffect(() => {
    setMotionReady(typeof IntersectionObserver !== "undefined");
  }, []);

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

  // Dữ liệu phân tích — tải riêng, KHÔNG chặn phần điểm: học sinh thấy điểm
  // ngay, các phân mục phân tích hiện sau.
  const studentId = attempt?.student_id ?? null;
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
          data: {
            edges: prereq.edges,
            tableMissing: prereq.tableMissing,
            lessonNames: new Map(lessons.map((l) => [l.id, l.name])),
            lessonGrades,
          },
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
    // Bằng chứng theo Bài cho đồ thị tiên quyết — dựng giống LearningProfile
    // (số liệu TÍCH LUỸ mọi đề) để phân mục 06 khớp với trang Hồ sơ năng lực.
    const learning = buildLearningProfile(bundle.facts, bundle.instances, {
      now: new Date(),
      audience: "student",
      patternQuestions: bundle.patternQuestions,
    });
    const evidence: Map<string, LessonEvidence> = buildLessonEvidence(
      learning.topics.flatMap((t) => t.lessons).map((l) => ({ lessonId: l.id, name: l.name, diagnosis: l.mastery })),
      bundle.instances,
    );
    const errorByQuestion = new Map<string, ErrorInstance>(autopsy.wrongQuestions.map((w) => [w.questionId, w]));
    return { attemptFacts, autopsy, recurring, bloom, narrative, evidence, errorByQuestion };
  }, [bundleState, attemptId]);
  const analysisStatus: "loading" | "error" | "ready" = bundleState.status;

  const rootCauseTargets: RootCauseTarget[] = useMemo(
    () =>
      (analysis?.autopsy.scoreLoss ?? [])
        .filter((r) => r.lessonId)
        .slice(0, ROOT_CAUSE_TARGETS)
        .map((r) => ({ lessonId: r.lessonId as string, name: r.name, pointsLost: r.pointsLost })),
    [analysis],
  );

  // Ứng viên gốc rễ mạnh nhất — chỉ dùng để gợi ý bước 2 của Kế hoạch khắc phục.
  const topRootCause = useMemo(() => {
    if (!analysis || graphState.status !== "ready" || graphState.data.tableMissing) return null;
    const { edges, lessonNames } = graphState.data;
    let best: { foundationName: string; targetName: string; score: number } | null = null;
    for (const t of rootCauseTargets) {
      const tree = buildPrereqTree(t.lessonId, edges, lessonNames, analysis.evidence);
      const c = computeRootCauseCandidates(tree)[0];
      if (c && (!best || c.attributionScore > best.score)) {
        best = { foundationName: c.name, targetName: t.name, score: c.attributionScore };
      }
    }
    return best;
  }, [analysis, graphState, rootCauseTargets]);

  const sectionIds = useMemo(() => RESULT_SECTIONS.map((s) => s.id), []);
  const { activeId, pin } = useScrollSpy(sectionIds, { enabled: !loading && !!score });

  const navigateTo = useCallback(
    (id: string) => {
      pin(id);
      scrollToSection(id);
    },
    [pin],
  );

  // Deep-link tới 1 câu ở phân mục 08: QuestionReviewSection tự bỏ lọc nếu
  // cần, mở sẵn câu, cuộn mượt tới và nhấn sáng 2 giây.
  const focusQuestion = useCallback(
    (questionId: string) => {
      pin(REVIEW_SECTION_ID);
      setReviewCommand({ kind: "open", questionId, nonce: Date.now() });
    },
    [pin],
  );

  const reviewWith = useCallback(
    (filter: ReviewFilter) => {
      setReviewCommand({ kind: "filter", filter, nonce: Date.now() });
      navigateTo(REVIEW_SECTION_ID);
    },
    [navigateTo],
  );

  // Thống kê theo từng phần thi — điểm tối đa lấy từ chính đề (maxScore từng
  // câu), nên đúng cả với đề chuẩn THPT lẫn đề tính điểm tuỳ chỉnh.
  const partStats = useMemo(
    () =>
      ([1, 2, 3] as const).map((part) => {
        const items = review.filter((r) => r.part === part);
        return {
          part,
          count: items.length,
          full: items.filter(isFullScore).length,
          maxPoints: items.reduce((sum, r) => sum + r.maxScore, 0),
        };
      }),
    [review],
  );
  const wrongCount = review.filter((r) => !isBlank(r) && !isFullScore(r)).length;
  const blankCount = review.filter(isBlank).length;
  const fullCount = review.filter(isFullScore).length;

  // perQuestion đã được sắp theo đúng thứ tự Phần 1 -> 2 -> 3 (xem
  // api.getExamQuestions) = số thứ tự học sinh nhìn thấy lúc làm bài.
  const questionNumbers = useMemo(
    () => new Map((diagnostics?.perQuestion ?? []).map((q, i) => [q.question_id, i + 1])),
    [diagnostics],
  );

  if (loading) return <div className="page-loading">Đang tải kết quả...</div>;
  if (!score) return <div className="page-loading">Không tìm thấy kết quả.</div>;

  const partPoints: Record<1 | 2 | 3, number> = {
    1: score.part1_score,
    2: score.part2_score,
    3: score.part3_score,
  };
  const heroParts: HeroPart[] = partStats.map((p) => ({ ...p, points: partPoints[p.part] }));
  const examMax = partStats.reduce((s, p) => s + p.maxPoints, 0) || 10;

  // Thời gian làm bài: ưu tiên mốc bắt đầu -> nộp bài; thiếu mốc nộp thì cộng
  // thời gian tập trung từng câu (perQuestion). Không có gì -> null.
  let durationSeconds: number | null = null;
  if (attempt?.submitted_at) {
    const secs = (new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000;
    if (Number.isFinite(secs) && secs > 0) durationSeconds = secs;
  }
  if (durationSeconds === null) {
    const sum = (diagnostics?.perQuestion ?? []).reduce((s, q) => s + q.timeSpentSeconds, 0);
    if (sum > 0) durationSeconds = sum;
  }

  // --- Đầu vào Kế hoạch khắc phục (07) ---------------------------------------
  const dominant = analysis ? dominantClassifiedError(analysis.autopsy.errorDna) : null;
  const recurringHere = analysis
    ? analysis.recurring.find(
        (r) => r.isRecurring && analysis.autopsy.wrongQuestions.some((w) => w.patternLabel === r.patternLabel),
      )
    : undefined;
  const pacingIssue =
    (diagnostics?.blankQuestions.timeoutCount ?? 0) > 0 ||
    (diagnostics?.perQuestion ?? []).some(
      (q) =>
        q.answered &&
        q.scoreRatio < 1 - FULL_SCORE_EPSILON &&
        q.timeSpentSeconds >= BOTTLENECK_RATIO * DEFAULT_EXPECTED_TIME_SECONDS[q.part],
    );
  const nextStep: NextStepInput = {
    wrongCount,
    blankCount,
    topLossName: analysis?.autopsy.scoreLoss[0]?.name ?? null,
    dominantType: dominant?.errorType ?? null,
    rootCause: topRootCause
      ? { foundationName: topRootCause.foundationName, targetName: topRootCause.targetName }
      : null,
    recurringLabel: recurringHere?.patternLabel ?? null,
    pacingIssue,
  };

  // --- Thông tin chung ------------------------------------------------------
  const scoreText = `${formatPoints(score.total_score)}/10`;
  const ctaLabel = wrongCount > 0 ? `Ôn lại ${wrongCount} câu sai` : "Xem lại bài làm";
  const goToReview = () => reviewWith(wrongCount > 0 ? "wrong" : "all");
  const attemptTime = attempt ? new Date(attempt.submitted_at ?? attempt.started_at) : null;
  const navMeta = [
    { label: "Học sinh", value: profile?.full_name ?? "—" },
    ...(className ? [{ label: "Lớp", value: className }] : []),
    ...(attemptTime
      ? [
          {
            label: "Thời điểm",
            value: attemptTime.toLocaleString("vi-VN", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
          },
        ]
      : []),
  ];
  const [sec01, sec02, sec03, sec04, sec05, sec06, sec07, sec08] = RESULT_SECTIONS;
  const customScoring = attempt?.exam.scoring_mode === "tuy_chinh";
  const graphStatus: "loading" | "error" | "ready" =
    graphState.status === "error" || analysisStatus === "error"
      ? "error"
      : graphState.status === "ready" && analysisStatus === "ready"
        ? "ready"
        : "loading";

  return (
    <div className={`student-intelligence-root${motionReady ? " student-intelligence-motion-ready" : ""}`}>
      <div className="student-intelligence-layout">
        <ResultNav
          sections={RESULT_SECTIONS}
          activeId={activeId}
          onNavigate={navigateTo}
          meta={navMeta}
          cta={{ label: ctaLabel, onClick: goToReview }}
        />

        <article className="student-intelligence-stream" aria-label="Hồ sơ đo lường kết quả">
          {/* ------------------------------------------------------------ 01 */}
          <ResultSection meta={sec01}>
            <ResultHero
              examTitle={attempt?.exam.title ?? null}
              dateLabel={attemptTime ? attemptTime.toLocaleDateString("vi-VN") : null}
              scaleLabel={customScoring ? "Thang điểm tuỳ chỉnh của đề" : "Cấu trúc chuẩn Bộ GD&ĐT"}
              invalidated={!!attempt?.invalidated}
              adjustment={
                score.adjusted_at
                  ? {
                      adjustedAt: score.adjusted_at,
                      originalTotal: score.original_total_score ?? null,
                      reason: score.adjustment_reason ?? null,
                    }
                  : null
              }
              total={score.total_score}
              parts={heroParts}
              ctaLabel={ctaLabel}
              onCta={goToReview}
              onPrint={() => window.print()}
            >
              <ResultMetricStrip
                data={{
                  fullCount,
                  questionCount: review.length,
                  pointsLost: Math.max(0, examMax - score.total_score),
                  wrongCount,
                  blankCount,
                  durationSeconds,
                  durationLimitMinutes: attempt?.exam.duration_minutes ?? null,
                  labeling: analysis
                    ? {
                        verified: analysis.autopsy.highConfidenceCount,
                        wrong: analysis.autopsy.wrongQuestions.length,
                      }
                    : null,
                  labelingUnavailable: analysisStatus === "error",
                }}
              />
            </ResultHero>
          </ResultSection>

          {/* ------------------------------------------------------------ 02 */}
          <ResultSection meta={sec02}>
            <PointLossMap
              status={analysisStatus}
              autopsy={analysis?.autopsy ?? null}
              facts={analysis?.attemptFacts ?? []}
              questionNumbers={questionNumbers}
              customScoring={customScoring}
            />
          </ResultSection>

          {/* ------------------------------------------------------------ 03 */}
          <ResultSection meta={sec03}>
            <ErrorDnaPanel
              status={analysisStatus}
              autopsy={analysis?.autopsy ?? null}
              recurring={analysis?.recurring ?? []}
              questionNumbers={questionNumbers}
              onQuestionSelect={focusQuestion}
            />
          </ResultSection>

          {/* ------------------------------------------------------------ 04 */}
          <ResultSection meta={sec04}>
            <ThinkingProfile
              bloom={analysis?.bloom ?? null}
              byDifficulty={diagnostics?.byDifficulty ?? null}
              narrative={analysis?.narrative ?? null}
              narrativeStatus={analysisStatus}
            />
          </ResultSection>

          {/* ------------------------------------------------------------ 05 */}
          <ResultSection meta={sec05}>
            <PatternInsights
              patternStatus={analysisStatus}
              recurring={analysis?.recurring ?? []}
              wrongQuestions={analysis?.autopsy.wrongQuestions ?? []}
              perQuestion={diagnostics?.perQuestion ?? []}
              blankSummary={diagnostics?.blankQuestions ?? null}
              onQuestionSelect={focusQuestion}
            />
          </ResultSection>

          {/* ------------------------------------------------------------ 06 */}
          <ResultSection meta={sec06}>
            <RootCauseInsight
              status={graphStatus}
              tableMissing={graphState.status === "ready" && graphState.data.tableMissing}
              targets={rootCauseTargets}
              edges={graphState.status === "ready" ? graphState.data.edges : []}
              lessonNames={graphState.status === "ready" ? graphState.data.lessonNames : EMPTY_NAMES}
              lessonGrades={graphState.status === "ready" ? graphState.data.lessonGrades : EMPTY_GRADES}
              evidence={analysis?.evidence ?? EMPTY_EVIDENCE}
            />
          </ResultSection>

          {/* ------------------------------------------------------------ 07 */}
          <ResultSection meta={sec07}>
            <NextStepPanel
              data={nextStep}
              onReviewWrong={() => reviewWith("wrong")}
              onReviewBlank={() => reviewWith("blank")}
              onReviewAll={() => reviewWith("all")}
            />
          </ResultSection>

          {/* ------------------------------------------------------------ 08 */}
          <ResultSection
            meta={sec08}
            lede={
              review.length > 0
                ? `${review.length} câu · ${fullCount} trọn điểm · ${wrongCount} chưa đúng · ${blankCount} bỏ trống. Bấm vào từng câu để xem đề và lời giải.`
                : undefined
            }
          >
            <QuestionReviewSection
              items={review}
              questionNumbers={questionNumbers}
              errorByQuestion={analysis?.errorByQuestion ?? EMPTY_ERRORS}
              command={reviewCommand}
            />

            <div className="student-intelligence-hero-actions">
              <Link className="student-intelligence-button" to="/hoc-sinh">
                Về trang chủ
              </Link>
            </div>
          </ResultSection>
        </article>
      </div>

      <MobileActionBar scoreText={scoreText} ctaLabel={ctaLabel} onCta={goToReview} />

      {/* Bản in riêng — ẩn khỏi màn hình bình thường, chỉ hiện khi in/lưu PDF
          (xem @media print trong styles.css và ghi chú ở đầu ResultSlip.tsx). */}
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
