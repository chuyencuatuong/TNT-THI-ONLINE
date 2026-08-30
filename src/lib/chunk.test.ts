import { describe, expect, it } from "vitest";
import { chunkArray } from "./chunk";

describe("chunkArray", () => {
  it("chia đều khi số phần tử chia hết cho size", () => {
    expect(chunkArray([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("phần còn dư nằm ở nhóm cuối", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("size lớn hơn số phần tử → 1 nhóm duy nhất", () => {
    expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("mảng rỗng → mảng nhóm rỗng", () => {
    expect(chunkArray([], 5)).toEqual([]);
  });

  it("size <= 0 → gộp thành 1 nhóm duy nhất (không chia)", () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
});
