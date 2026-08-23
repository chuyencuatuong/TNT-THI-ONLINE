import { describe, expect, it } from "vitest";
import { computeBatchSizes, MAX_BATCH_SIZE, splitIntoBatches } from "./reviewBatching";

describe("computeBatchSizes", () => {
  it("total <= 0 -> mảng rỗng", () => {
    expect(computeBatchSizes(0)).toEqual([]);
    expect(computeBatchSizes(-3)).toEqual([]);
  });

  it("total <= MAX_BATCH_SIZE -> 1 đợt duy nhất, không chia", () => {
    expect(computeBatchSizes(1)).toEqual([1]);
    expect(computeBatchSizes(7)).toEqual([7]);
    expect(computeBatchSizes(10)).toEqual([10]);
  });

  it("chia hết -> các đợt bằng nhau (hợp số)", () => {
    expect(computeBatchSizes(12)).toEqual([6, 6]);
    expect(computeBatchSizes(20)).toEqual([10, 10]);
    expect(computeBatchSizes(21)).toEqual([7, 7, 7]);
  });

  it("số nguyên tố > 10 -> chia lẻ, đợt sau lớn hơn đợt trước đúng bằng phần dư", () => {
    expect(computeBatchSizes(11)).toEqual([5, 6]); // 11 nguyên tố, dư 1
    expect(computeBatchSizes(13)).toEqual([6, 7]); // 13 nguyên tố, dư 1
    expect(computeBatchSizes(23)).toEqual([7, 8, 8]); // 23 nguyên tố, dư 2
  });

  it("hợp số > 10 nhưng không chia hết cũng phải chia lẻ y hệt số nguyên tố (không phải đặc thù riêng của số nguyên tố)", () => {
    expect(computeBatchSizes(15)).toEqual([7, 8]); // 15 = 3x5, không chia hết cho 2
    expect(computeBatchSizes(25)).toEqual([8, 8, 9]);
  });

  it("mọi đợt đều <= maxBatchSize và tổng đúng bằng total, với nhiều giá trị total khác nhau", () => {
    for (const total of [1, 2, 5, 9, 10, 11, 13, 17, 19, 29, 31, 47, 97, 100]) {
      const sizes = computeBatchSizes(total);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(total);
      for (const s of sizes) expect(s).toBeLessThanOrEqual(MAX_BATCH_SIZE);
      // các đợt sau >= đợt trước (dư dồn về cuối)
      for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1]);
    }
  });

  it("tôn trọng maxBatchSize tuỳ chỉnh", () => {
    // total=7, max=3 -> cần tối thiểu ceil(7/3)=3 đợt (2 đợt sẽ có đợt >3, vi phạm giới hạn)
    expect(computeBatchSizes(7, 3)).toEqual([2, 2, 3]);
  });
});

describe("splitIntoBatches", () => {
  it("cắt đúng theo kích thước, giữ nguyên thứ tự phần tử", () => {
    const items = Array.from({ length: 11 }, (_, i) => i + 1);
    const batches = splitIntoBatches(items);
    expect(batches).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10, 11],
    ]);
  });

  it("mảng rỗng -> không có đợt nào", () => {
    expect(splitIntoBatches([])).toEqual([]);
  });

  it("mảng nhỏ hơn maxBatchSize -> 1 đợt duy nhất chứa hết", () => {
    expect(splitIntoBatches([1, 2, 3])).toEqual([[1, 2, 3]]);
  });
});
