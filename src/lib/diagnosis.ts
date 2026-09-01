/**
 * Chẩn đoán mức độ nắm vững kiến thức theo từng CHƯƠNG (không phải "dạng bài"
 * — xem ghi chú tại TopicOutcomeGroup bên dưới về lý do đổi), dựa trên:
 *  - Độ chính xác (điểm đạt được / điểm tối đa của các câu thuộc dạng đó)
 *  - Thời gian làm bài so với mức "kỳ vọng" cho từng phần
 *  - Số lần đổi đáp án
 *
 * QUAN TRỌNG: đây là một QUY TẮC HEURISTIC do người xây hệ thống tự đặt ra để gợi ý
 * hướng ôn tập, KHÔNG PHẢI một mô hình chẩn đoán tâm lý/giáo dục đã được kiểm chứng
 * khoa học. Ngưỡng thời gian "kỳ vọng" (DEFAULT_EXPECTED_TIME_SECONDS) chỉ là ước
 * lượng hợp lý ban đầu — giáo viên nên đối chiếu với quan sát thực tế trên lớp và
 * có thể cần điều chỉnh lại các ngưỡng bên dưới cho phù hợp với từng đối tượng học
 * sinh, không nên coi kết quả là kết luận cuối cùng.
 *
 * Toàn bộ hàm ở đây là hàm thuần (pure function), không phụ thuộc DB/mạng.
 */

import type { Difficulty } from "./types";

export interface QuestionOutcome {
  part: 1 | 2 | 3;
  /** điểm đạt được / điểm tối đa của câu này, từ 0 đến 1 */
  scoreRatio: number;
  timeSpentSeconds: number;
  changeCount: number;
}

export type MasteryLabel =
  | "vung"
  | "chua_chac_chan"
  | "co_lo_hong"
  | "mat_goc"
  | "chua_du_du_lieu";

export const MASTERY_LABELS: Record<MasteryLabel, string> = {
  vung: "Nắm vững",
  chua_chac_chan: "Chưa thật chắc chắn",
  co_lo_hong: "Có lỗ hổng kiến thức",
  mat_goc: "Có dấu hiệu mất gốc",
  chua_du_du_lieu: "Chưa đủ dữ liệu để đánh giá",
};

/** Màu đại diện cho từng mức nắm vững — dùng chung cho MỌI nơi hiển thị chẩn
 * đoán (ResultPage.tsx phía học sinh, TeacherStudentDetail.tsx phía giáo
 * viên) để nhất quán, tách ra đây (trước đây định nghĩa riêng ở ResultPage.tsx)
 * khi thêm chẩn đoán theo mức độ tư duy cho cả 2 phía (31/08/2026). */
export const MASTERY_COLOR: Record<MasteryLabel, string> = {
  vung: "#2e7d32",
  chua_chac_chan: "#b8860b",
  co_lo_hong: "#e07b00",
  mat_goc: "#c0392b",
  chua_du_du_lieu: "#6b7280",
};

export const MASTERY_NOTE: Record<MasteryLabel, string> = {
  vung: "Làm đúng phần lớn, thời gian và số lần đổi đáp án ở mức hợp lý.",
  chua_chac_chan:
    "Kết quả đúng nhưng mất khá nhiều thời gian hoặc đổi đáp án nhiều lần — có thể chưa thật tự tin, nên luyện thêm để phản xạ nhanh và chắc hơn.",
  co_lo_hong:
    "Đúng khoảng một nửa số câu — có khả năng nắm được ý chính nhưng còn thiếu sót ở một số bước, nên xem lại lý thuyết và làm thêm bài tương tự.",
  mat_goc:
    "Sai phần lớn các câu thuộc dạng này — nên ôn lại kiến thức nền của dạng bài này trước khi luyện tiếp.",
  chua_du_du_lieu:
    "Chưa đủ câu hỏi thuộc dạng này trong lần làm bài để đưa ra nhận định đáng tin cậy.",
};

/**
 * Thời gian "kỳ vọng" cho 1 câu ở mỗi phần (đơn vị: giây) — số mặc định, có thể
 * chỉnh lại. Đây là ước lượng chủ quan (không phải số liệu đo thực nghiệm), dùng
 * làm mốc so sánh tương đối, không phải chuẩn tuyệt đối.
 */
export const DEFAULT_EXPECTED_TIME_SECONDS: Record<1 | 2 | 3, number> = {
  1: 90,
  2: 150,
  3: 120,
};

const MIN_SAMPLE_SIZE = 2;
const SOLID_SCORE_RATIO = 0.8;
const GAP_SCORE_RATIO = 0.4;
const SLOW_TIME_RATIO = 1.3;
const RUSHED_TIME_RATIO = 0.5;
const HESITANT_CHANGE_COUNT = 1.5;

export interface TopicDiagnosis {
  label: MasteryLabel;
  sampleCount: number;
  avgScoreRatio: number;
  avgTimeRatio: number;
  avgChangeCount: number;
  /** true nếu điểm thấp NHƯNG thời gian làm rất nhanh — có thể do đoán/bỏ qua chứ chưa chắc là mất gốc hoàn toàn */
  possiblyRushed: boolean;
}

/** Gộp nhiều câu hỏi (cùng 1 dạng bài) thành 1 kết luận chẩn đoán. */
export function diagnoseTopic(
  outcomes: QuestionOutcome[],
  expectedTime: Record<1 | 2 | 3, number> = DEFAULT_EXPECTED_TIME_SECONDS,
): TopicDiagnosis {
  const sampleCount = outcomes.length;

  if (sampleCount === 0) {
    return {
      label: "chua_du_du_lieu",
      sampleCount: 0,
      avgScoreRatio: 0,
      avgTimeRatio: 0,
      avgChangeCount: 0,
      possiblyRushed: false,
    };
  }

  const avgScoreRatio =
    outcomes.reduce((sum, o) => sum + o.scoreRatio, 0) / sampleCount;
  const timeRatios = outcomes.map(
    (o) => o.timeSpentSeconds / expectedTime[o.part],
  );
  const avgTimeRatio = timeRatios.reduce((a, b) => a + b, 0) / sampleCount;
  const avgChangeCount =
    outcomes.reduce((sum, o) => sum + o.changeCount, 0) / sampleCount;

  if (sampleCount < MIN_SAMPLE_SIZE) {
    return {
      label: "chua_du_du_lieu",
      sampleCount,
      avgScoreRatio,
      avgTimeRatio,
      avgChangeCount,
      possiblyRushed: false,
    };
  }

  let label: MasteryLabel;
  if (avgScoreRatio >= SOLID_SCORE_RATIO) {
    label =
      avgTimeRatio <= SLOW_TIME_RATIO && avgChangeCount <= HESITANT_CHANGE_COUNT
        ? "vung"
        : "chua_chac_chan";
  } else if (avgScoreRatio >= GAP_SCORE_RATIO) {
    label = "co_lo_hong";
  } else {
    label = "mat_goc";
  }

  return {
    label,
    sampleCount,
    avgScoreRatio,
    avgTimeRatio,
    avgChangeCount,
    possiblyRushed: avgScoreRatio < GAP_SCORE_RATIO && avgTimeRatio < RUSHED_TIME_RATIO,
  };
}

/**
 * ĐỔI 24/08/2026 (audit "check full"): field trước đây tên `question_type_id`
 * /`type_name`, nhóm theo "dạng bài" (question_type_id) — nhưng cột đó chưa
 * được giáo viên gán cho câu hỏi nào cả (nhập đề luôn để trống), nên nhóm
 * theo dạng bài khiến `byTopic` LUÔN RỖNG trong thực tế, làm cả mục "Chẩn
 * đoán theo dạng bài" trên ResultPage.tsx (giao diện học sinh xem ngay sau
 * khi nộp bài) im lặng không hiện ra — không ai để ý vì không có lỗi nào cả.
 * Đổi sang nhóm theo CHƯƠNG (topic_id) — đã có dữ liệu thật vì được gán khi
 * nhập đề — và đổi tên field cho khớp, tránh nhầm lại lần nữa.
 */
export interface TopicOutcomeGroup {
  topic_id: string;
  topic_name: string;
  outcomes: QuestionOutcome[];
}

/** Chạy diagnoseTopic cho nhiều chương cùng lúc. */
export function diagnoseAllTopics(
  groups: TopicOutcomeGroup[],
  expectedTime: Record<1 | 2 | 3, number> = DEFAULT_EXPECTED_TIME_SECONDS,
): (TopicDiagnosis & { topic_id: string; topic_name: string })[] {
  return groups.map((g) => ({
    topic_id: g.topic_id,
    topic_name: g.topic_name,
    ...diagnoseTopic(g.outcomes, expectedTime),
  }));
}

/**
 * Chẩn đoán theo MỨC ĐỘ TƯ DUY (Nhận biết/Thông hiểu/Vận dụng/Vận dụng cao —
 * questions.difficulty), thêm 31/08/2026 theo yêu cầu "phân tích năng lực
 * chuyên sâu" (Giai đoạn 1, ưu tiên 1/4 vì có sẵn dữ liệu ngay, không cần
 * thêm bảng mới). Dùng LẠI đúng động cơ chẩn đoán diagnoseTopic (điểm/thời
 * gian/số lần đổi đáp án) — chỉ khác trục nhóm (difficulty thay vì topic_id),
 * nên tách riêng interface nhóm đầu vào nhưng gọi chung 1 hàm diagnoseTopic.
 */
export interface DifficultyOutcomeGroup {
  difficulty: Difficulty;
  outcomes: QuestionOutcome[];
}

/** Thứ tự hiển thị chuẩn NB -> TH -> VD -> VDC (không phải thứ tự bảng chữ cái). */
export const DIFFICULTY_ORDER: Difficulty[] = [
  "nhan_biet",
  "thong_hieu",
  "van_dung",
  "van_dung_cao",
];

/** Chạy diagnoseTopic cho cả 4 mức độ tư duy cùng lúc, LUÔN trả đủ 4 mức theo
 * DIFFICULTY_ORDER (kể cả mức chưa có câu nào — trả "chua_du_du_lieu") để vẽ
 * biểu đồ/bảng ổn định vị trí, không nhảy cột khi thiếu dữ liệu 1 mức nào đó. */
export function diagnoseAllDifficulties(
  groups: DifficultyOutcomeGroup[],
  expectedTime: Record<1 | 2 | 3, number> = DEFAULT_EXPECTED_TIME_SECONDS,
): (TopicDiagnosis & { difficulty: Difficulty })[] {
  const byDifficulty = new Map(groups.map((g) => [g.difficulty, g.outcomes]));
  return DIFFICULTY_ORDER.map((difficulty) => ({
    difficulty,
    ...diagnoseTopic(byDifficulty.get(difficulty) ?? [], expectedTime),
  }));
}

/**
 * Tính thời gian "tập trung" thực tế vào 1 câu hỏi từ các sự kiện enter/leave,
 * cộng dồn qua nhiều lượt quay lại xem (không chỉ tính từ lần xem đầu tới lần
 * cuối, vì học sinh có thể rời đi rồi quay lại nhiều lần).
 */
export function computeActiveSeconds(
  events: { event_type: "enter" | "leave"; created_at: string }[],
): number {
  const sorted = [...events].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  let total = 0;
  let enterTime: number | null = null;
  for (const ev of sorted) {
    const t = new Date(ev.created_at).getTime();
    if (ev.event_type === "enter") {
      if (enterTime === null) enterTime = t;
    } else if (ev.event_type === "leave" && enterTime !== null) {
      total += Math.max(0, (t - enterTime) / 1000);
      enterTime = null;
    }
  }
  return Math.round(total);
}

/**
 * Với các câu bị bỏ trống (final_answer = null), phân biệt 2 nguyên nhân khác
 * nhau dựa vào việc học sinh có từng "mở" câu đó ra xem hay không
 * (question_view_events, event_type "enter"):
 *  - Không có sự kiện "enter" nào -> nhiều khả năng do hết giờ, chưa kịp đọc
 *    tới câu này (vấn đề PHÂN BỐ THỜI GIAN).
 *  - Có sự kiện "enter" nhưng vẫn bỏ trống -> đã đọc nhưng chủ động không
 *    làm, có thể do thấy khó quá hoặc chủ động bỏ qua (vấn đề KIẾN THỨC/tâm
 *    lý, không phải thời gian).
 * Hai nguyên nhân này cần 2 hướng can thiệp khác nhau nên tách riêng thay vì
 * gộp chung thành 1 số "số câu bỏ trống" như hầu hết hệ thống chấm điểm khác.
 */
export type BlankReason = "chua_kip_doc" | "doc_roi_bo_qua";

export const BLANK_REASON_LABELS: Record<BlankReason, string> = {
  chua_kip_doc: "Chưa kịp đọc (có thể do hết giờ)",
  doc_roi_bo_qua: "Đã đọc nhưng bỏ qua",
};

export interface BlankQuestionInfo {
  question_id: string;
  reason: BlankReason;
}

export interface BlankQuestionSummary {
  totalBlank: number;
  /** Số câu bỏ trống mà học sinh chưa từng mở ra xem. */
  timeoutCount: number;
  /** Số câu bỏ trống mà học sinh đã mở ra xem nhưng không làm. */
  skippedCount: number;
  items: BlankQuestionInfo[];
}

export function classifyBlankQuestions(
  blankQuestionIds: string[],
  viewedQuestionIds: Iterable<string>,
): BlankQuestionSummary {
  const viewedSet = new Set(viewedQuestionIds);
  const items: BlankQuestionInfo[] = blankQuestionIds.map((question_id) => ({
    question_id,
    reason: viewedSet.has(question_id) ? "doc_roi_bo_qua" : "chua_kip_doc",
  }));
  return {
    totalBlank: items.length,
    timeoutCount: items.filter((i) => i.reason === "chua_kip_doc").length,
    skippedCount: items.filter((i) => i.reason === "doc_roi_bo_qua").length,
    items,
  };
}

/** Gợi ý ngắn, diễn giải nguyên nhân bỏ trống chiếm đa số — trả về null nếu
 * không có câu nào bị bỏ trống. */
export function blankQuestionAdvice(summary: BlankQuestionSummary): string | null {
  if (summary.totalBlank === 0) return null;
  if (summary.skippedCount === 0) {
    return `Cả ${summary.timeoutCount} câu bỏ trống đều chưa kịp mở ra xem — nhiều khả năng do phân bổ thời gian chưa hợp lý, chưa chắc do thiếu kiến thức.`;
  }
  if (summary.timeoutCount === 0) {
    return `Cả ${summary.skippedCount} câu bỏ trống đều đã mở ra xem nhưng không làm — nên ưu tiên kiểm tra lại kiến thức ở các câu này.`;
  }
  return `${summary.timeoutCount} câu chưa kịp xem (có thể do thiếu thời gian) và ${summary.skippedCount} câu đã xem nhưng bỏ qua (có thể do chưa nắm kiến thức).`;
}

// ---------------------------------------------------------------------------
// Giai đoạn 2 gốc (31/08/2026): "dạng lỗi sai lặp lại qua nhiều đề" + "xu
// hướng tiến bộ qua thời gian" — TÁCH RIÊNG theo từng Chương/Bài, khác với 2
// thứ đã có sẵn trước đó: `getStudentChapterStats` (chỉ gộp % đúng CỘNG DỒN
// mọi đề, không tách theo thời gian/không phát hiện lặp lại) và
// `getAttemptDiagnostics`/`diagnoseTopic` ở trên (chỉ chẩn đoán ĐÚNG 1 lượt
// làm bài riêng lẻ, không so sánh qua nhiều lượt).
//
// Cách làm: chạy LẠI đúng `diagnoseTopic` ở trên cho TỪNG lượt làm bài của
// học sinh (theo thứ tự thời gian), được 1 "chuỗi" chẩn đoán theo thời gian
// cho mỗi Chương/Bài — rồi rút ra 2 kết luận:
//   - "Lặp lại": 2 lần gần nhất CÓ ĐỦ DỮ LIỆU để chẩn đoán (bỏ qua các lần
//     "chua_du_du_lieu") đều thuộc nhóm yếu (co_lo_hong/mat_goc).
//   - "Xu hướng": so sánh điểm trung bình nửa đầu và nửa sau các lần có đủ dữ
//     liệu — cần tối thiểu 3 lần mới đủ để kết luận, tránh nói "đi xuống" chỉ
//     vì 2 điểm dữ liệu dao động ngẫu nhiên.
//
// CỐ TÌNH không lưu kết quả này vào bảng riêng (kiểu "mastery_snapshots") —
// dữ liệu thô (question_responses) đã lưu đủ để tính lại bất cứ lúc nào,
// tránh rủi ro dữ liệu snapshot bị lệch với dữ liệu gốc theo thời gian, và
// giữ đúng triết lý "hàm thuần, không phụ thuộc DB" của cả file này.
// ---------------------------------------------------------------------------

/** 1 lượt làm bài đã được chẩn đoán cho 1 Chương/Bài cụ thể — 1 điểm trên
 * "chuỗi thời gian" mastery của Chương/Bài đó. */
export interface MasteryHistoryPoint {
  attempt_id: string;
  started_at: string;
  exam_title: string;
  diagnosis: TopicDiagnosis;
}

export type TrendDirection = "cai_thien" | "di_xuong" | "chua_ro";

export const TREND_DIRECTION_LABEL: Record<TrendDirection, string> = {
  cai_thien: "Đang cải thiện",
  di_xuong: "Có dấu hiệu đi xuống",
  chua_ro: "Chưa đủ dữ liệu để thấy rõ xu hướng",
};

export interface MasteryTrendSummary {
  /** true nếu 2 lần gần nhất có đủ dữ liệu để chẩn đoán đều ở mức yếu (co_lo_hong/mat_goc) — lỗi sai LẶP LẠI qua nhiều đề. */
  isRecurring: boolean;
  direction: TrendDirection;
  /** Nhãn của lần gần nhất CÓ đủ dữ liệu — null nếu chưa lần nào đủ dữ liệu. */
  latestLabel: MasteryLabel | null;
  /** Số lần làm bài có đủ dữ liệu để chẩn đoán (đã loại "chua_du_du_lieu") — dùng làm ngưỡng tin cậy khi hiển thị. */
  validPointCount: number;
}

const RECURRING_WEAK_LABELS: MasteryLabel[] = ["co_lo_hong", "mat_goc"];
const TREND_MIN_VALID_POINTS = 3;
/** Chênh lệch scoreRatio tối thiểu (0-1) giữa nửa đầu/nửa sau để coi là 1 xu hướng thật, không phải dao động ngẫu nhiên. */
const TREND_DIFF_THRESHOLD = 0.1;

/** `history` phải đã sắp theo `started_at` TĂNG DẦN (cũ -> mới). */
export function summarizeMasteryTrend(history: MasteryHistoryPoint[]): MasteryTrendSummary {
  const valid = history.filter((h) => h.diagnosis.label !== "chua_du_du_lieu");
  const latestLabel = valid.length > 0 ? valid[valid.length - 1].diagnosis.label : null;

  const lastTwo = valid.slice(-2);
  const isRecurring =
    lastTwo.length === 2 && lastTwo.every((h) => RECURRING_WEAK_LABELS.includes(h.diagnosis.label));

  let direction: TrendDirection = "chua_ro";
  if (valid.length >= TREND_MIN_VALID_POINTS) {
    const mid = Math.floor(valid.length / 2);
    const avgScoreRatio = (points: MasteryHistoryPoint[]) =>
      points.reduce((sum, h) => sum + h.diagnosis.avgScoreRatio, 0) / points.length;
    const diff = avgScoreRatio(valid.slice(mid)) - avgScoreRatio(valid.slice(0, mid));
    if (diff >= TREND_DIFF_THRESHOLD) direction = "cai_thien";
    else if (diff <= -TREND_DIFF_THRESHOLD) direction = "di_xuong";
  }

  return { isRecurring, direction, latestLabel, validPointCount: valid.length };
}

/** 1 nhóm (1 Chương hoặc 1 Bài) của 1 học sinh, đã có `trend` từ
 * `summarizeMasteryTrend` — dùng làm đầu vào chung cho
 * `summarizeClassRecurringGroups` (không phân biệt Chương/Bài ở tầng này). */
export interface RecurringGroupInput {
  id: string;
  name: string;
  trend: MasteryTrendSummary;
}

export interface RecurringGroupSummary {
  id: string;
  name: string;
  /** Số học sinh có ít nhất 1 lần chẩn đoán đủ dữ liệu cho nhóm này. */
  studentCount: number;
  /** Trong số đó, số học sinh đang bị lặp lại lỗi sai (isRecurring). */
  recurringCount: number;
  recurringPercent: number;
}

/**
 * Gộp nhiều học sinh thành thống kê "cả lớp": % học sinh đang lặp lại lỗi
 * sai ở CÙNG 1 Chương/Bài — dùng cho dashboard giáo viên quyết định nên ôn
 * tập lại phần nào cho cả lớp (mục "cả lớp" bổ sung, Giai đoạn 2 gốc).
 * CHỈ giữ lại nhóm có ít nhất 1 học sinh đang lặp lại (recurringCount > 0) —
 * tránh liệt kê dài dòng toàn số 0%. Sắp theo % lặp lại giảm dần.
 */
export function summarizeClassRecurringGroups(
  perStudent: RecurringGroupInput[][],
): RecurringGroupSummary[] {
  const map = new Map<string, { name: string; studentCount: number; recurringCount: number }>();
  for (const groups of perStudent) {
    for (const g of groups) {
      if (g.trend.validPointCount === 0) continue;
      const existing = map.get(g.id) ?? { name: g.name, studentCount: 0, recurringCount: 0 };
      existing.studentCount += 1;
      if (g.trend.isRecurring) existing.recurringCount += 1;
      map.set(g.id, existing);
    }
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({
      id,
      name: v.name,
      studentCount: v.studentCount,
      recurringCount: v.recurringCount,
      recurringPercent: v.studentCount > 0 ? Math.round((v.recurringCount / v.studentCount) * 100) : 0,
    }))
    .filter((r) => r.recurringCount > 0)
    .sort((a, b) => b.recurringPercent - a.recurringPercent || b.recurringCount - a.recurringCount);
}

