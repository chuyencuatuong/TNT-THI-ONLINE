import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIER_THRESHOLDS,
  computeAutoTier,
  resolveTier,
  TIER_LABELS,
} from "./studentTier";

describe("computeAutoTier", () => {
  it("trả về null khi chưa có điểm nào", () => {
    expect(computeAutoTier(null)).toBeNull();
  });

  it("xếp Giỏi khi >= ngưỡng gioiMin", () => {
    expect(computeAutoTier(8)).toBe("gioi");
    expect(computeAutoTier(9.5)).toBe("gioi");
  });

  it("xếp Khá khi trong khoảng [khaMin, gioiMin)", () => {
    expect(computeAutoTier(6.5)).toBe("kha");
    expect(computeAutoTier(7.9)).toBe("kha");
  });

  it("xếp Trung bình khi trong khoảng [tbMin, khaMin)", () => {
    expect(computeAutoTier(5)).toBe("tb");
    expect(computeAutoTier(6.4)).toBe("tb");
  });

  it("xếp Yếu khi dưới tbMin", () => {
    expect(computeAutoTier(4.9)).toBe("yeu");
    expect(computeAutoTier(0)).toBe("yeu");
  });

  it("dùng ngưỡng tuỳ chỉnh khi truyền vào", () => {
    const custom = { gioiMin: 9, khaMin: 7, tbMin: 5.5 };
    expect(computeAutoTier(8.5, custom)).toBe("kha");
    expect(computeAutoTier(9, custom)).toBe("gioi");
  });
});

describe("resolveTier", () => {
  it("ưu tiên manual_tier khi có ghi đè tay", () => {
    expect(resolveTier("gioi", 2)).toEqual({ tier: "gioi", isOverride: true });
  });

  it("dùng tầng tự động khi không có ghi đè", () => {
    expect(resolveTier(null, 8.2)).toEqual({ tier: "gioi", isOverride: false });
  });

  it("trả về tier null khi không ghi đè và chưa có điểm", () => {
    expect(resolveTier(null, null)).toEqual({ tier: null, isOverride: false });
  });
});

describe("DEFAULT_TIER_THRESHOLDS / TIER_LABELS", () => {
  it("có đủ nhãn cho 4 tầng", () => {
    expect(Object.keys(TIER_LABELS).sort()).toEqual(["gioi", "kha", "tb", "yeu"]);
  });

  it("ngưỡng mặc định giảm dần hợp lý", () => {
    expect(DEFAULT_TIER_THRESHOLDS.gioiMin).toBeGreaterThan(DEFAULT_TIER_THRESHOLDS.khaMin);
    expect(DEFAULT_TIER_THRESHOLDS.khaMin).toBeGreaterThan(DEFAULT_TIER_THRESHOLDS.tbMin);
  });
});
