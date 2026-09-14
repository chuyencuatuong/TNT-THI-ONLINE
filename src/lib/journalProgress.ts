/**
 * Tổng hợp tiến độ "xử lý câu sai" của nhật ký Leitner — phần thuần (không
 * chạm DB/mạng/trình duyệt) cho tính năng "quản lý & thúc đẩy xử lý câu sai"
 * (yêu cầu 14/09/2026 của Thầy Tường).
 *
 * BỐI CẢNH: `leitner.ts` đã chốt quy tắc "câu chỉ rút khỏi nhật ký khi làm
 * đúng ĐỦ 3 buổi ôn tập RIÊNG BIỆT liên tiếp" và lưu sẵn `correct_streak`
 * trong `wrong_answer_journal`. File này KHÔNG thêm quy tắc mới, chỉ DIỄN
 * DỊCH con số streak đó thành "chặng" (lần 1 / lần 2 / lần 3) để học sinh và
 * giáo viên nhìn phát hiểu ngay còn bao nhiêu câu ở mỗi chặng:
 *
 *     correct_streak = 0  ->  Lần 1  (chưa đúng buổi nào, còn 3 buổi nữa)
 *     correct_streak = 1  ->  Lần 2  (đã đúng 1 buổi, còn 2 buổi nữa)
 *     correct_streak = 2  ->  Lần 3  (đã đúng 2 buổi, chỉ còn 1 buổi là xong)
 *
 * Vì thế KHÔNG cần cột mới/migration dữ liệu nào cho phần đếm này — mọi con
 * số ở đây suy ra được 100% từ dữ liệu đang có.
 *
 * Lưu ý về câu đã rút (retired_at khác null): các hàm ở đây LUÔN nhận vào
 * danh sách ĐÃ LỌC còn active (xem `isActiveJournalEntry` ở leitner.ts). Nếu
 * lỡ lọt 1 dòng streak >= 3 (đã đủ điều kiện rút nhưng chưa kịp ghi
 * retired_at), nó vẫn được xếp vào Lần 3 thay vì làm vỡ hàm — chọn "kẹp về
 * biên" thay vì throw, vì đây là màn hình thống kê, không phải luồng chấm.
 */

import { LEITNER_STREAK_TO_RETIRE } from "./leitner";

/** Chặng ôn của 1 câu: 1 = mới sai/vừa reset, 3 = sắp rút khỏi nhật ký. */
export type JournalStage = 1 | 2 | 3;

/** Tổng số chặng — bằng đúng số buổi đúng liên tiếp cần để rút câu ra. */
export const JOURNAL_STAGE_COUNT = LEITNER_STREAK_TO_RETIRE;

export const JOURNAL_STAGE_LABELS: Record<JournalStage, string> = {
  1: "Lần 1",
  2: "Lần 2",
  3: "Lần 3",
};

/** Mô tả dài, dùng cho tooltip/chú thích để GV-HS không phải đoán nghĩa. */
export const JOURNAL_STAGE_HINTS: Record<JournalStage, string> = {
  1: "Chưa làm đúng buổi nào — cần đúng 3 buổi ôn tập nữa",
  2: "Đã đúng 1 buổi — cần đúng 2 buổi nữa",
  3: "Đã đúng 2 buổi liên tiếp — chỉ cần đúng thêm 1 buổi là rút khỏi nhật ký",
};

/** Đổi `correct_streak` (số buổi đúng liên tiếp đã tích) thành chặng hiển
 * thị. Kẹp về biên với giá trị âm/vượt ngưỡng — xem ghi chú đầu file. */
export function stageOfStreak(correctStreak: number): JournalStage {
  if (!Number.isFinite(correctStreak) || correctStreak <= 0) return 1;
  if (correctStreak >= JOURNAL_STAGE_COUNT - 1) return JOURNAL_STAGE_COUNT as JournalStage;
  return (correctStreak + 1) as JournalStage;
}

/** Số buổi ôn tập đúng CÒN THIẾU để câu này được rút khỏi nhật ký. */
export function sessionsLeftForStage(stage: JournalStage): number {
  return JOURNAL_STAGE_COUNT - (stage - 1);
}

/** Hình dạng tối thiểu của 1 dòng nhật ký mà các hàm dưới cần — cố ý KHÔNG
 * dùng thẳng `WrongAnswerJournalRow` để test không phải dựng đủ 9 trường. */
export interface JournalProgressInput {
  correct_streak: number;
  last_wrong_at: string;
}

export interface JournalSummary {
  /** Tổng số câu đang cần ôn (đã lọc active trước khi truyền vào). */
  total: number;
  /** Số câu ở từng chặng, theo thứ tự [Lần 1, Lần 2, Lần 3]. */
  byStage: [number, number, number];
  /** Tổng số LƯỢT ôn đúng còn phải làm để dọn sạch nhật ký — dùng cho câu
   * "còn bao nhiêu việc phải làm" chứ không chỉ "còn bao nhiêu câu". */
  sessionsRemaining: number;
  /** Phần trăm tiến độ đã đi được (0-100), tính trên tổng số lượt cần làm.
   * Nhật ký rỗng = 100 (đã xử lý xong hết, không phải 0). */
  progressPercent: number;
  /** ISO của câu sai LÂU NHẤT chưa xử lý — null khi nhật ký rỗng. Dùng để
   * nhắc "có câu tồn đọng từ lâu rồi". */
  oldestWrongAt: string | null;
}

export const EMPTY_JOURNAL_SUMMARY: JournalSummary = {
  total: 0,
  byStage: [0, 0, 0],
  sessionsRemaining: 0,
  progressPercent: 100,
  oldestWrongAt: null,
};

/** Đếm số câu theo từng chặng + các con số phái sinh. */
export function summarizeJournal(entries: readonly JournalProgressInput[]): JournalSummary {
  if (entries.length === 0) return EMPTY_JOURNAL_SUMMARY;
  const byStage: [number, number, number] = [0, 0, 0];
  let sessionsRemaining = 0;
  let oldestWrongAt: string | null = null;
  let oldestMs = Number.POSITIVE_INFINITY;

  for (const entry of entries) {
    const stage = stageOfStreak(entry.correct_streak);
    byStage[stage - 1] += 1;
    sessionsRemaining += sessionsLeftForStage(stage);
    const ms = Date.parse(entry.last_wrong_at);
    if (Number.isFinite(ms) && ms < oldestMs) {
      oldestMs = ms;
      oldestWrongAt = entry.last_wrong_at;
    }
  }

  // Mỗi câu cần tối đa JOURNAL_STAGE_COUNT lượt đúng; phần đã đi được =
  // tổng cần - tổng còn lại.
  const totalWork = entries.length * JOURNAL_STAGE_COUNT;
  const done = totalWork - sessionsRemaining;
  return {
    total: entries.length,
    byStage,
    sessionsRemaining,
    progressPercent: Math.round((done / totalWork) * 100),
    oldestWrongAt,
  };
}

/** Nhóm các dòng nhật ký của NHIỀU học sinh (1 truy vấn duy nhất cho cả lớp,
 * xem api.listActiveJournalProgress) thành summary theo từng học sinh. Học
 * sinh không có dòng nào sẽ KHÔNG xuất hiện trong map — nơi gọi tự rơi về
 * EMPTY_JOURNAL_SUMMARY để phân biệt "sạch nhật ký" với "chưa tải xong". */
export function summarizeJournalByStudent<
  T extends JournalProgressInput & { student_id: string },
>(rows: readonly T[]): Map<string, JournalSummary> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const list = grouped.get(row.student_id);
    if (list) list.push(row);
    else grouped.set(row.student_id, [row]);
  }
  const result = new Map<string, JournalSummary>();
  for (const [studentId, list] of grouped) {
    result.set(studentId, summarizeJournal(list));
  }
  return result;
}

// ---------------------------------------------------------------------------
// "Thúc đẩy xử lý" — mức độ nhắc nhở
// ---------------------------------------------------------------------------

/**
 * Mức nhắc: "none" (sạch nhật ký), "ok" (còn câu nhưng vẫn đang ôn đều),
 * "nhac" (nên ôn lại), "gap" (tồn đọng lâu/nhiều, cần xử lý ngay).
 *
 * Ngưỡng dưới đây là QUY ƯỚC HIỂN THỊ, không phải quy tắc chấm điểm — đổi số
 * ở đây chỉ đổi màu/chữ nhắc nhở, không ảnh hưởng dữ liệu học tập. Chọn 3
 * ngày/7 ngày vì lịch học nhóm nhỏ của Toán TNT thường 2-3 buổi/tuần: quá 3
 * ngày không đụng tới nhật ký là đã lỡ ít nhất 1 buổi, quá 7 ngày là lỡ cả
 * tuần.
 */
export type NudgeLevel = "none" | "ok" | "nhac" | "gap";

export const NUDGE_DAYS_REMIND = 3;
export const NUDGE_DAYS_URGENT = 7;
/** Từ bao nhiêu câu tồn đọng trở lên thì coi là "nhiều", nhắc gấp dù mới ôn
 * gần đây — bằng đúng 1 đợt ôn tối đa (MAX_BATCH_SIZE = 10 ở reviewBatching). */
export const NUDGE_BACKLOG_URGENT = 10;

export interface NudgeInput {
  summary: JournalSummary;
  /** ISO buổi ôn tập gần nhất — null nghĩa là CHƯA ôn buổi nào bao giờ. */
  lastReviewAt: string | null;
  now: Date;
}

export interface NudgeState {
  level: NudgeLevel;
  /** Số ngày kể từ buổi ôn gần nhất; null khi chưa ôn buổi nào. */
  daysSinceReview: number | null;
  message: string;
}

/** Số ngày trọn vẹn giữa 2 mốc (âm -> 0). Trả về null nếu chuỗi ISO hỏng. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((now.getTime() - ms) / 86_400_000));
}

export function computeNudge({ summary, lastReviewAt, now }: NudgeInput): NudgeState {
  const daysSinceReview = daysSince(lastReviewAt, now);

  if (summary.total === 0) {
    return {
      level: "none",
      daysSinceReview,
      message: "Nhật ký đang sạch — chưa có câu nào cần ôn lại.",
    };
  }

  const stage1 = summary.byStage[0];
  const neverReviewed = daysSinceReview === null;

  if (
    neverReviewed ||
    daysSinceReview >= NUDGE_DAYS_URGENT ||
    summary.total >= NUDGE_BACKLOG_URGENT
  ) {
    return {
      level: "gap",
      daysSinceReview,
      message: neverReviewed
        ? `Còn ${summary.total} câu sai chưa ôn lần nào — làm lại ngay hôm nay nhé.`
        : `Còn ${summary.total} câu tồn đọng${
            daysSinceReview >= NUDGE_DAYS_URGENT ? ` và đã ${daysSinceReview} ngày chưa ôn` : ""
          } — ưu tiên xử lý ngay.`,
    };
  }

  if (daysSinceReview >= NUDGE_DAYS_REMIND) {
    return {
      level: "nhac",
      daysSinceReview,
      message: `Đã ${daysSinceReview} ngày chưa ôn — còn ${summary.total} câu đang chờ.`,
    };
  }

  return {
    level: "ok",
    daysSinceReview,
    message:
      stage1 > 0
        ? `Đang ôn đều — còn ${stage1} câu chưa qua được lần nào.`
        : `Đang ôn đều — còn ${summary.total} câu, tất cả đều đã qua ít nhất 1 lần.`,
  };
}

/** Thứ tự ưu tiên để sắp xếp danh sách học sinh ở giao diện GV: gấp trước,
 * sạch nhật ký xuống cuối. Số càng nhỏ càng cần chú ý. */
export const NUDGE_SORT_ORDER: Record<NudgeLevel, number> = {
  gap: 0,
  nhac: 1,
  ok: 2,
  none: 3,
};
