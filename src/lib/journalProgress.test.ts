import { describe, expect, it } from "vitest";
import {
  computeNudge,
  daysSince,
  EMPTY_JOURNAL_SUMMARY,
  JOURNAL_STAGE_COUNT,
  sessionsLeftForStage,
  stageOfStreak,
  summarizeJournal,
  summarizeJournalByStudent,
  type JournalProgressInput,
} from "./journalProgress";

const NOW = new Date("2026-09-14T08:00:00.000Z");
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}
function entry(correct_streak: number, lastWrongDaysAgo = 1): JournalProgressInput {
  return { correct_streak, last_wrong_at: daysAgo(lastWrongDaysAgo) };
}

describe("stageOfStreak", () => {
  it("ánh xạ streak 0/1/2 sang Lần 1/2/3", () => {
    expect(stageOfStreak(0)).toBe(1);
    expect(stageOfStreak(1)).toBe(2);
    expect(stageOfStreak(2)).toBe(3);
  });

  it("kẹp về biên với dữ liệu bất thường thay vì ném lỗi", () => {
    expect(stageOfStreak(-5)).toBe(1);
    expect(stageOfStreak(3)).toBe(3);
    expect(stageOfStreak(99)).toBe(3);
    expect(stageOfStreak(Number.NaN)).toBe(1);
  });
});

describe("sessionsLeftForStage", () => {
  it("Lần 1 cần đủ 3 buổi, Lần 3 chỉ còn 1 buổi", () => {
    expect(sessionsLeftForStage(1)).toBe(JOURNAL_STAGE_COUNT);
    expect(sessionsLeftForStage(2)).toBe(2);
    expect(sessionsLeftForStage(3)).toBe(1);
  });
});

describe("summarizeJournal", () => {
  it("nhật ký rỗng -> tiến độ 100%, không có câu tồn đọng", () => {
    expect(summarizeJournal([])).toEqual(EMPTY_JOURNAL_SUMMARY);
  });

  it("đếm đúng số câu theo từng chặng", () => {
    const s = summarizeJournal([entry(0), entry(0), entry(1), entry(2)]);
    expect(s.total).toBe(4);
    expect(s.byStage).toEqual([2, 1, 1]);
  });

  it("cộng đúng tổng số lượt ôn đúng còn thiếu", () => {
    // 2 câu Lần 1 (3 lượt/câu) + 1 câu Lần 2 (2 lượt) + 1 câu Lần 3 (1 lượt)
    const s = summarizeJournal([entry(0), entry(0), entry(1), entry(2)]);
    expect(s.sessionsRemaining).toBe(6 + 2 + 1);
  });

  it("tiến độ 0% khi mọi câu đều chưa đúng buổi nào", () => {
    expect(summarizeJournal([entry(0), entry(0)]).progressPercent).toBe(0);
  });

  it("tiến độ tăng dần theo streak đã tích", () => {
    // 1 câu Lần 3: cần 3 lượt, còn 1 -> đã đi 2/3 = 67%
    expect(summarizeJournal([entry(2)]).progressPercent).toBe(67);
  });

  it("lấy đúng câu sai lâu nhất làm oldestWrongAt", () => {
    const s = summarizeJournal([entry(0, 2), entry(1, 30), entry(2, 5)]);
    expect(s.oldestWrongAt).toBe(daysAgo(30));
  });

  it("bỏ qua last_wrong_at hỏng, không làm vỡ thống kê", () => {
    const s = summarizeJournal([
      { correct_streak: 0, last_wrong_at: "khong-phai-ngay" },
      entry(1, 4),
    ]);
    expect(s.total).toBe(2);
    expect(s.oldestWrongAt).toBe(daysAgo(4));
  });
});

describe("summarizeJournalByStudent", () => {
  it("gom theo từng học sinh", () => {
    const map = summarizeJournalByStudent([
      { student_id: "a", ...entry(0) },
      { student_id: "a", ...entry(2) },
      { student_id: "b", ...entry(1) },
    ]);
    expect(map.get("a")!.byStage).toEqual([1, 0, 1]);
    expect(map.get("b")!.byStage).toEqual([0, 1, 0]);
  });

  it("học sinh không có dòng nào thì không có trong map", () => {
    const map = summarizeJournalByStudent([{ student_id: "a", ...entry(0) }]);
    expect(map.has("b")).toBe(false);
  });
});

describe("daysSince", () => {
  it("trả về số ngày trọn vẹn", () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3);
  });
  it("null khi không có mốc hoặc mốc hỏng", () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince("hong", NOW)).toBeNull();
  });
  it("mốc ở tương lai coi như 0 ngày, không âm", () => {
    expect(daysSince(daysAgo(-2), NOW)).toBe(0);
  });
});

describe("computeNudge", () => {
  const clean = summarizeJournal([]);
  const few = summarizeJournal([entry(0), entry(1)]);
  const many = summarizeJournal(Array.from({ length: 12 }, () => entry(0)));

  it("nhật ký sạch -> none", () => {
    expect(computeNudge({ summary: clean, lastReviewAt: daysAgo(30), now: NOW }).level).toBe("none");
  });

  it("chưa từng ôn buổi nào nhưng đã có câu sai -> gấp", () => {
    const n = computeNudge({ summary: few, lastReviewAt: null, now: NOW });
    expect(n.level).toBe("gap");
    expect(n.daysSinceReview).toBeNull();
    expect(n.message).toContain("chưa ôn lần nào");
  });

  it("vừa ôn hôm qua, ít câu -> ok", () => {
    expect(computeNudge({ summary: few, lastReviewAt: daysAgo(1), now: NOW }).level).toBe("ok");
  });

  it("3 ngày chưa ôn -> nhắc", () => {
    expect(computeNudge({ summary: few, lastReviewAt: daysAgo(3), now: NOW }).level).toBe("nhac");
  });

  it("7 ngày chưa ôn -> gấp", () => {
    expect(computeNudge({ summary: few, lastReviewAt: daysAgo(7), now: NOW }).level).toBe("gap");
  });

  it("tồn đọng >= 10 câu thì gấp dù mới ôn hôm qua", () => {
    expect(computeNudge({ summary: many, lastReviewAt: daysAgo(1), now: NOW }).level).toBe("gap");
  });

  it("ok và mọi câu đã qua ít nhất 1 lần thì lời nhắc không nói 'chưa qua lần nào'", () => {
    const allPassedOnce = summarizeJournal([entry(1), entry(2)]);
    const n = computeNudge({ summary: allPassedOnce, lastReviewAt: daysAgo(1), now: NOW });
    expect(n.level).toBe("ok");
    expect(n.message).toContain("đã qua ít nhất 1 lần");
  });
});
