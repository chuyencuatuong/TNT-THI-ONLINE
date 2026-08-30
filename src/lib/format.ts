/**
 * Các hàm định dạng dùng chung cho dashboard học sinh & trang chi tiết học sinh
 * (giáo viên): thời gian làm bài, chênh lệch điểm số/thời gian giữa các lần
 * làm bài. Toàn bộ là hàm thuần (pure function) để dễ unit test.
 */

/** Định dạng số phút thành chuỗi dễ đọc, ví dụ "1 giờ 5 phút" hoặc "12 phút". */
export function formatMinutes(totalMinutesRaw: number): string {
  const totalMinutes = Math.max(0, Math.round(totalMinutesRaw));
  if (totalMinutes < 1) return "dưới 1 phút";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

/** Tính số phút hoàn thành 1 lượt làm bài — null nếu chưa nộp bài. */
export function completionMinutes(attempt: {
  started_at: string;
  submitted_at: string | null;
}): number | null {
  if (!attempt.submitted_at) return null;
  const ms =
    new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime();
  return Math.max(0, ms / 60000);
}

export interface DeltaDisplay {
  text: string;
  className: "delta-up" | "delta-down" | "delta-neutral";
}

/**
 * So sánh 2 giá trị điểm số, trả về chuỗi có dấu +/- và class màu (điểm tăng =
 * xanh, điểm giảm = đỏ, hoà = trung tính). Làm tròn 2 chữ số thập phân để
 * tránh lệch do cộng dồn số thực (giống combineScores trong scoring.ts).
 */
export function formatScoreDelta(delta: number): DeltaDisplay {
  const rounded = Math.round(delta * 100) / 100;
  if (Math.abs(rounded) < 0.005) return { text: "0", className: "delta-neutral" };
  return {
    text: `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}`,
    className: rounded > 0 ? "delta-up" : "delta-down",
  };
}

/**
 * So sánh thời gian hoàn thành (phút) giữa 2 lần làm bài. KHÔNG gán màu
 * tốt/xấu vì làm nhanh hơn chưa chắc là điều tích cực (có thể là làm ẩu) —
 * chỉ hiển thị trung lập để giáo viên tự đánh giá.
 */
export function formatTimeDelta(deltaMinutes: number): string {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return "bằng lần đó";
  return `${rounded > 0 ? "+" : ""}${rounded} phút`;
}
