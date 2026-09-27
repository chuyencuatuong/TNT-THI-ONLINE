/**
 * Module 2 — Student Learning State 2.0: Hồ sơ năng lực GIẢI TRÌNH ĐƯỢC
 * (củng cố 27/09/2026). Hàm thuần, không gọi AI, không phụ thuộc DB — cùng
 * triết lý diagnosis.ts/errorIntelligence.ts.
 *
 * Trung tâm là HỒ SƠ (mỗi Chương/Bài: độ chính xác theo 4 mức Bloom, loại lỗi,
 * mẫu lỗi lặp lại, nhận định tự động có căn cứ, câu chuyện tiến bộ) — CỐ Ý
 * không có "điểm sức khoẻ học tập" dạng 78/100: 1 con số tổng hợp không giải
 * trình được vì sao, trái nguyên tắc Explainable đã chốt.
 *
 * Mọi câu nhận định sinh theo quy tắc cố định, có ngưỡng dữ liệu tối thiểu;
 * không khớp quy tắc nào thì trả null (UI ẩn dòng đó) — KHÔNG bịa câu chung
 * chung cho có.
 */

import {
  DIFFICULTY_ORDER,
  diagnoseTopic,
  summarizeMasteryTrend,
  type MasteryHistoryPoint,
  type MasteryLabel,
  type MasteryTrendSummary,
  type TopicDiagnosis,
} from "./diagnosis";
import {
  factToOutcome,
  summarizeErrorDna,
  summarizePatternRecurrence,
  toPatternOccurrences,
  type ErrorDnaCluster,
  type ErrorInstance,
  type RecurringPatternResult,
  type StudentResponseFact,
} from "./errorIntelligence";
import type { Difficulty, ErrorInstanceType } from "./types";

export type ProfileAudience = "student" | "teacher";

/** Chủ ngữ của câu nhận định: học sinh tự xem thì "Em", giáo viên xem thì "Học sinh". */
export function subjectOf(audience: ProfileAudience): string {
  return audience === "student" ? "Em" : "Học sinh";
}

// -----------------------------------------------------------------------------
// Độ chính xác theo 4 mức Bloom (Nhận biết/Thông hiểu/Vận dụng/Vận dụng cao)
// -----------------------------------------------------------------------------

export interface BloomCell {
  difficulty: Difficulty;
  sampleCount: number;
  /** 0..1, null nếu chưa có câu nào ở mức này. */
  accuracy: number | null;
  label: MasteryLabel;
}

export function buildBloomBreakdown(facts: StudentResponseFact[]): BloomCell[] {
  return DIFFICULTY_ORDER.map((difficulty) => {
    const group = facts.filter((f) => f.difficulty === difficulty);
    const d = diagnoseTopic(group.map(factToOutcome));
    return {
      difficulty,
      sampleCount: group.length,
      accuracy: group.length > 0 ? d.avgScoreRatio : null,
      label: d.label,
    };
  });
}

/** Độ chính xác gộp (có trọng số theo số câu) của 1 nhóm mức Bloom — null nếu
 * tổng số câu < minSample (không đủ căn cứ để nói gì). */
export function combinedAccuracy(
  cells: BloomCell[],
  levels: Difficulty[],
  minSample = 2,
): number | null {
  const picked = cells.filter((c) => levels.includes(c.difficulty) && c.sampleCount > 0);
  const n = picked.reduce((s, c) => s + c.sampleCount, 0);
  if (n < minSample) return null;
  return picked.reduce((s, c) => s + (c.accuracy ?? 0) * c.sampleCount, 0) / n;
}

// -----------------------------------------------------------------------------
// Nhận định tự động (deterministic)
// -----------------------------------------------------------------------------

export interface InsightInput {
  bloom: BloomCell[];
  errorDna: ErrorDnaCluster[];
  mastery: TopicDiagnosis;
}

/** Tối thiểu bao nhiêu câu sai ĐÃ PHÂN LOẠI ĐƯỢC thì mới dám nói "phần lớn lỗi là...". */
const MIN_CLASSIFIED_ERRORS = 3;
const DOMINANT_SHARE = 0.5;
/** Số câu phân loại được phải chiếm ≥ 50% TỔNG số câu sai — nếu phần lớn lỗi
 * còn "chưa xác định" thì không được kết luận "phần lớn lỗi là X". */
const MIN_CLASSIFIED_COVERAGE = 0.5;
/** Số câu tối thiểu mỗi nhóm (cơ bản / vận dụng) để so sánh 2 nhóm. */
const MIN_BLOOM_GROUP_SAMPLE = 3;

const DOMINANT_ERROR_NARRATIVE: Record<Exclude<ErrorInstanceType, "unclassified">, string> = {
  careless:
    "Phần lớn điểm mất là do bất cẩn (làm nhanh, chọn nhầm) chứ không phải chưa hiểu bài — nên làm chậm lại và kiểm tra đáp án trước khi nộp.",
  conceptual:
    "Phần lớn lỗi đến từ việc nhầm bản chất/điều kiện áp dụng, không phải do tính toán — nên ôn lại lý thuyết trước khi luyện thêm bài tập.",
  calculation:
    "Hướng làm thường đúng nhưng hay sai ở bước tính toán/biến đổi — nên luyện kỹ năng tính và soát lại từng bước.",
  procedural:
    "Thường thiếu bước hoặc làm sai thứ tự các bước — nên luyện theo quy trình giải mẫu từng bước.",
};

export function dominantClassifiedError(
  errorDna: ErrorDnaCluster[],
): { errorType: Exclude<ErrorInstanceType, "unclassified">; count: number; share: number; classifiedTotal: number } | null {
  const classified = errorDna.filter((c) => c.errorType !== "unclassified");
  const classifiedTotal = classified.reduce((s, c) => s + c.count, 0);
  const allTotal = errorDna.reduce((s, c) => s + c.count, 0);
  if (classifiedTotal < MIN_CLASSIFIED_ERRORS) return null;
  if (classifiedTotal < allTotal * MIN_CLASSIFIED_COVERAGE) return null;
  const top = classified[0];
  const share = top.count / classifiedTotal;
  if (share < DOMINANT_SHARE) return null;
  return {
    errorType: top.errorType as Exclude<ErrorInstanceType, "unclassified">,
    count: top.count,
    share,
    classifiedTotal,
  };
}

/**
 * Thứ tự ưu tiên cố định — quy tắc đầu tiên khớp sẽ được dùng:
 *  1. Cơ bản (NB+TH) ≥ 75% nhưng vận dụng (VD+VDC) ≤ 40% → vướng ở bài nhiều bước.
 *  2. Có 1 loại lỗi chiếm ≥ 50% số câu sai đã phân loại (tối thiểu 3 câu, và
 *     số câu phân loại được ≥ 50% tổng số câu sai).
 *  3. Cơ bản < 50% → hổng kiến thức nền.
 *  4. Đúng nhiều nhưng chậm/đổi đáp án nhiều (mức "chưa chắc chắn").
 *  5. Vững cả cơ bản lẫn vận dụng.
 */
export function generateInsightNarrative(input: InsightInput, audience: ProfileAudience): string | null {
  const S = subjectOf(audience);
  const basic = combinedAccuracy(input.bloom, ["nhan_biet", "thong_hieu"], MIN_BLOOM_GROUP_SAMPLE);
  const advanced = combinedAccuracy(input.bloom, ["van_dung", "van_dung_cao"], MIN_BLOOM_GROUP_SAMPLE);

  if (basic !== null && advanced !== null && basic >= 0.75 && advanced <= 0.4) {
    return `${S} nắm vững công thức cơ bản nhưng gặp trở ngại khi bài toán cần kết hợp nhiều bước.`;
  }
  const dominant = dominantClassifiedError(input.errorDna);
  if (dominant) return DOMINANT_ERROR_NARRATIVE[dominant.errorType];
  if (basic !== null && basic < 0.5) {
    return "Phần nhận biết/thông hiểu cơ bản còn yếu — nên củng cố kiến thức nền trước khi luyện câu khó.";
  }
  if (input.mastery.label === "chua_chac_chan") {
    return `${S} làm đúng phần lớn nhưng còn chậm hoặc đổi đáp án nhiều — cần luyện thêm để phản xạ nhanh và chắc hơn.`;
  }
  if (input.mastery.label === "vung" && advanced !== null && advanced >= 0.75) {
    return `${S} đang làm tốt cả câu cơ bản lẫn câu vận dụng ở phần này.`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Progress Story — định lượng tiến bộ bằng SỐ LẦN mắc 1 lỗi cụ thể
// -----------------------------------------------------------------------------

export interface ProgressStoryItem {
  patternLabel: string;
  kind: "giam" | "tang";
  priorCount: number;
  recentCount: number;
  /** Số câu ĐÃ LÀM có thể làm lộ lỗi này (câu Phần 1 có phương án mang nhãn đó) trong từng cửa sổ. */
  priorExposure: number;
  recentExposure: number;
  narrative: string;
}

const DAY_MS = 86_400_000;
const PROGRESS_MIN_PRIOR_COUNT = 2;
const PROGRESS_MIN_RECENT_EXPOSURE = 2;
/** Tỉ lệ mắc lỗi phải chênh ít nhất 15 điểm % mới coi là thay đổi thật. */
const PROGRESS_RATE_MARGIN = 0.15;

/**
 * So 2 cửa sổ thời gian liền nhau (mặc định 21 ngày gần nhất vs 21 ngày trước
 * đó) theo TỈ LỆ mắc lỗi trên số câu "có thể làm lộ" lỗi đó — tức các câu
 * Phần 1 có ít nhất 1 phương án mang đúng nhãn này (patternQuestions). So tỉ
 * lệ chứ không so số lần thô: làm ít đề hơn thì đương nhiên ít lỗi hơn, không
 * phải tiến bộ. Không có câu cùng dạng ở cửa sổ gần đây -> không kết luận gì.
 */
export function computeProgressStory(
  instances: ErrorInstance[],
  facts: StudentResponseFact[],
  options: {
    now: Date;
    windowDays?: number;
    audience: ProfileAudience;
    patternQuestions?: Map<string, Set<string>>;
  },
): ProgressStoryItem[] {
  const windowDays = options.windowDays ?? 21;
  const nowMs = options.now.getTime();
  const recentStart = nowMs - windowDays * DAY_MS;
  const priorStart = recentStart - windowDays * DAY_MS;
  const weeks = Math.max(1, Math.round(windowDays / 7));
  const S = subjectOf(options.audience);
  const inRecent = (iso: string) => {
    const t = Date.parse(iso);
    return t >= recentStart && t <= nowMs;
  };
  const inPrior = (iso: string) => {
    const t = Date.parse(iso);
    return t >= priorStart && t < recentStart;
  };

  const byLabel = new Map<string, ErrorInstance[]>();
  for (const i of instances) {
    if (!i.patternLabel) continue;
    const list = byLabel.get(i.patternLabel) ?? [];
    list.push(i);
    byLabel.set(i.patternLabel, list);
  }

  const items: ProgressStoryItem[] = [];
  for (const [patternLabel, list] of byLabel) {
    const carriers = options.patternQuestions?.get(patternLabel) ?? new Set(list.map((i) => i.questionId));
    const related = facts.filter((f) => f.answered && f.part === 1 && carriers.has(f.questionId));
    const priorCount = list.filter((i) => inPrior(i.occurredAt)).length;
    const recentCount = list.filter((i) => inRecent(i.occurredAt)).length;
    const priorExposure = related.filter((f) => inPrior(f.startedAt)).length;
    const recentExposure = related.filter((f) => inRecent(f.startedAt)).length;
    const priorRate = priorExposure > 0 ? priorCount / priorExposure : null;
    const recentRate = recentExposure > 0 ? recentCount / recentExposure : null;
    const base = { patternLabel, priorCount, recentCount, priorExposure, recentExposure };

    if (
      priorCount >= PROGRESS_MIN_PRIOR_COUNT &&
      recentExposure >= PROGRESS_MIN_RECENT_EXPOSURE &&
      recentCount < priorCount &&
      priorRate !== null &&
      recentRate !== null &&
      recentRate <= priorRate - PROGRESS_RATE_MARGIN
    ) {
      items.push({
        ...base,
        kind: "giam",
        narrative:
          recentCount === 0
            ? `${S} không còn mắc lỗi "${patternLabel}" trong ${weeks} tuần qua (0/${recentExposure} câu cùng dạng; ${weeks} tuần trước đó ${priorCount}/${priorExposure} câu).`
            : `${S} đã giảm lỗi "${patternLabel}" từ ${priorCount} lần xuống còn ${recentCount} lần trong ${weeks} tuần qua (trên ${priorExposure} và ${recentExposure} câu cùng dạng).`,
      });
    } else if (
      recentCount >= 2 &&
      recentRate !== null &&
      (priorRate === null ? recentRate >= 0.5 : recentRate >= priorRate + PROGRESS_RATE_MARGIN)
    ) {
      items.push({
        ...base,
        kind: "tang",
        narrative:
          `Lỗi "${patternLabel}" xuất hiện ${recentCount}/${recentExposure} câu cùng dạng trong ${weeks} tuần qua` +
          (priorExposure > 0 ? ` (${weeks} tuần trước đó: ${priorCount}/${priorExposure})` : "") +
          " — cần chú ý.",
      });
    }
  }
  return items.sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === "giam" ? -1 : 1) ||
      Math.abs(b.priorCount - b.recentCount) - Math.abs(a.priorCount - a.recentCount) ||
      a.patternLabel.localeCompare(b.patternLabel),
  );
}

// -----------------------------------------------------------------------------
// Dòng thời gian tiến bộ — Mastery Delta theo tuần/tháng
// -----------------------------------------------------------------------------

export type TimelineGranularity = "week" | "month";

export interface TimelineBucket {
  key: string;
  label: string;
  startMs: number;
  sampleCount: number;
  /** 0..1 — trung bình tỉ lệ điểm từng câu (câu bỏ trống tính 0). */
  accuracy: number;
}

/** Giờ Việt Nam (UTC+7) cố định — để tuần/tháng tính giống nhau trên mọi máy. */
const VN_OFFSET_MS = 7 * 3_600_000;

export function bucketOf(iso: string, granularity: TimelineGranularity): { key: string; label: string; startMs: number } {
  const local = new Date(Date.parse(iso) + VN_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (granularity === "month") {
    return { key: `${y}-${pad(m + 1)}`, label: `Th${pad(m + 1)}/${y}`, startMs: Date.UTC(y, m, 1) - VN_OFFSET_MS };
  }
  const dow = (local.getUTCDay() + 6) % 7; // 0 = thứ Hai
  const start = Date.UTC(y, m, local.getUTCDate() - dow);
  const s = new Date(start);
  return {
    key: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    label: `Tuần ${pad(s.getUTCDate())}/${pad(s.getUTCMonth() + 1)}`,
    startMs: start - VN_OFFSET_MS,
  };
}

export function buildMasteryTimeline(
  facts: StudentResponseFact[],
  granularity: TimelineGranularity,
): TimelineBucket[] {
  const map = new Map<string, { label: string; startMs: number; sum: number; n: number }>();
  for (const f of facts) {
    const b = bucketOf(f.startedAt, granularity);
    const e = map.get(b.key) ?? { label: b.label, startMs: b.startMs, sum: 0, n: 0 };
    e.sum += factToOutcome(f).scoreRatio;
    e.n += 1;
    map.set(b.key, e);
  }
  return Array.from(map.entries())
    .map(([key, e]) => ({ key, label: e.label, startMs: e.startMs, sampleCount: e.n, accuracy: e.sum / e.n }))
    .sort((a, b) => a.startMs - b.startMs);
}

export interface MasteryDelta {
  latest: TimelineBucket;
  previous: TimelineBucket;
  /** Chênh lệch điểm phần trăm (vd +12 nghĩa là tăng 12 điểm %). */
  deltaPoints: number;
}

/** So 2 kỳ gần nhất CÓ ĐỦ dữ liệu (≥ minSample câu) — null nếu chưa đủ 2 kỳ. */
export function computeMasteryDelta(buckets: TimelineBucket[], minSample = 2): MasteryDelta | null {
  const valid = buckets.filter((b) => b.sampleCount >= minSample);
  if (valid.length < 2) return null;
  const latest = valid[valid.length - 1];
  const previous = valid[valid.length - 2];
  return { latest, previous, deltaPoints: Math.round((latest.accuracy - previous.accuracy) * 100) };
}

// -----------------------------------------------------------------------------
// Hồ sơ năng lực theo Chương -> Bài
// -----------------------------------------------------------------------------

export interface ProfileNode {
  id: string;
  name: string;
  order: number | null;
  kind: "topic" | "lesson";
  topicId: string | null;
  sampleCount: number;
  mastery: TopicDiagnosis;
  history: MasteryHistoryPoint[];
  trend: MasteryTrendSummary;
  bloom: BloomCell[];
  errorDna: ErrorDnaCluster[];
  recurring: RecurringPatternResult[];
  progress: ProgressStoryItem[];
  insight: string | null;
  /** Chỉ node Chương mới có danh sách Bài con. */
  lessons: ProfileNode[];
}

export interface LearningProfile {
  topics: ProfileNode[];
  totalQuestions: number;
  totalAttempts: number;
  errorDna: ErrorDnaCluster[];
  recurring: RecurringPatternResult[];
  progress: ProgressStoryItem[];
  weekly: TimelineBucket[];
  monthly: TimelineBucket[];
}

export interface ProfileOptions {
  now: Date;
  audience: ProfileAudience;
  windowDays?: number;
  /** Xem computeProgressStory — nên truyền từ getStudentLearningBundle. */
  patternQuestions?: Map<string, Set<string>>;
}

function buildHistory(facts: StudentResponseFact[]): MasteryHistoryPoint[] {
  const byAttempt = new Map<string, StudentResponseFact[]>();
  for (const f of facts) {
    const list = byAttempt.get(f.attemptId) ?? [];
    list.push(f);
    byAttempt.set(f.attemptId, list);
  }
  return Array.from(byAttempt.entries())
    .map(([attemptId, list]) => ({
      attempt_id: attemptId,
      started_at: list[0].startedAt,
      exam_title: list[0].examTitle,
      diagnosis: diagnoseTopic(list.map(factToOutcome)),
    }))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
}

function buildNode(
  base: { id: string; name: string; order: number | null; kind: "topic" | "lesson"; topicId: string | null },
  facts: StudentResponseFact[],
  instances: ErrorInstance[],
  options: ProfileOptions,
  lessons: ProfileNode[] = [],
): ProfileNode {
  const history = buildHistory(facts);
  const mastery = diagnoseTopic(facts.map(factToOutcome));
  const bloom = buildBloomBreakdown(facts);
  const errorDna = summarizeErrorDna(instances);
  return {
    ...base,
    sampleCount: facts.length,
    mastery,
    history,
    trend: summarizeMasteryTrend(history),
    bloom,
    errorDna,
    recurring: summarizePatternRecurrence(toPatternOccurrences(instances)),
    progress: computeProgressStory(instances, facts, options),
    insight: generateInsightNarrative({ bloom, errorDna, mastery }, options.audience),
    lessons,
  };
}

const byOrderThenName = (a: ProfileNode, b: ProfileNode) =>
  (a.order ?? 9999) - (b.order ?? 9999) || a.name.localeCompare(b.name);

/** Câu chưa gán Chương bị bỏ qua (giống getStudentChapterStats) — chỉ giáo viên
 * gán Chương/Bài thì dữ liệu mới có ý nghĩa sư phạm. */
export function buildLearningProfile(
  facts: StudentResponseFact[],
  instances: ErrorInstance[],
  options: ProfileOptions,
): LearningProfile {
  const topicMap = new Map<string, { name: string; order: number | null; facts: StudentResponseFact[] }>();
  for (const f of facts) {
    if (!f.topicId) continue;
    const e = topicMap.get(f.topicId) ?? { name: f.topicName ?? "(không tên)", order: f.topicOrder, facts: [] };
    e.facts.push(f);
    topicMap.set(f.topicId, e);
  }

  const topics = Array.from(topicMap.entries()).map(([topicId, t]) => {
    const lessonMap = new Map<string, { name: string; order: number | null; facts: StudentResponseFact[] }>();
    for (const f of t.facts) {
      if (!f.lessonId) continue;
      const e = lessonMap.get(f.lessonId) ?? { name: f.lessonName ?? "(không tên)", order: f.lessonOrder, facts: [] };
      e.facts.push(f);
      lessonMap.set(f.lessonId, e);
    }
    const lessons = Array.from(lessonMap.entries())
      .map(([lessonId, l]) =>
        buildNode(
          { id: lessonId, name: l.name, order: l.order, kind: "lesson", topicId },
          l.facts,
          instances.filter((i) => i.lessonId === lessonId && i.topicId === topicId),
          options,
        ),
      )
      .sort(byOrderThenName);
    return buildNode(
      { id: topicId, name: t.name, order: t.order, kind: "topic", topicId },
      t.facts,
      instances.filter((i) => i.topicId === topicId),
      options,
      lessons,
    );
  });

  return {
    topics: topics.sort(byOrderThenName),
    totalQuestions: facts.length,
    totalAttempts: new Set(facts.map((f) => f.attemptId)).size,
    errorDna: summarizeErrorDna(instances),
    recurring: summarizePatternRecurrence(toPatternOccurrences(instances)),
    progress: computeProgressStory(instances, facts, options),
    weekly: buildMasteryTimeline(facts, "week"),
    monthly: buildMasteryTimeline(facts, "month"),
  };
}
