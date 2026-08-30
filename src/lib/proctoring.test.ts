import { describe, expect, it } from "vitest";
import {
  AUTO_CANCEL_THRESHOLD,
  countAutoCancelViolations,
  isAutoCancelEvent,
  shouldAutoCancel,
  violationModalMessage,
  violationModalTitle,
  violationSeverity,
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
  it("chưa huỷ ở lần 1, 2, 3", () => {
    expect(shouldAutoCancel(0)).toBe(false);
    expect(shouldAutoCancel(1)).toBe(false);
    expect(shouldAutoCancel(2)).toBe(false);
    expect(shouldAutoCancel(3)).toBe(false);
  });

  it("huỷ từ lần thứ 4 trở đi", () => {
    expect(shouldAutoCancel(4)).toBe(true);
    expect(shouldAutoCancel(5)).toBe(true);
  });

  it("ngưỡng đúng bằng 3", () => {
    expect(AUTO_CANCEL_THRESHOLD).toBe(3);
  });
});

describe("violationSeverity", () => {
  it("trả về đúng mức 1/2/3 tương ứng số lần vi phạm", () => {
    expect(violationSeverity(1)).toBe(1);
    expect(violationSeverity(2)).toBe(2);
    expect(violationSeverity(3)).toBe(3);
  });

  it("trả về null khi 0 hoặc vượt ngưỡng (đã bị huỷ)", () => {
    expect(violationSeverity(0)).toBeNull();
    expect(violationSeverity(4)).toBeNull();
  });
});

describe("violationModalTitle", () => {
  it("hiện đúng dạng x/3", () => {
    expect(violationModalTitle(1)).toBe("Cảnh báo 1/3");
    expect(violationModalTitle(2)).toBe("Cảnh báo 2/3");
    expect(violationModalTitle(3)).toBe("Cảnh báo 3/3");
  });
});

describe("violationModalMessage", () => {
  it("còn nhiều lần cảnh báo ở lần đầu", () => {
    expect(violationModalMessage(1)).toBe(
      "Hệ thống ghi nhận bạn vừa rời trang làm bài quá 3 giây. Còn 2 lần cảnh báo nữa trước khi bài làm bị huỷ.",
    );
  });

  it("cảnh báo cuối cùng ở lần thứ 3", () => {
    expect(violationModalMessage(3)).toBe(
      "Hệ thống ghi nhận bạn vừa rời trang làm bài quá 3 giây. Đây là cảnh báo cuối cùng — vi phạm thêm 1 lần nữa, bài làm sẽ tự động bị huỷ.",
    );
  });
});
