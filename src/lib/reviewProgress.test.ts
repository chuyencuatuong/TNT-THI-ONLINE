import { describe, expect, it } from "vitest";
import {
  clearReviewProgress,
  isValidReviewProgress,
  loadReviewProgress,
  reconcileReviewProgress,
  saveReviewProgress,
  type ProgressStorage,
  type ReviewProgressState,
} from "./reviewProgress";

/** Giả lập localStorage bằng Map — không cần jsdom (vitest chạy môi trường Node). */
function fakeStorage(initial: Record<string, string> = {}): ProgressStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const sample: ReviewProgressState = {
  studentId: "hs-1",
  sessionId: "sess-1",
  questionIds: ["q1", "q2", "q3"],
  answeredCount: 1,
  tally: { correct: 1, wrong: 0 },
};

describe("isValidReviewProgress", () => {
  it("dữ liệu đúng hình dạng -> true", () => {
    expect(isValidReviewProgress(sample)).toBe(true);
  });

  it("null/undefined/không phải object -> false", () => {
    expect(isValidReviewProgress(null)).toBe(false);
    expect(isValidReviewProgress(undefined)).toBe(false);
    expect(isValidReviewProgress("chuỗi bất kỳ")).toBe(false);
    expect(isValidReviewProgress(42)).toBe(false);
  });

  it("thiếu trường bắt buộc -> false", () => {
    const { studentId: _studentId, ...rest } = sample;
    expect(isValidReviewProgress(rest)).toBe(false);
  });

  it("questionIds không phải mảng chuỗi -> false", () => {
    expect(isValidReviewProgress({ ...sample, questionIds: [1, 2, 3] })).toBe(false);
    expect(isValidReviewProgress({ ...sample, questionIds: "q1" })).toBe(false);
  });

  it("answeredCount âm hoặc không phải số -> false", () => {
    expect(isValidReviewProgress({ ...sample, answeredCount: -1 })).toBe(false);
    expect(isValidReviewProgress({ ...sample, answeredCount: "1" })).toBe(false);
  });

  it("tally thiếu hoặc sai hình dạng -> false", () => {
    expect(isValidReviewProgress({ ...sample, tally: undefined })).toBe(false);
    expect(isValidReviewProgress({ ...sample, tally: { correct: 1 } })).toBe(false);
  });
});

describe("saveReviewProgress / loadReviewProgress / clearReviewProgress", () => {
  it("lưu rồi đọc lại đúng dữ liệu", () => {
    const storage = fakeStorage();
    saveReviewProgress(sample, storage);
    expect(loadReviewProgress("hs-1", storage)).toEqual(sample);
  });

  it("chưa từng lưu -> null", () => {
    const storage = fakeStorage();
    expect(loadReviewProgress("hs-1", storage)).toBeNull();
  });

  it("đọc với studentId khác studentId đã lưu -> null (không đọc nhầm tiến trình người khác)", () => {
    const storage = fakeStorage();
    saveReviewProgress(sample, storage);
    expect(loadReviewProgress("hs-khac", storage)).toBeNull();
  });

  it("dữ liệu hỏng (JSON không hợp lệ) -> null, không throw", () => {
    const storage = fakeStorage({ "tnt_review_progress:hs-1": "{not valid json" });
    expect(loadReviewProgress("hs-1", storage)).toBeNull();
  });

  it("dữ liệu sai hình dạng (từ phiên bản cũ) -> null", () => {
    const storage = fakeStorage({ "tnt_review_progress:hs-1": JSON.stringify({ foo: "bar" }) });
    expect(loadReviewProgress("hs-1", storage)).toBeNull();
  });

  it("clearReviewProgress xoá đúng entry, không ảnh hưởng entry khác", () => {
    const storage = fakeStorage();
    saveReviewProgress(sample, storage);
    saveReviewProgress({ ...sample, studentId: "hs-2" }, storage);
    clearReviewProgress("hs-1", storage);
    expect(loadReviewProgress("hs-1", storage)).toBeNull();
    expect(loadReviewProgress("hs-2", storage)).not.toBeNull();
  });

  it("storage null (localStorage bị chặn) -> không throw, coi như không lưu được gì", () => {
    expect(() => saveReviewProgress(sample, null)).not.toThrow();
    expect(loadReviewProgress("hs-1", null)).toBeNull();
    expect(() => clearReviewProgress("hs-1", null)).not.toThrow();
  });
});

describe("reconcileReviewProgress", () => {
  it("mọi câu vẫn active -> giữ nguyên hết", () => {
    const active = new Set(["q1", "q2", "q3"]);
    expect(reconcileReviewProgress(sample, active)).toEqual({
      questionIds: ["q1", "q2", "q3"],
      answeredCount: 1,
      tally: sample.tally,
    });
  });

  it("lọc bỏ câu không còn active, giữ đúng thứ tự các câu còn lại", () => {
    const active = new Set(["q1", "q3"]);
    const result = reconcileReviewProgress(sample, active);
    expect(result?.questionIds).toEqual(["q1", "q3"]);
  });

  it("answeredCount dồn lại (clamp) khi vượt quá số câu còn lại sau khi lọc", () => {
    const saved: ReviewProgressState = { ...sample, questionIds: ["q1", "q2", "q3"], answeredCount: 3 };
    const active = new Set(["q1"]); // chỉ còn 1 câu active
    const result = reconcileReviewProgress(saved, active);
    expect(result).toEqual({ questionIds: ["q1"], answeredCount: 1, tally: sample.tally });
  });

  it("không còn câu nào active -> null (nên bắt đầu buổi mới)", () => {
    const active = new Set(["q-khac"]);
    expect(reconcileReviewProgress(sample, active)).toBeNull();
  });
});
