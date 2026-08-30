import { describe, expect, it } from "vitest";
import { computeStudyStreak, levelLabelForStreak } from "./streak";

describe("computeStudyStreak", () => {
  it("không có hoạt động nào -> 0", () => {
    expect(computeStudyStreak([], new Date("2026-08-25T10:00:00"))).toBe(0);
  });

  it("chỉ có hoạt động hôm nay -> 1", () => {
    const now = new Date("2026-08-25T20:00:00");
    expect(computeStudyStreak(["2026-08-25T08:00:00"], now)).toBe(1);
  });

  it("3 ngày liên tiếp tính đến hôm nay -> 3", () => {
    const now = new Date("2026-08-25T20:00:00");
    const dates = ["2026-08-23T08:00:00", "2026-08-24T08:00:00", "2026-08-25T08:00:00"];
    expect(computeStudyStreak(dates, now)).toBe(3);
  });

  it("chưa học hôm nay nhưng có học hôm qua -> vẫn neo vào hôm qua", () => {
    const now = new Date("2026-08-25T07:00:00"); // sáng sớm, HS chưa mở máy
    const dates = ["2026-08-23T08:00:00", "2026-08-24T08:00:00"];
    expect(computeStudyStreak(dates, now)).toBe(2);
  });

  it("đứt quãng 2 ngày trở lên -> chuỗi = 0", () => {
    const now = new Date("2026-08-25T20:00:00");
    const dates = ["2026-08-20T08:00:00", "2026-08-21T08:00:00"];
    expect(computeStudyStreak(dates, now)).toBe(0);
  });

  it("nhiều hoạt động trong cùng 1 ngày chỉ tính 1 ngày", () => {
    const now = new Date("2026-08-25T20:00:00");
    const dates = [
      "2026-08-25T08:00:00",
      "2026-08-25T09:00:00",
      "2026-08-25T21:00:00",
      "2026-08-24T08:00:00",
    ];
    expect(computeStudyStreak(dates, now)).toBe(2);
  });

  it("bỏ qua ngày không liên tiếp phía xa hơn, chỉ đếm chuỗi gần nhất", () => {
    const now = new Date("2026-08-25T20:00:00");
    const dates = [
      "2026-08-01T08:00:00", // ngày cũ, không liên quan
      "2026-08-24T08:00:00",
      "2026-08-25T08:00:00",
    ];
    expect(computeStudyStreak(dates, now)).toBe(2);
  });
});

describe("levelLabelForStreak", () => {
  it("phân theo mốc ngày, không so sánh học sinh khác", () => {
    expect(levelLabelForStreak(1)).toBe("Người chăm chỉ");
    expect(levelLabelForStreak(6)).toBe("Người chăm chỉ");
    expect(levelLabelForStreak(7)).toBe("Bền bỉ");
    expect(levelLabelForStreak(13)).toBe("Bền bỉ");
    expect(levelLabelForStreak(14)).toBe("Kiên trì");
    expect(levelLabelForStreak(29)).toBe("Kiên trì");
    expect(levelLabelForStreak(30)).toBe("Bậc thầy ôn tập");
    expect(levelLabelForStreak(90)).toBe("Bậc thầy ôn tập");
  });
});
