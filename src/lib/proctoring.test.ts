import { describe, expect, it } from "vitest";
import {
  countAutoCancelViolations,
  isAutoCancelEvent,
  shouldAutoCancel,
  violationToastMessage,
} from "./proctoring";

describe("isAutoCancelEvent", () => {
  it("nhận tab_hidden và fullscreen_exit", () => {
    expect(isAutoCancelEvent("tab_hidden")).toBe(true);
    expect(isAutoCancelEvent("fullscreen_exit")).toBe(true);
  });

  it("không tính window_blur/copy/paste", () => {
    expect(isAutoCancelEvent("window_blur")).toBe(false);
    expect(isAutoCancelEvent("window_focus")).toBe(false);
    expect(isAutoCancelEvent("copy_attempt")).toBe(false);
    expect(isAutoCancelEvent("paste_attempt")).toBe(false);
    expect(isAutoCancelEvent("tab_visible")).toBe(false);
  });
});

describe("countAutoCancelViolations", () => {
  it("chỉ đếm 2 loại sự kiện đáng tính, bỏ qua loại khác", () => {
    const events = [
      { event_type: "tab_hidden" },
      { event_type: "window_blur" },
      { event_type: "copy_attempt" },
      { event_type: "fullscreen_exit" },
      { event_type: "tab_visible" },
    ];
    expect(countAutoCancelViolations(events)).toBe(2);
  });

  it("trả về 0 khi danh sách rỗng", () => {
    expect(countAutoCancelViolations([])).toBe(0);
  });
});

describe("shouldAutoCancel", () => {
  it("chưa huỷ ở lần 1 và lần 2", () => {
    expect(shouldAutoCancel(0)).toBe(false);
    expect(shouldAutoCancel(1)).toBe(false);
    expect(shouldAutoCancel(2)).toBe(false);
  });

  it("huỷ từ lần thứ 3 trở đi", () => {
    expect(shouldAutoCancel(3)).toBe(true);
    expect(shouldAutoCancel(4)).toBe(true);
  });
});

describe("violationToastMessage", () => {
  it("cảnh báo 1/2 ở lần đầu", () => {
    expect(violationToastMessage(1)).toBe("Đã ghi nhận rời trang — cảnh báo 1/2.");
  });

  it("cảnh báo 2/2 kèm câu báo trước sẽ huỷ", () => {
    expect(violationToastMessage(2)).toBe(
      "Đã ghi nhận rời trang — cảnh báo 2/2. Lần sau bài sẽ bị huỷ.",
    );
  });

  it("thông báo đã huỷ khi vượt ngưỡng", () => {
    expect(violationToastMessage(3)).toBe("Bài làm đã bị huỷ do rời trang quá số lần cho phép.");
  });
});
