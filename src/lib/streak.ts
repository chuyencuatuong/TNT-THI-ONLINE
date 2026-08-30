/**
 * Tính "chuỗi ôn tập" (số ngày liên tiếp có hoạt động học) cho thẻ chia sẻ
 * (đợt bổ sung 25/08/2026). Hàm thuần, nhận sẵn danh sách mốc thời gian hoạt
 * động (ISO string) + thời điểm "bây giờ" để dễ unit test, không tự gọi
 * `new Date()` bên trong.
 *
 * "1 ngày ôn tập" = có ít nhất 1 hoạt động (lượt làm bài HOẶC 1 buổi ôn tập
 * câu sai) bắt đầu trong ngày đó, tính theo giờ máy của học sinh (không quy
 * đổi múi giờ — chấp nhận vì HS dùng chung 1 múi giờ VN).
 */

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Đếm số ngày liên tiếp tính lùi từ "now". Nếu HÔM NAY chưa có hoạt động thì
 * vẫn thử neo vào HÔM QUA (để chuỗi không "biến mất" ngay khi HS chỉ đơn
 * giản là chưa mở máy trong ngày hôm đó) — nhưng nếu ngày gần nhất có hoạt
 * động cách "now" từ 2 ngày trở lên thì coi như chuỗi đã đứt, trả về 0.
 */
export function computeStudyStreak(activityTimestamps: string[], now: Date): number {
  if (activityTimestamps.length === 0) return 0;
  const activeDays = new Set(activityTimestamps.map((iso) => dateKey(new Date(iso))));

  let cursor = startOfDay(now);
  if (!activeDays.has(dateKey(cursor))) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    if (!activeDays.has(dateKey(cursor))) return 0;
  }

  let streak = 0;
  while (activeDays.has(dateKey(cursor))) {
    streak += 1;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

/** Nhãn "cấp độ" hiển thị trên thẻ chia sẻ chuỗi ôn tập — thuần tính chất
 * động viên, KHÔNG so sánh với học sinh khác (đúng nguyên tắc chung của
 * toàn bộ tính năng gamification trong app này). */
export function levelLabelForStreak(days: number): string {
  if (days >= 30) return "Bậc thầy ôn tập";
  if (days >= 14) return "Kiên trì";
  if (days >= 7) return "Bền bỉ";
  return "Người chăm chỉ";
}
