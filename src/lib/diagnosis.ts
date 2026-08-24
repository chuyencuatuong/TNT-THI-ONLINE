/**
 * Chẩn đoán mức độ nắm vững kiến thức theo từng dạng bài, dựa trên:
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

export interface TopicOutcomeGroup {
  question_type_id: string;
  type_name: string;
  outcomes: QuestionOutcome[];
}

/** Chạy diagnoseTopic cho nhiều dạng bài cùng lúc. */
export function diagnoseAllTopics(
  groups: TopicOutcomeGroup[],
  expectedTime: Record<1 | 2 | 3, number> = DEFAULT_EXPECTED_TIME_SECONDS,
): (TopicDiagnosis & { question_type_id: string; type_name: string })[] {
  return groups.map((g) => ({
    question_type_id: g.question_type_id,
    type_name: g.type_name,
    ...diagnoseTopic(g.outcomes, expectedTime),
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
