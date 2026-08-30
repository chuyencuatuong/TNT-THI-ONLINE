/**
 * Logic thuần cho "đề thi được chỉ định" (giao đề, mở khoá/khoá theo giờ) —
 * tách riêng để dễ unit test không cần render React/gọi Supabase. Việc CHẶN
 * thật sự nằm ở trigger check_exam_assignment_window (migration_010, dùng
 * đồng hồ Postgres) — các hàm ở đây chỉ quyết định HIỂN THỊ gì cho học sinh,
 * không phải lớp bảo vệ chính.
 */

export interface AssignableExam {
  assigned_unlock_at: string | null;
  assigned_lock_at: string | null;
}

export type AssignmentStatus = "not_assigned" | "before_unlock" | "open" | "after_lock";

export function getAssignmentStatus(exam: AssignableExam, nowMs: number): AssignmentStatus {
  if (!exam.assigned_unlock_at && !exam.assigned_lock_at) return "not_assigned";
  if (exam.assigned_unlock_at && nowMs < new Date(exam.assigned_unlock_at).getTime()) {
    return "before_unlock";
  }
  if (exam.assigned_lock_at && nowMs > new Date(exam.assigned_lock_at).getTime()) {
    return "after_lock";
  }
  return "open";
}

/**
 * Chọn 1 đề được chỉ định để hiện nổi bật trên trang chủ học sinh — ưu tiên
 * đề đang MỞ (nếu nhiều đề cùng mở, ưu tiên đề sắp khoá sớm nhất để nhắc kịp
 * thời), rồi mới tới đề sắp mở gần nhất. Trả về null nếu không có gì đáng nổi
 * bật (không có đề được giao, hoặc tất cả đã khoá).
 */
export function pickFeaturedAssignedExam<T extends AssignableExam>(
  exams: T[],
  nowMs: number,
): T | null {
  const assigned = exams.filter((e) => e.assigned_unlock_at || e.assigned_lock_at);

  const open = assigned.filter((e) => getAssignmentStatus(e, nowMs) === "open");
  if (open.length > 0) {
    return open.slice().sort((a, b) => {
      const aLock = a.assigned_lock_at ? new Date(a.assigned_lock_at).getTime() : Infinity;
      const bLock = b.assigned_lock_at ? new Date(b.assigned_lock_at).getTime() : Infinity;
      return aLock - bLock;
    })[0];
  }

  const upcoming = assigned.filter((e) => getAssignmentStatus(e, nowMs) === "before_unlock");
  if (upcoming.length > 0) {
    return upcoming.slice().sort(
      (a, b) => new Date(a.assigned_unlock_at!).getTime() - new Date(b.assigned_unlock_at!).getTime(),
    )[0];
  }

  return null;
}

/** "2 giờ 15 phút nữa" / "5 ngày nữa" — làm tròn xuống phút, dùng cho đếm
 * ngược mở khoá/khoá của đề được chỉ định trên trang chủ học sinh. */
export function formatCountdownLabel(remainingMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(remainingMs / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  if (days >= 1) return `${days} ngày nữa`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return minutes > 0 ? `${hours} giờ ${minutes} phút nữa` : `${hours} giờ nữa`;
  return `${minutes} phút nữa`;
}
