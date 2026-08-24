/**
 * Đếm số lần "rời trang thật sự" trong lúc làm bài (chuyển tab/ứng dụng khác,
 * thoát toàn màn hình) để quyết định khi nào tự động huỷ bài ở đề chế độ
 * "nghiêm túc" — xem exam_attempts.invalidated (migration_010).
 *
 * CỐ TÌNH chỉ tính 2 loại sự kiện này, KHÔNG tính window_blur (quá nhạy — bấm
 * vào thanh địa chỉ trình duyệt trên CÙNG máy cũng tính là blur, dễ oan) và
 * KHÔNG tính copy_attempt/paste_attempt (những hành vi này đã bị chặn ngay
 * lúc xảy ra — preventDefault — nên không phải "rời trang", tính vào đây sẽ
 * làm học sinh bị huỷ bài oan chỉ vì lỡ tay bấm Ctrl+C).
 */
export type AutoCancelEventType = "tab_hidden" | "fullscreen_exit";

export const AUTO_CANCEL_EVENT_TYPES: readonly AutoCancelEventType[] = [
  "tab_hidden",
  "fullscreen_exit",
];

/** Quá 2 lần (tức là vi phạm lần thứ 3) thì huỷ bài — đúng như đã thống nhất. */
export const AUTO_CANCEL_THRESHOLD = 2;

export function isAutoCancelEvent(eventType: string): eventType is AutoCancelEventType {
  return (AUTO_CANCEL_EVENT_TYPES as readonly string[]).includes(eventType);
}

/** Đếm số lần vi phạm "đáng tính" trong danh sách sự kiện của 1 lượt làm bài. */
export function countAutoCancelViolations(events: { event_type: string }[]): number {
  return events.filter((e) => isAutoCancelEvent(e.event_type)).length;
}

/** true khi đã vượt quá ngưỡng cho phép — lúc này bài phải bị tự động huỷ. */
export function shouldAutoCancel(violationCount: number): boolean {
  return violationCount > AUTO_CANCEL_THRESHOLD;
}

export const INVALIDATED_REASON_TOO_MANY_EXITS = "roi_trang_qua_so_lan_cho_phep";

/**
 * Dựng nội dung thông báo hiện NGAY khi học sinh vừa rời trang (minh bạch:
 * biết chắc mình đang bị theo dõi, biết chắc còn bao nhiêu lần) — không dùng
 * hiệu ứng giật gân, chỉ nêu sự thật rõ ràng.
 */
export function violationToastMessage(violationCount: number): string {
  if (violationCount > AUTO_CANCEL_THRESHOLD) {
    return "Bài làm đã bị huỷ do rời trang quá số lần cho phép.";
  }
  const isLastWarning = violationCount === AUTO_CANCEL_THRESHOLD;
  const base = `Đã ghi nhận rời trang — cảnh báo ${violationCount}/${AUTO_CANCEL_THRESHOLD}.`;
  return isLastWarning ? `${base} Lần sau bài sẽ bị huỷ.` : base;
}
