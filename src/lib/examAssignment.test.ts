import { describe, expect, it } from "vitest";
import { formatCountdownLabel, getAssignmentStatus, pickFeaturedAssignedExam } from "./examAssignment";

const NOW = new Date("2026-08-24T10:00:00Z").getTime();

describe("getAssignmentStatus", () => {
  it("not_assigned khi không có cả 2 mốc giờ", () => {
    expect(
      getAssignmentStatus({ assigned_unlock_at: null, assigned_lock_at: null }, NOW),
    ).toBe("not_assigned");
  });

  it("before_unlock khi chưa tới giờ mở", () => {
    expect(
      getAssignmentStatus(
        { assigned_unlock_at: "2026-08-24T11:00:00Z", assigned_lock_at: null },
        NOW,
      ),
    ).toBe("before_unlock");
  });

  it("open khi đã qua giờ mở và chưa có giờ khoá", () => {
    expect(
      getAssignmentStatus(
        { assigned_unlock_at: "2026-08-24T09:00:00Z", assigned_lock_at: null },
        NOW,
      ),
    ).toBe("open");
  });

  it("open khi đang trong khoảng mở-khoá", () => {
    expect(
      getAssignmentStatus(
        { assigned_unlock_at: "2026-08-24T09:00:00Z", assigned_lock_at: "2026-08-24T12:00:00Z" },
        NOW,
      ),
    ).toBe("open");
  });

  it("after_lock khi đã quá giờ khoá", () => {
    expect(
      getAssignmentStatus(
        { assigned_unlock_at: "2026-08-24T08:00:00Z", assigned_lock_at: "2026-08-24T09:00:00Z" },
        NOW,
      ),
    ).toBe("after_lock");
  });
});

describe("pickFeaturedAssignedExam", () => {
  it("trả về null khi không có đề nào được giao", () => {
    expect(
      pickFeaturedAssignedExam([{ assigned_unlock_at: null, assigned_lock_at: null }], NOW),
    ).toBeNull();
  });

  it("ưu tiên đề đang mở, sắp khoá sớm nhất", () => {
    const examSoon = {
      id: "soon",
      assigned_unlock_at: "2026-08-24T09:00:00Z",
      assigned_lock_at: "2026-08-24T11:00:00Z",
    };
    const examLater = {
      id: "later",
      assigned_unlock_at: "2026-08-24T09:00:00Z",
      assigned_lock_at: "2026-08-24T15:00:00Z",
    };
    expect(pickFeaturedAssignedExam([examLater, examSoon], NOW)?.id).toBe("soon");
  });

  it("không có đề nào đang mở thì chọn đề sắp mở gần nhất", () => {
    const examFar = {
      id: "far",
      assigned_unlock_at: "2026-08-25T09:00:00Z",
      assigned_lock_at: null,
    };
    const examNear = {
      id: "near",
      assigned_unlock_at: "2026-08-24T11:00:00Z",
      assigned_lock_at: null,
    };
    expect(pickFeaturedAssignedExam([examFar, examNear], NOW)?.id).toBe("near");
  });

  it("trả về null nếu mọi đề được giao đều đã khoá", () => {
    const examPast = {
      id: "past",
      assigned_unlock_at: "2026-08-23T09:00:00Z",
      assigned_lock_at: "2026-08-23T11:00:00Z",
    };
    expect(pickFeaturedAssignedExam([examPast], NOW)).toBeNull();
  });
});

describe("formatCountdownLabel", () => {
  it("chỉ còn vài phút", () => {
    expect(formatCountdownLabel(5 * 60_000)).toBe("5 phút nữa");
  });

  it("còn vài giờ, không tròn giờ", () => {
    expect(formatCountdownLabel(2 * 3600_000 + 15 * 60_000)).toBe("2 giờ 15 phút nữa");
  });

  it("còn đúng tròn giờ", () => {
    expect(formatCountdownLabel(3 * 3600_000)).toBe("3 giờ nữa");
  });

  it("còn hơn 1 ngày thì chỉ hiện số ngày", () => {
    expect(formatCountdownLabel(2 * 24 * 3600_000 + 5 * 3600_000)).toBe("2 ngày nữa");
  });

  it("đã quá giờ (âm) thì làm tròn về 0 phút", () => {
    expect(formatCountdownLabel(-1000)).toBe("0 phút nữa");
  });
});
