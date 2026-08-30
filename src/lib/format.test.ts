import { describe, expect, it } from "vitest";
import { completionMinutes, formatMinutes, formatScoreDelta, formatTimeDelta } from "./format";

describe("formatMinutes", () => {
  it("dưới 1 phút", () => {
    expect(formatMinutes(0.4)).toBe("dưới 1 phút");
  });
  it("chỉ có phút", () => {
    expect(formatMinutes(42)).toBe("42 phút");
  });
  it("có giờ, không lẻ phút", () => {
    expect(formatMinutes(120)).toBe("2 giờ");
  });
  it("có giờ và phút", () => {
    expect(formatMinutes(125)).toBe("2 giờ 5 phút");
  });
});

describe("completionMinutes", () => {
  it("null nếu chưa nộp bài", () => {
    expect(
      completionMinutes({ started_at: "2026-01-01T00:00:00Z", submitted_at: null }),
    ).toBeNull();
  });
  it("tính đúng số phút giữa started_at và submitted_at", () => {
    expect(
      completionMinutes({
        started_at: "2026-01-01T00:00:00Z",
        submitted_at: "2026-01-01T00:30:00Z",
      }),
    ).toBe(30);
  });
});

describe("formatScoreDelta", () => {
  it("hoà -> '0', trung tính", () => {
    expect(formatScoreDelta(0)).toEqual({ text: "0", className: "delta-neutral" });
    expect(formatScoreDelta(0.001)).toEqual({ text: "0", className: "delta-neutral" });
  });
  it("tăng điểm -> có dấu +, màu xanh", () => {
    expect(formatScoreDelta(0.5)).toEqual({ text: "+0.50", className: "delta-up" });
  });
  it("giảm điểm -> có dấu -, màu đỏ", () => {
    expect(formatScoreDelta(-0.75)).toEqual({ text: "-0.75", className: "delta-down" });
  });
});

describe("formatTimeDelta", () => {
  it("bằng nhau", () => {
    expect(formatTimeDelta(0.3)).toBe("bằng lần đó");
  });
  it("chậm hơn", () => {
    expect(formatTimeDelta(5)).toBe("+5 phút");
  });
  it("nhanh hơn", () => {
    expect(formatTimeDelta(-5)).toBe("-5 phút");
  });
});
