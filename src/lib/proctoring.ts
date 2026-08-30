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

/** Quá 3 lần (tức là vi phạm lần thứ 4) thì huỷ bài. */
export const AUTO_CANCEL_THRESHOLD = 3;

/**
 * Rời trang dưới ngưỡng này (mili-giây) thì KHÔNG tính là vi phạm — vẫn ghi
 * lại sự kiện thô vào proctoring_events như bình thường (để giáo viên xem
 * nếu cần), chỉ là không cộng vào bộ đếm để huỷ bài. Lý do: đôi khi máy học
 * sinh phát sinh lỗi/giật lag/thông báo hệ thống bật lên rồi tắt ngay, chưa
 * chắc là học sinh cố tình rời trang — cho 1 khoảng đệm ngắn để công bằng.
 */
export const VIOLATION_GRACE_PERIOD_MS = 3000;

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
 * Mức độ nghiêm trọng của lần cảnh báo — dùng để đổi màu sắc hiển thị (nhẹ ->
 * nặng dần theo từng lần), KHÔNG dùng để gây hoảng loạn, chỉ để học sinh thấy
 * rõ mức độ đang ở đâu. null nếu vượt ngưỡng (lúc này bài đã bị huỷ, không
 * còn "cảnh báo" nữa).
 */
export type ViolationSeverity = 1 | 2 | 3;

export function violationSeverity(violationCount: number): ViolationSeverity | null {
  if (violationCount <= 0 || violationCount > AUTO_CANCEL_THRESHOLD) return null;
  return Math.min(violationCount, 3) as ViolationSeverity;
}

/** Tiêu đề ngắn hiện giữa màn hình — vd "Cảnh báo 2/3". */
export function violationModalTitle(violationCount: number): string {
  return `Cảnh báo ${violationCount}/${AUTO_CANCEL_THRESHOLD}`;
}

/** Nội dung đầy đủ hiện giữa màn hình khi phát hiện 1 lần rời trang (đã qua
 * khoảng đệm VIOLATION_GRACE_PERIOD_MS) — nêu sự thật rõ ràng, không giật
 * gân, để học sinh biết chính xác mình đang ở mức nào. */
export function violationModalMessage(violationCount: number): string {
  const graceSeconds = VIOLATION_GRACE_PERIOD_MS / 1000;
  const base = `Hệ thống ghi nhận bạn vừa rời trang làm bài quá ${graceSeconds} giây.`;
  const remaining = AUTO_CANCEL_THRESHOLD - violationCount;
  if (remaining <= 0) {
    return `${base} Đây là cảnh báo cuối cùng — vi phạm thêm 1 lần nữa, bài làm sẽ tự động bị huỷ.`;
  }
  return `${base} Còn ${remaining} lần cảnh báo nữa trước khi bài làm bị huỷ.`;
}
