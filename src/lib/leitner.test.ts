import { describe, expect, it } from "vitest";
import {
  applyReviewResult,
  isActiveJournalEntry,
  LEITNER_STREAK_TO_RETIRE,
  markWrongFromExam,
  pickRandomForSession,
  type JournalStreakState,
} from "./leitner";

const base: JournalStreakState = {
  correctStreak: 0,
  lastReviewedSessionId: null,
  retiredAt: null,
};

describe("applyReviewResult", () => {
  it("làm đúng ở buổi mới -> tăng streak thêm 1, chưa rút khỏi nhật ký nếu chưa đủ 3", () => {
    const r1 = applyReviewResult(base, "session-1", true, "2026-08-23T00:00:00Z");
    expect(r1).toEqual({
      correctStreak: 1,
      lastReviewedSessionId: "session-1",
      retiredAt: null,
    });
    const r2 = applyReviewResult(r1, "session-2", true, "2026-08-24T00:00:00Z");
    expect(r2.correctStreak).toBe(2);
    expect(r2.retiredAt).toBeNull();
  });

  it("đạt đủ 3 buổi đúng liên tiếp -> rút khỏi nhật ký (retiredAt được set)", () => {
    let state = base;
    state = applyReviewResult(state, "s1", true, "t1");
    state = applyReviewResult(state, "s2", true, "t2");
    state = applyReviewResult(state, "s3", true, "t3");
    expect(state.correctStreak).toBe(LEITNER_STREAK_TO_RETIRE);
    expect(state.retiredAt).toBe("t3");
  });

  it("làm sai ở bất kỳ buổi nào -> reset streak về 0", () => {
    let state = base;
    state = applyReviewResult(state, "s1", true, "t1");
    state = applyReviewResult(state, "s2", true, "t2");
    state = applyReviewResult(state, "s3", false, "t3");
    expect(state.correctStreak).toBe(0);
    expect(state.retiredAt).toBeNull();
  });

  it("trả lời lại nhiều lần trong CÙNG 1 buổi không đếm dồn streak", () => {
    let state = applyReviewResult(base, "s1", true, "t1");
    expect(state.correctStreak).toBe(1);
    // trả lời lại đúng lần nữa, vẫn trong session "s1"
    const again = applyReviewResult(state, "s1", true, "t1-again");
    expect(again).toEqual(state);
    // kể cả nếu lần 2 trong CÙNG buổi trả lời sai, vẫn giữ nguyên (không phạt)
    const wrongSameSession = applyReviewResult(state, "s1", false, "t1-again");
    expect(wrongSameSession).toEqual(state);
  });
});

describe("markWrongFromExam", () => {
  it("luôn trả về streak 0, chưa rút khỏi nhật ký — kể cả câu trước đó đã retired", () => {
    expect(markWrongFromExam("t1")).toEqual({
      correctStreak: 0,
      lastReviewedSessionId: null,
      retiredAt: null,
    });
  });
});

describe("isActiveJournalEntry", () => {
  it("retired_at null -> đang cần ôn (active)", () => {
    expect(isActiveJournalEntry({ retired_at: null })).toBe(true);
  });
  it("retired_at có giá trị -> đã rút khỏi nhật ký, không active", () => {
    expect(isActiveJournalEntry({ retired_at: "2026-08-23T00:00:00Z" })).toBe(false);
  });
});

describe("pickRandomForSession", () => {
  it("lấy đúng số lượng yêu cầu, không trùng lặp phần tử", () => {
    const items = [1, 2, 3, 4, 5];
    const picked = pickRandomForSession(items, 3, () => 0);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("nếu số lượng yêu cầu lớn hơn danh sách -> trả về tối đa hết danh sách, không lỗi", () => {
    const items = [1, 2];
    const picked = pickRandomForSession(items, 5, () => 0.99);
    expect(picked).toHaveLength(2);
  });

  it("không đột biến mảng gốc truyền vào", () => {
    const items = [1, 2, 3];
    pickRandomForSession(items, 2, () => 0.5);
    expect(items).toEqual([1, 2, 3]);
  });
});
