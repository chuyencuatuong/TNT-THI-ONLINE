/**
 * Báo cáo năng lực sau khi nộp bài (trang kết quả 4 chương, 01/10/2026).
 *
 * Hàm THUẦN — không gọi DB/AI. Nhận số liệu đã có (perQuestion, nhãn lỗi của
 * lượt làm, lý do bỏ trống, Bloom, phân bố điểm ẩn danh) và trả về những gì
 * trang cần nói: nhóm nguyên nhân của từng điểm rơi, câu nhận định, vị trí,
 * kế hoạch 3 việc. Mọi câu chữ sinh theo quy tắc cố định, luôn chỉ ngược về
 * được một con số.
 *
 * 3 nhóm nguyên nhân hiển thị cho học sinh (đã chốt 01/10/2026):
 *   Kiến thức  = lỗi khái niệm (conceptual)
 *   Thực thi   = lỗi quy trình + tính toán (procedural, calculation)
 *   Nhịp độ    = lỗi bất cẩn (careless) + câu chưa xác định loại lỗi nhưng làm
 *                >= 2 lần định mức + câu bỏ trống vì chưa kịp mở
 *   Chưa định vị = phần còn lại (không đủ căn cứ) — không bao giờ bị "đoán" vào nhóm khác.
 * Điểm rơi tính theo ĐIỂM của đề (maxScore - score từng câu), không theo số câu.
 */

import { DEFAULT_EXPECTED_TIME_SECONDS, type BlankReason } from "./diagnosis";
import { combinedAccuracy, type BloomCell } from "./learningState";
import type { Difficulty, ErrorInstanceType } from "./types";

export type CauseGroup = "speed" | "exec" | "know" | "unloc";
export const CAUSE_ORDER: CauseGroup[] = ["speed", "exec", "know", "unloc"];
export const CAUSE_LABELS: Record<CauseGroup, string> = {
  speed: "Nhịp độ",
  exec: "Thực thi",
  know: "Kiến thức",
  unloc: "Chưa định vị",
};

const EPS = 0.005;
/** Câu chưa xác định loại lỗi nhưng làm >= 2 lần định mức thời gian -> Nhịp độ. */
export const BOTTLENECK_RATIO = 2;
/** Ngưỡng tối thiểu số lượt làm lần đầu để hiện vị trí (khớp migration_021). */
export const MIN_DISTRIBUTION = 20;

const round2 = (n: number) => Math.round(n * 100) / 100;
const PART_ROMAN: Record<1 | 2 | 3, string> = { 1: "I", 2: "II", 3: "III" };

export function formatClockVi(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} phút` : `${m} phút ${r} giây`;
}

const ratioText = (r: number) => r.toFixed(1).replace(".", ",");

// -----------------------------------------------------------------------------
// Phân loại từng điểm rơi
// -----------------------------------------------------------------------------

export interface QuestionOutcomeInput {
  questionId: string;
  /** Số câu theo thứ tự toàn đề. */
  number: number;
  part: 1 | 2 | 3;
  score: number;
  maxScore: number;
  answered: boolean;
  /** 0 = không có dữ liệu thời gian. */
  timeSpentSeconds: number;
  lessonId: string | null;
  lessonName: string | null;
  /** Loại lỗi tra từ nhãn (null = chưa tra được / dữ liệu phân tích chưa tải). */
  errorType: ErrorInstanceType | null;
  patternLabel: string | null;
  blankReason: BlankReason | null;
}

export interface QuestionLoss extends QuestionOutcomeInput {
  lost: number;
  cause: CauseGroup;
  /** Câu căn cứ ngắn, hiển thị cạnh số câu. */
  note: string;
}

export function classifyLoss(
  q: QuestionOutcomeInput,
  expected: Record<1 | 2 | 3, number> = DEFAULT_EXPECTED_TIME_SECONDS,
): QuestionLoss | null {
  const lost = round2(Math.max(0, q.maxScore - q.score));
  if (lost < EPS) return null;
  const ratio = q.timeSpentSeconds > 0 ? q.timeSpentSeconds / expected[q.part] : null;
  const make = (cause: CauseGroup, note: string): QuestionLoss => ({ ...q, lost, cause, note });

  if (!q.answered) {
    if (q.blankReason === "chua_kip_doc") return make("speed", "Chưa kịp mở trước khi hết giờ");
    if (q.blankReason === "doc_roi_bo_qua") return make("unloc", "Đã mở nhưng bỏ qua, chưa đủ căn cứ phân loại");
    return make("unloc", "Bỏ trống");
  }
  switch (q.errorType) {
    case "conceptual":
      return make("know", q.patternLabel ?? "Nhầm bản chất hoặc điều kiện áp dụng");
    case "procedural":
      return make("exec", q.patternLabel ? `Quy trình · ${q.patternLabel}` : "Thiếu bước hoặc sai thứ tự các bước");
    case "calculation":
      return make("exec", q.patternLabel ? `Tính toán · ${q.patternLabel}` : "Sai ở bước tính hoặc biến đổi");
    case "careless":
      return make(
        "speed",
        ratio !== null
          ? `Làm trong ${formatClockVi(q.timeSpentSeconds)}, bằng ${Math.round(ratio * 100)}% định mức`
          : "Làm vội ở phần đã nắm",
      );
    default:
      break;
  }
  if (ratio !== null && ratio >= BOTTLENECK_RATIO) {
    return make("speed", `${formatClockVi(q.timeSpentSeconds)}, gấp ${ratioText(ratio)} lần định mức`);
  }
  return make("unloc", q.part === 1 ? "Phương án đã chọn chưa có nhãn đối soát" : `Phần ${PART_ROMAN[q.part]} chưa có nhãn đối soát`);
}

export function classifyLosses(qs: QuestionOutcomeInput[], expected?: Record<1 | 2 | 3, number>): QuestionLoss[] {
  return qs
    .map((q) => classifyLoss(q, expected))
    .filter((x): x is QuestionLoss => x !== null)
    .sort((a, b) => a.number - b.number);
}

export interface CauseSummary {
  cause: CauseGroup;
  points: number;
  questions: QuestionLoss[];
}

/** Luôn đủ 4 nhóm theo CAUSE_ORDER; câu trong nhóm xếp mất nhiều điểm trước. */
export function summarizeCauses(losses: QuestionLoss[]): CauseSummary[] {
  return CAUSE_ORDER.map((cause) => {
    const questions = losses
      .filter((l) => l.cause === cause)
      .sort((a, b) => b.lost - a.lost || a.number - b.number);
    return { cause, points: round2(questions.reduce((s, q) => s + q.lost, 0)), questions };
  });
}

/** Nhóm nguyên nhân trội theo điểm (ưu tiên 3 nhóm đã định vị; chỉ trả "unloc" khi không còn nhóm nào khác). */
export function dominantCause(summary: CauseSummary[]): CauseGroup | null {
  const located = summary.filter((s) => s.cause !== "unloc" && s.points > EPS);
  if (located.length > 0) {
    return located.reduce((best, s) => (s.points > best.points + EPS ? s : best)).cause;
  }
  return summary.some((s) => s.cause === "unloc" && s.points > EPS) ? "unloc" : null;
}

// -----------------------------------------------------------------------------
// Ô điểm rơi (hình biến hình ở chương Chẩn đoán)
// -----------------------------------------------------------------------------

export interface LossBlock {
  questionNumber: number;
  cause: CauseGroup;
  lessonKey: string;
}

/** Mỗi ô = `unit` điểm (0.25, hoặc 0.5 nếu điểm rơi lớn để không quá 40 ô).
 * Mỗi câu mất điểm có ít nhất 1 ô; số ô làm tròn nên chỉ là minh hoạ — con số
 * chính xác luôn hiện kèm bằng chữ. */
export function lossBlocks(losses: QuestionLoss[]): { unit: number; blocks: LossBlock[] } {
  const total = losses.reduce((s, l) => s + l.lost, 0);
  const unit = total / 0.25 > 40 ? 0.5 : 0.25;
  const blocks: LossBlock[] = [];
  const ordered = [...losses].sort(
    (a, b) => CAUSE_ORDER.indexOf(a.cause) - CAUSE_ORDER.indexOf(b.cause) || a.number - b.number,
  );
  for (const l of ordered) {
    const n = Math.max(1, Math.round(l.lost / unit));
    for (let i = 0; i < n; i++) blocks.push({ questionNumber: l.number, cause: l.cause, lessonKey: l.lessonId ?? "none" });
  }
  return { unit, blocks };
}

export interface LessonLossRow {
  key: string;
  name: string;
  lost: number;
  questions: number[];
}

export function lessonLossRows(losses: QuestionLoss[]): LessonLossRow[] {
  const map = new Map<string, LessonLossRow>();
  for (const l of losses) {
    const key = l.lessonId ?? "none";
    const row = map.get(key) ?? { key, name: l.lessonName ?? "Câu chưa gán Bài", lost: 0, questions: [] };
    row.lost = round2(row.lost + l.lost);
    row.questions.push(l.number);
    map.set(key, row);
  }
  return Array.from(map.values()).sort((a, b) => b.lost - a.lost || a.name.localeCompare(b.name));
}

// -----------------------------------------------------------------------------
// Vị trí: phân vị (đủ dữ liệu) hoặc nhóm năng lực theo thang cố định
// -----------------------------------------------------------------------------

export interface ScoreBand {
  key: string;
  name: string;
  from: number;
  to: number;
}

export const SCORE_BANDS: ScoreBand[] = [
  { key: "nen", name: "Củng cố nền", from: 0, to: 5 },
  { key: "tang-toc", name: "Tăng tốc", from: 5, to: 7 },
  { key: "vung", name: "Vững", from: 7, to: 8.5 },
  { key: "but-pha", name: "Bứt phá", from: 8.5, to: 10 },
];

export function scoreBand(total: number): ScoreBand {
  return SCORE_BANDS.find((b) => total >= b.from - EPS && total < b.to - EPS) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
}

export interface Percentile {
  /** Số lượt có điểm thấp hơn em. */
  below: number;
  n: number;
  pct: number;
}

export function percentileOf(scores: number[] | null | undefined, me: number): Percentile | null {
  if (!scores || scores.length < MIN_DISTRIBUTION) return null;
  const below = scores.filter((s) => s < me - EPS).length;
  return { below, n: scores.length, pct: Math.round((below / scores.length) * 100) };
}

// -----------------------------------------------------------------------------
// Tầng tư duy
// -----------------------------------------------------------------------------

export interface TierSummary {
  /** Tầng cao nhất (tính liên tiếp từ Nhận biết) đạt >= 80%. */
  solidUpTo: Difficulty | null;
  /** Tầng đầu tiên dưới 80% (có dữ liệu). */
  firstGap: Difficulty | null;
  /** Nhận biết + Thông hiểu (>= 3 câu), null nếu thiếu dữ liệu. */
  basic: number | null;
  /** Vận dụng + Vận dụng cao (>= 3 câu). */
  advanced: number | null;
}

const LEVELS: Difficulty[] = ["nhan_biet", "thong_hieu", "van_dung", "van_dung_cao"];

export function tierSummary(cells: BloomCell[]): TierSummary {
  const by = new Map(cells.map((c) => [c.difficulty, c]));
  let solidUpTo: Difficulty | null = null;
  let firstGap: Difficulty | null = null;
  for (const lv of LEVELS) {
    const c = by.get(lv);
    if (!c || c.sampleCount === 0 || c.accuracy === null) continue;
    if (c.accuracy >= 0.8 && firstGap === null) solidUpTo = lv;
    else if (c.accuracy < 0.8 && firstGap === null) firstGap = lv;
  }
  return {
    solidUpTo,
    firstGap,
    basic: combinedAccuracy(cells, ["nhan_biet", "thong_hieu"], 3),
    advanced: combinedAccuracy(cells, ["van_dung", "van_dung_cao"], 3),
  };
}

// -----------------------------------------------------------------------------
// Câu nhận định đầu trang
// -----------------------------------------------------------------------------

const CAUSE_SENTENCE: Record<CauseGroup, string> = {
  speed: "Điểm rơi dồn vào nhịp độ làm bài.",
  exec: "Điểm rơi tập trung ở bước biến đổi và tính toán.",
  know: "Điểm rơi đến từ một vài khái niệm chưa chắc.",
  unloc: "Phần lớn điểm rơi chưa đủ căn cứ để phân loại.",
};

export function buildHeadline(input: { totalLost: number; dominant: CauseGroup | null; basic: number | null }): string {
  if (input.totalLost < EPS || input.dominant === null) return "Giữ trọn điểm toàn bài.";
  const base =
    input.basic === null
      ? ""
      : input.basic >= 0.75
        ? "Kiến thức nền vững. "
        : input.basic >= 0.5
          ? "Nền tảng ở mức khá. "
          : "Phần nền còn khoảng trống cần bù đắp. ";
  return base + CAUSE_SENTENCE[input.dominant];
}

// -----------------------------------------------------------------------------
// Kế hoạch 3 việc
// -----------------------------------------------------------------------------

export interface ReportAction {
  key: string;
  title: string;
  body: string;
  /** Thời lượng ước tính (phút) — số quy ước, không phải số đo. */
  minutes: number;
  minutesNote?: string;
  /** Điểm có thể gỡ lại (tổng điểm rơi của các câu liên quan), nếu xác định được. */
  gain: number | null;
  kind: "questions" | "link";
  questionIds?: string[];
  to?: string;
  ctaLabel: string;
}

const listNumbers = (qs: QuestionLoss[]) => `Câu ${qs.map((q) => q.number).join(", ")}`;
const estMinutes = (n: number) => Math.min(40, Math.max(10, Math.round((n * 7) / 5) * 5));
const fmt2 = (n: number) => n.toFixed(2);

function causeAction(s: CauseSummary, key: string): ReportAction {
  const qs = s.questions.slice(0, 3);
  const gain = round2(qs.reduce((t, q) => t + q.lost, 0));
  const base = { key, minutes: estMinutes(qs.length), gain, kind: "questions" as const, questionIds: qs.map((q) => q.questionId) };
  const cta = `Mở ${qs.length} câu`;
  switch (s.cause) {
    case "speed":
      return {
        ...base,
        title: `Làm lại ${listNumbers(qs)} không bấm giờ`,
        body: `${qs.length > 1 ? `${qs.length} câu này` : "Câu này"} chiếm ${fmt2(gain)} điểm rơi. Nếu làm đúng khi không bị áp lực thời gian, việc cần sửa là cách phân bổ thời gian, chưa phải học lại kiến thức.`,
        ctaLabel: cta,
      };
    case "exec":
      return {
        ...base,
        title: `Soát lại ${listNumbers(qs)}: tìm đúng bước bị lệch`,
        body: `Hướng làm đã đúng. Trước khi đọc lời giải, tự chỉ ra dòng biến đổi bị sai — ${fmt2(gain)} điểm nằm ở đây.`,
        ctaLabel: cta,
      };
    case "know": {
      const lesson = qs.find((q) => q.lessonName)?.lessonName;
      return {
        ...base,
        title: `Đọc lại lý thuyết rồi làm lại ${listNumbers(qs)}`,
        body: `Nhầm ở khái niệm${lesson ? ` thuộc «${lesson}»` : ""}. Tự phát biểu lại điều kiện áp dụng trước khi xem lời giải.`,
        ctaLabel: cta,
      };
    }
    default:
      return {
        ...base,
        title: `Xem lại ${listNumbers(qs)} cùng lời giải`,
        body: "Các câu này chưa đủ căn cứ để phân loại nguyên nhân. Đối chiếu từng bước với lời giải để tự tìm chỗ lệch.",
        ctaLabel: cta,
      };
  }
}

export interface RootCauseHint {
  foundationName: string;
  foundationGrade: number | null;
  targetName: string;
}

export function buildActions(input: {
  summary: CauseSummary[];
  lessons: LessonLossRow[];
  rootCause: RootCauseHint | null;
  recurringLabel: string | null;
  allQuestionIds: string[];
}): ReportAction[] {
  const actions: ReportAction[] = [];
  const dom = dominantCause(input.summary);
  if (dom === null) {
    return [
      {
        key: "review-all",
        title: "Đọc lại lời giải các câu vận dụng",
        body: "Em giữ trọn điểm. So cách làm của mình với lời giải để tìm lối giải ngắn hơn cho các câu nhiều bước.",
        minutes: 15,
        gain: null,
        kind: "questions",
        questionIds: input.allQuestionIds,
        ctaLabel: "Xem bài làm",
      },
    ];
  }
  actions.push(causeAction(input.summary.find((s) => s.cause === dom)!, "first"));

  if (input.rootCause) {
    const rc = input.rootCause;
    actions.push({
      key: "root",
      title: `Ôn lại ${rc.foundationName}${rc.foundationGrade ? ` (Lớp ${rc.foundationGrade})` : ""}`,
      body: `Bài nền tảng này có thể liên quan tới điểm rơi ở «${rc.targetName}» — xem căn cứ ở chương Chẩn đoán.`,
      minutes: 25,
      gain: null,
      kind: "link",
      to: "/hoc-sinh/ho-so-nang-luc",
      ctaLabel: "Xem hồ sơ năng lực",
    });
  } else {
    const second = input.summary
      .filter((s) => s.cause !== dom && s.cause !== "unloc" && s.points > EPS)
      .sort((a, b) => b.points - a.points)[0];
    if (second) actions.push(causeAction(second, "second"));
    else if (input.lessons[0] && input.lessons[0].key !== "none") {
      actions.push({
        key: "lesson",
        title: `Củng cố «${input.lessons[0].name}»`,
        body: "Đây là bài rơi nhiều điểm nhất ở đề này. Xem lại lý thuyết trọng tâm rồi làm thêm bài cùng dạng.",
        minutes: 25,
        gain: null,
        kind: "link",
        to: "/hoc-sinh/ho-so-nang-luc",
        ctaLabel: "Xem hồ sơ năng lực",
      });
    }
  }

  actions.push({
    key: "journal",
    title: "Luyện lại trong Ôn tập câu sai",
    body:
      "Các câu chưa đúng đã vào nhật ký Ôn tập câu sai — mỗi câu cần làm đúng ở 3 buổi ôn riêng biệt liên tiếp mới được rút khỏi danh sách." +
      (input.recurringLabel ? ` Chú ý mẫu lỗi «${input.recurringLabel}», đã lặp lại qua nhiều đề.` : ""),
    minutes: 15,
    minutesNote: "mỗi buổi",
    gain: null,
    kind: "link",
    to: "/hoc-sinh/on-tap-cau-sai",
    ctaLabel: "Mở Ôn tập câu sai",
  });
  return actions.slice(0, 3);
}
