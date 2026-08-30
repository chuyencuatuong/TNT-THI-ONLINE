/**
 * Logic thuần (không phụ thuộc DB/mạng) cho "nhật ký câu sai + ôn tập kiểu
 * Leitner" — đã chốt ở mục 19.3 tài liệu đề xuất: câu chỉ rút khỏi nhật ký
 * khi làm đúng ĐỦ 3 buổi ôn tập RIÊNG BIỆT liên tiếp (không phải 3 lần trong
 * cùng 1 buổi — hành vi học sinh thực tế không siêng đến mức tự làm lại 3 lần
 * liên tiếp trong 1 lần mở màn hình).
 *
 * "Buổi" ở đây = 1 review_sessions.id (mỗi lần học sinh mở màn hình ôn tập là
 * 1 buổi mới) — KHÔNG phải 1 ngày lịch, vì học sinh có thể mở lại nhiều lần
 * trong cùng 1 ngày và mỗi lần đó vẫn tính là 1 buổi riêng biệt hợp lệ.
 *
 * MỞ RỘNG SAU NÀY (đã bàn với người dùng, chưa làm ở lần này): thay vì chỉ
 * "trả lời lại y hệt câu gốc", có thể thêm chế độ "sắp xếp lại các bước làm"
 * (kéo thả), tự tách từ solution_latex. Vì vậy các hàm ở đây chỉ quan tâm tới
 * kết quả cuối (đúng/sai của 1 lượt ôn), không gắn cứng với cách học sinh trả
 * lời — xem thêm `ReviewMode` ở dưới, hiện chỉ có "answer" (trả lời lại).
 */

/** Số buổi làm đúng liên tiếp cần để rút câu khỏi nhật ký. */
export const LEITNER_STREAK_TO_RETIRE = 3;

/** Các chế độ ôn tập 1 câu trong nhật ký. Hiện chỉ có "answer" (trả lời lại
 * y hệt lúc làm đề gốc). Chỗ này cố tình tách thành union type để sau này
 * thêm "steps" (sắp xếp lại các bước lời giải) chỉ cần thêm 1 nhánh, không
 * phải sửa lại chữ ký các hàm chấm/đếm streak bên dưới. */
export type ReviewMode = "answer";

export interface JournalStreakState {
  correctStreak: number;
  lastReviewedSessionId: string | null;
  retiredAt: string | null;
}

/**
 * Trạng thái cần ghi khi 1 câu bị làm sai (hoặc chưa trọn điểm) trong 1 LƯỢT
 * LÀM ĐỀ THẬT (không phải buổi ôn tập) — luôn đưa câu về lại nhật ký với
 * streak = 0, kể cả khi trước đó đã từng được rút ra (retiredAt khác null):
 * làm sai lại nghĩa là chưa thật sự nắm chắc, cần ôn lại từ đầu.
 */
export function markWrongFromExam(nowIso: string): JournalStreakState {
  return { correctStreak: 0, lastReviewedSessionId: null, retiredAt: null };
}

/**
 * Cập nhật trạng thái streak sau 1 lượt trả lời trong 1 buổi ôn tập.
 *
 * - Nếu buổi này (`sessionId`) đã được tính vào streak trước đó rồi (học sinh
 *   trả lời lại câu này nhiều lần trong CÙNG 1 buổi) -> giữ nguyên, không
 *   đếm dồn thêm lần nữa.
 * - Làm sai -> streak về 0 (dù trước đó đang là bao nhiêu).
 * - Làm đúng ở 1 buổi MỚI (khác buổi lần trước) -> streak + 1; đạt đủ
 *   `LEITNER_STREAK_TO_RETIRE` thì rút khỏi nhật ký (retiredAt = nowIso).
 */
export function applyReviewResult(
  entry: JournalStreakState,
  sessionId: string,
  isCorrect: boolean,
  nowIso: string,
): JournalStreakState {
  if (entry.lastReviewedSessionId === sessionId) {
    return entry;
  }
  if (!isCorrect) {
    return { correctStreak: 0, lastReviewedSessionId: sessionId, retiredAt: null };
  }
  const correctStreak = entry.correctStreak + 1;
  const retiredAt = correctStreak >= LEITNER_STREAK_TO_RETIRE ? nowIso : null;
  return { correctStreak, lastReviewedSessionId: sessionId, retiredAt };
}

/** Câu còn "đang cần ôn" (chưa rút khỏi nhật ký) — dùng để lọc danh sách lấy
 * ngẫu nhiên cho 1 buổi ôn tập mới. */
export function isActiveJournalEntry<T extends { retired_at: string | null }>(
  entry: T,
): boolean {
  return entry.retired_at === null;
}

/** Chọn ngẫu nhiên tối đa `count` câu từ danh sách câu đang cần ôn (Fisher–
 * Yates rút gọn, không đột biến mảng gốc). `randomFn` cho phép truyền vào 1
 * hàm giả lập trong unit test để kết quả có thể đoán trước được. */
export function pickRandomForSession<T>(
  items: T[],
  count: number,
  randomFn: () => number = Math.random,
): T[] {
  const pool = items.slice();
  const result: T[] = [];
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const idx = Math.floor(randomFn() * pool.length);
    result.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return result;
}
