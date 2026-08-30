import { describe, expect, it } from "vitest";
import {
  EMPTY_CASCADE_FILTER,
  filterExamsByCascade,
  groupExamsByFolder,
  isCascadeFilterActive,
  UNCATEGORIZED_FOLDER_LABEL,
  type LibraryExam,
} from "./examLibrary";

const exams: LibraryExam[] = [
  { id: "e1", title: "Đề GK1 số 1", grade: 12, folder_id: "f-gk1", term_id: "t-gk1" },
  { id: "e2", title: "Đề GK1 số 2", grade: 12, folder_id: "f-gk1", term_id: "t-gk1" },
  { id: "e3", title: "Đề ôn tổng hợp", grade: 11, folder_id: null, term_id: null },
  { id: "e4", title: "Đề chương 2", grade: 12, folder_id: "f-chuong2", term_id: null },
];

const folderNameById = new Map([
  ["f-gk1", "Tuyển tập 10 đề GK1"],
  ["f-chuong2", "Đề chương 2"],
]);

describe("groupExamsByFolder", () => {
  it("nhóm đúng theo folder_id, sắp xếp A-Z tiếng Việt, 'Chưa phân loại' xuống cuối", () => {
    const groups = groupExamsByFolder(exams, folderNameById);
    expect(groups.map((g) => g.folderName)).toEqual([
      "Đề chương 2",
      "Tuyển tập 10 đề GK1",
      UNCATEGORIZED_FOLDER_LABEL,
    ]);
    const gk1 = groups.find((g) => g.folderId === "f-gk1")!;
    expect(gk1.exams.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("folder_id không có trong bảng tên (đã xoá) -> vẫn hiện, gán nhãn Chưa phân loại", () => {
    const groups = groupExamsByFolder(
      [{ id: "x", title: "X", grade: null, folder_id: "missing", term_id: null }],
      new Map(),
    );
    expect(groups[0].folderName).toBe(UNCATEGORIZED_FOLDER_LABEL);
  });
});

describe("isCascadeFilterActive", () => {
  it("mặc định (chưa chọn gì) -> không active", () => {
    expect(isCascadeFilterActive(EMPTY_CASCADE_FILTER)).toBe(false);
  });
  it("chọn bất kỳ 1 tầng nào -> active", () => {
    expect(isCascadeFilterActive({ ...EMPTY_CASCADE_FILTER, grade: 12 })).toBe(true);
    expect(isCascadeFilterActive({ ...EMPTY_CASCADE_FILTER, termId: "t1" })).toBe(true);
    expect(isCascadeFilterActive({ ...EMPTY_CASCADE_FILTER, topicId: "top1" })).toBe(true);
  });
});

describe("filterExamsByCascade", () => {
  const examTopicIds = new Map([
    ["e1", ["top-mu-log"]],
    ["e4", ["top-mu-log", "top-dao-ham"]],
  ]);

  it("không chọn tầng nào -> giữ nguyên toàn bộ", () => {
    expect(filterExamsByCascade(exams, EMPTY_CASCADE_FILTER, examTopicIds)).toHaveLength(4);
  });

  it("lọc theo khối", () => {
    const result = filterExamsByCascade(
      exams,
      { ...EMPTY_CASCADE_FILTER, grade: 11 },
      examTopicIds,
    );
    expect(result.map((e) => e.id)).toEqual(["e3"]);
  });

  it("lọc theo chương trình (term)", () => {
    const result = filterExamsByCascade(
      exams,
      { ...EMPTY_CASCADE_FILTER, termId: "t-gk1" },
      examTopicIds,
    );
    expect(result.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("lọc theo chương -> khớp nếu đề có chứa chương đó trong danh sách nhiều chương", () => {
    const result = filterExamsByCascade(
      exams,
      { ...EMPTY_CASCADE_FILTER, topicId: "top-dao-ham" },
      examTopicIds,
    );
    expect(result.map((e) => e.id)).toEqual(["e4"]);
  });

  it("kết hợp nhiều tầng cùng lúc (AND)", () => {
    const result = filterExamsByCascade(
      exams,
      { grade: 12, termId: "t-gk1", topicId: "top-mu-log" },
      examTopicIds,
    );
    expect(result.map((e) => e.id)).toEqual(["e1"]);
  });
});
