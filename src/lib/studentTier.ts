import type { StudentTier } from "./types";

/**
 * Phân tầng học sinh (Đợt 2, đề xuất "de-xuat-quan-ly-lop-hoc-v1", 28/08/2026)
 * — cách KẾT HỢP đã chốt: hệ thống tự tính tầng theo điểm trung bình, giáo
 * viên ghi đè tay được từng em bất cứ lúc nào (profiles.manual_tier).
 *
 * CHỈ hiển thị phía giáo viên (danh sách lớp, dashboard) — không lộ ra giao
 * diện học sinh, đúng quy tắc sẵn có "không so sánh học sinh với nhau" (xem
 * pomodoro.ts).
 */

export const TIER_LABELS: Record<StudentTier, string> = {
  gioi: "Giỏi",
  kha: "Khá",
  tb: "Trung bình",
  yeu: "Yếu",
};

/** Ngưỡng mặc định theo thang điểm 10 — giáo viên chỉnh được ở giao diện
 * (chưa lưu CSDL, xem ghi chú ở nơi gọi). */
export interface TierThresholds {
  gioiMin: number; // >= gioiMin -> Giỏi
  khaMin: number; // >= khaMin -> Khá
  tbMin: number; // >= tbMin -> Trung bình; dưới tbMin -> Yếu
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  gioiMin: 8,
  khaMin: 6.5,
  tbMin: 5,
};

/** Tính tầng TỰ ĐỘNG theo điểm trung bình — null nếu chưa có điểm nào (chưa
 * đủ dữ liệu để xếp tầng). */
export function computeAutoTier(
  averageScore: number | null,
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): StudentTier | null {
  if (averageScore === null) return null;
  if (averageScore >= thresholds.gioiMin) return "gioi";
  if (averageScore >= thresholds.khaMin) return "kha";
  if (averageScore >= thresholds.tbMin) return "tb";
  return "yeu";
}

/** Tầng CUỐI CÙNG hiển thị — ưu tiên manual_tier (GV ghi đè tay) nếu có,
 * ngược lại dùng tầng tự động tính theo điểm. */
export function resolveTier(
  manualTier: StudentTier | null,
  averageScore: number | null,
  thresholds: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): { tier: StudentTier | null; isOverride: boolean } {
  if (manualTier) return { tier: manualTier, isOverride: true };
  return { tier: computeAutoTier(averageScore, thresholds), isOverride: false };
}
