import { describe, expect, it } from "vitest";
import {
  buildLessonComparisonRows,
  lessonAccuracyPercent,
  mergeLessonStats,
  truncateLessonLabel,
  type LessonStat,
} from "./lessonStats";

function stat(partial: Partial<LessonStat> & Pick<LessonStat, "lesson_id" | "topic_id">): LessonStat {
  return {
    lesson_name: "Bài " + partial.lesson_id,
    total: 0,
    correctScore: 0,
    maxScore: 0,
    ...partial,
  };
}

describe("mergeLessonStats", () => {
  it("gộp đúng nhiều học sinh cùng Bài -> cộng dồn total/correctScore/maxScore", () => {
    const merged = mergeLessonStats([
      [stat({ lesson_id: "l1", topic_id: "t1", total: 2, correctScore: 1, maxScore: 2 })],
      [stat({ lesson_id: "l1", topic_id: "t1", total: 3, correctScore: 3, maxScore: 3 })],
    ]);
    expect(merged).toEqual([
      { lesson_id: "l1", lesson_name: "Bài l1", topic_id: "t1", total: 5, correctScore: 4, maxScore: 5 },
    ]);
  });

  it("Bài chỉ 1 học sinh có -> vẫn giữ nguyên, không lẫn sang Bài khác", () => {
    const merged = mergeLessonStats([
      [stat({ lesson_id: "l1", topic_id: "t1", total: 1, correctScore: 1, maxScore: 1 })],
      [stat({ lesson_id: "l2", topic_id: "t1", total: 1, correctScore: 0, maxScore: 1 })],
    ]);
    expect(merged.sort((a, b) => a.lesson_id.localeCompare(b.lesson_id))).toEqual([
      { lesson_id: "l1", lesson_name: "Bài l1", topic_id: "t1", total: 1, correctScore: 1, maxScore: 1 },
      { lesson_id: "l2", lesson_name: "Bài l2", topic_id: "t1", total: 1, correctScore: 0, maxScore: 1 },
    ]);
  });

  it("danh sách rỗng -> mảng rỗng", () => {
    expect(mergeLessonStats([])).toEqual([]);
    expect(mergeLessonStats([[], []])).toEqual([]);
  });
});

describe("lessonAccuracyPercent", () => {
  it("tính đúng % làm tròn 1 chữ số thập phân", () => {
    expect(lessonAccuracyPercent({ correctScore: 1, maxScore: 3 })).toBeCloseTo(33.3, 5);
    expect(lessonAccuracyPercent({ correctScore: 3, maxScore: 4 })).toBe(75);
  });

  it("maxScore = 0 -> null (tránh chia cho 0, không phải 0%)", () => {
    expect(lessonAccuracyPercent({ correctScore: 0, maxScore: 0 })).toBeNull();
  });
});

describe("buildLessonComparisonRows", () => {
  const classStats: LessonStat[] = [
    stat({ lesson_id: "l1", topic_id: "t1", total: 10, correctScore: 7, maxScore: 10 }),
    stat({ lesson_id: "l2", topic_id: "t1", total: 0, correctScore: 0, maxScore: 0 }), // chưa ai làm -> lọc bỏ
    stat({ lesson_id: "l3", topic_id: "t2", total: 5, correctScore: 5, maxScore: 5 }), // khác chương -> lọc bỏ
  ];

  it("chỉ giữ Bài thuộc ĐÚNG chương đang xem VÀ đã có ai làm", () => {
    const rows = buildLessonComparisonRows(classStats, null, "t1");
    expect(rows.map((r) => r.lesson_id)).toEqual(["l1"]);
  });

  it("chưa chọn học sinh nào (null) -> studentAccuracy = null cho mọi dòng", () => {
    const rows = buildLessonComparisonRows(classStats, null, "t1");
    expect(rows[0].studentAccuracy).toBeNull();
    expect(rows[0].classAccuracy).toBe(70);
  });

  it("đã chọn học sinh nhưng học sinh đó chưa làm Bài này -> studentAccuracy null (không phải 0)", () => {
    const rows = buildLessonComparisonRows(classStats, [], "t1");
    expect(rows[0].studentAccuracy).toBeNull();
  });

  it("đã chọn học sinh và có dữ liệu Bài đó -> tính đúng % học sinh", () => {
    const rows = buildLessonComparisonRows(
      classStats,
      [stat({ lesson_id: "l1", topic_id: "t1", total: 4, correctScore: 2, maxScore: 4 })],
      "t1",
    );
    expect(rows[0].studentAccuracy).toBe(50);
    expect(rows[0].classAccuracy).toBe(70);
  });
});

describe("truncateLessonLabel", () => {
  it("tên ngắn hơn hoặc bằng giới hạn -> giữ nguyên", () => {
    expect(truncateLessonLabel("Bài 1. Mệnh đề", 22)).toBe("Bài 1. Mệnh đề");
  });

  it("tên dài hơn giới hạn -> cắt kèm dấu … và không vượt quá maxChars", () => {
    const long = "Bài 5. Giá trị lượng giác của một góc từ 0° đến 180°";
    const result = truncateLessonLabel(long, 22);
    expect(result.length).toBeLessThanOrEqual(22);
    expect(result.endsWith("…")).toBe(true);
    expect(long.startsWith(result.slice(0, -1))).toBe(true);
  });

  it("có khoảng trắng thừa ở đầu/cuối -> vẫn cắt đúng, không để dư khoảng trắng ngay trước dấu …", () => {
    expect(truncateLessonLabel("  Bài 1  ", 22)).toBe("Bài 1");
  });
});
