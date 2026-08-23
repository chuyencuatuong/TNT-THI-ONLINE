import { describe, expect, it } from "vitest";
import { accuracyPercent, buildComparisonRows, mergeChapterStats, type ChapterStat } from "./chapterStats";

function stat(partial: Partial<ChapterStat> & Pick<ChapterStat, "topic_id">): ChapterStat {
  return {
    topic_name: "Chương " + partial.topic_id,
    total: 0,
    correctScore: 0,
    maxScore: 0,
    ...partial,
  };
}

describe("mergeChapterStats", () => {
  it("gộp đúng nhiều học sinh cùng chương -> cộng dồn total/correctScore/maxScore", () => {
    const merged = mergeChapterStats([
      [stat({ topic_id: "t1", total: 2, correctScore: 1, maxScore: 2 })],
      [stat({ topic_id: "t1", total: 3, correctScore: 3, maxScore: 3 })],
    ]);
    expect(merged).toEqual([
      { topic_id: "t1", topic_name: "Chương t1", total: 5, correctScore: 4, maxScore: 5 },
    ]);
  });

  it("chương chỉ 1 học sinh có -> vẫn giữ nguyên, không lẫn sang chương khác", () => {
    const merged = mergeChapterStats([
      [stat({ topic_id: "t1", total: 1, correctScore: 1, maxScore: 1 })],
      [stat({ topic_id: "t2", total: 1, correctScore: 0, maxScore: 1 })],
    ]);
    expect(merged.sort((a, b) => a.topic_id.localeCompare(b.topic_id))).toEqual([
      { topic_id: "t1", topic_name: "Chương t1", total: 1, correctScore: 1, maxScore: 1 },
      { topic_id: "t2", topic_name: "Chương t2", total: 1, correctScore: 0, maxScore: 1 },
    ]);
  });

  it("danh sách rỗng -> mảng rỗng", () => {
    expect(mergeChapterStats([])).toEqual([]);
    expect(mergeChapterStats([[], []])).toEqual([]);
  });
});

describe("accuracyPercent", () => {
  it("tính đúng % làm tròn 1 chữ số thập phân", () => {
    expect(accuracyPercent({ correctScore: 1, maxScore: 3 })).toBeCloseTo(33.3, 5);
    expect(accuracyPercent({ correctScore: 3, maxScore: 4 })).toBe(75);
  });

  it("maxScore = 0 -> null (tránh chia cho 0, không phải 0%)", () => {
    expect(accuracyPercent({ correctScore: 0, maxScore: 0 })).toBeNull();
  });
});

describe("buildComparisonRows", () => {
  const classStats: ChapterStat[] = [
    stat({ topic_id: "t1", total: 10, correctScore: 7, maxScore: 10 }),
    stat({ topic_id: "t2", total: 0, correctScore: 0, maxScore: 0 }), // chưa ai làm -> phải bị lọc bỏ
  ];

  it("bỏ qua chương chưa ai làm (maxScore = 0) ở cả lớp", () => {
    const rows = buildComparisonRows(classStats, null);
    expect(rows.map((r) => r.topic_id)).toEqual(["t1"]);
  });

  it("chưa chọn học sinh nào (null) -> studentAccuracy = null cho mọi dòng", () => {
    const rows = buildComparisonRows(classStats, null);
    expect(rows[0].studentAccuracy).toBeNull();
    expect(rows[0].classAccuracy).toBe(70);
  });

  it("đã chọn học sinh nhưng học sinh đó chưa làm chương này -> studentAccuracy null (không phải 0)", () => {
    const rows = buildComparisonRows(classStats, []);
    expect(rows[0].studentAccuracy).toBeNull();
  });

  it("đã chọn học sinh và có dữ liệu chương đó -> tính đúng % học sinh", () => {
    const rows = buildComparisonRows(classStats, [
      stat({ topic_id: "t1", total: 4, correctScore: 2, maxScore: 4 }),
    ]);
    expect(rows[0].studentAccuracy).toBe(50);
    expect(rows[0].classAccuracy).toBe(70);
  });
});
