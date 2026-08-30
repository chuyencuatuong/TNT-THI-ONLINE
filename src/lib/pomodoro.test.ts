import { describe, expect, it } from "vitest";
import {
  countSessionsThisMonth,
  countSessionsToday,
  formatClock,
  gardenSlots,
  getLevelProgress,
  sumFocusMinutes,
} from "./pomodoro";

describe("getLevelProgress", () => {
  it("0 cây -> cấp 1, còn thiếu đúng mốc cấp 2 để lên cấp", () => {
    const p = getLevelProgress(0);
    expect(p.level).toBe(1);
    expect(p.name).toBe("Người mới bắt đầu");
    expect(p.nextLevelName).toBe("Người gieo hạt");
    expect(p.treesToNextLevel).toBe(8);
    expect(p.progressRatio).toBe(0);
  });

  it("đúng mốc của 1 cấp -> đã LÊN cấp đó (không còn ở cấp dưới)", () => {
    const p = getLevelProgress(20);
    expect(p.level).toBe(3);
    expect(p.name).toBe("Người ươm mầm");
  });

  it("giữa 2 mốc -> progressRatio tính đúng tỉ lệ trong khoảng đó", () => {
    // Cấp 3 (20 cây) -> Cấp 4 (40 cây), đang có 32 cây => (32-20)/(40-20) = 0.6
    const p = getLevelProgress(32);
    expect(p.level).toBe(3);
    expect(p.treesToNextLevel).toBe(8);
    expect(p.progressRatio).toBeCloseTo(0.6);
  });

  it("vượt mốc cao nhất -> ở cấp cao nhất, không còn cấp tiếp theo", () => {
    const p = getLevelProgress(999);
    expect(p.nextLevelName).toBeNull();
    expect(p.treesToNextLevel).toBeNull();
    expect(p.progressRatio).toBe(1);
  });
});

describe("countSessionsToday / countSessionsThisMonth", () => {
  const now = new Date("2026-08-23T10:00:00");
  const sessions = [
    { completed_at: "2026-08-23T07:00:00", focus_minutes: 25 },
    { completed_at: "2026-08-23T09:00:00", focus_minutes: 25 },
    { completed_at: "2026-08-22T09:00:00", focus_minutes: 25 }, // hôm qua, vẫn trong tháng
    { completed_at: "2026-07-30T09:00:00", focus_minutes: 25 }, // tháng trước
  ];

  it("đếm đúng số phiên trong ngày hôm nay", () => {
    expect(countSessionsToday(sessions, now)).toBe(2);
  });

  it("đếm đúng số phiên trong tháng hiện tại (gồm cả các ngày trước trong tháng)", () => {
    expect(countSessionsThisMonth(sessions, now)).toBe(3);
  });

  it("sumFocusMinutes cộng dồn đúng tổng số phút", () => {
    expect(sumFocusMinutes(sessions)).toBe(100);
  });
});

describe("gardenSlots", () => {
  it("chưa hoàn thành phiên nào -> toàn bộ ô đều trống", () => {
    expect(gardenSlots(0, 6)).toEqual({ grown: 0, empty: 6, extra: 0 });
  });

  it("hoàn thành ít hơn mục tiêu -> đúng số ô đã nở + còn lại trống", () => {
    expect(gardenSlots(3, 6)).toEqual({ grown: 3, empty: 3, extra: 0 });
  });

  it("hoàn thành vượt mục tiêu -> mọi ô đều nở, phần dư tính vào extra", () => {
    expect(gardenSlots(9, 6)).toEqual({ grown: 6, empty: 0, extra: 3 });
  });
});

describe("formatClock", () => {
  it("định dạng đúng mm:ss, đệm số 0", () => {
    expect(formatClock(1452)).toBe("24:12");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(0)).toBe("00:00");
  });

  it("số âm/lẻ được làm tròn về 0 hoặc số giây gần nhất, không lỗi", () => {
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(59.6)).toBe("01:00");
  });
});
