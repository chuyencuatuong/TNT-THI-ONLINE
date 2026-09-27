/** Định dạng số liệu dùng chung cho các phân mục của trang kết quả. */

export function formatPoints(n: number): string {
  return n.toFixed(2);
}

/** 0..1 -> "78%". */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Số giây -> "45 giây" / "12 phút" / "1 giờ 08 phút". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} giây`;
  const minutes = Math.round(s / 60);
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} giờ` : `${h} giờ ${String(m).padStart(2, "0")} phút`;
}

/** Số giây trung bình / câu -> "1.8 phút / câu" hoặc "40 giây / câu". */
export function formatPace(secondsPerQuestion: number): string {
  if (secondsPerQuestion < 60) return `${Math.round(secondsPerQuestion)} giây / câu`;
  return `${(secondsPerQuestion / 60).toFixed(1)} phút / câu`;
}

/** Ngưỡng khớp diagnosis.ts: >= 80% là "vững", < 40% là "hổng". */
const MIX_GAP_RATIO = 0.4;
const MIX_SOLID_RATIO = 0.8;

/**
 * Màu pha liên tục giữa 2 gam dữ liệu. Chỉ pha trong dải 40%..80% (đúng dải
 * "chưa vững" của diagnosis.ts): >= 80% là xanh thông thuần, <= 40% là đất nung
 * thuần — tránh để phần lớn các mức rơi vào vùng màu trung gian đục.
 */
export function masteryMix(accuracy: number): string {
  const t = (accuracy - MIX_GAP_RATIO) / (MIX_SOLID_RATIO - MIX_GAP_RATIO);
  const p = Math.round(Math.min(1, Math.max(0, t)) * 100);
  return `color-mix(in oklab, var(--si-solid) ${p}%, var(--si-gap))`;
}

/** Số giây -> "6 phút 40 giây" / "45 giây" (dùng cho từng câu, cần chính xác tới giây). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} giây`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} phút` : `${m} phút ${r} giây`;
}

/** ISO -> "27/09/2026". */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}
