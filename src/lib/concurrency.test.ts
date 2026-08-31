import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("mảng rỗng → trả về mảng rỗng, không gọi fn lần nào", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 2, async () => {
      calls += 1;
      return 0;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("giữ đúng thứ tự kết quả theo thứ tự items, kể cả khi phần tử SAU xong TRƯỚC", async () => {
    // phần tử 0 (delay 30ms) xong sau cùng, phần tử 1 (delay 10ms) xong trước nhất
    const delays = [30, 10, 20];
    const result = await mapWithConcurrency([0, 1, 2], 3, async (i) => {
      await new Promise((r) => setTimeout(r, delays[i]));
      return `xong-${i}`;
    });
    expect(result).toEqual(["xong-0", "xong-1", "xong-2"]);
  });

  it("không bao giờ chạy quá `limit` lệnh gọi cùng lúc", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];
    await mapWithConcurrency(items, 2, async (x) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return x * 2;
    });
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("limit lớn hơn số phần tử → chạy song song hết, vẫn đúng thứ tự kết quả", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 100, async (x) => x * 10);
    expect(result).toEqual([10, 20, 30]);
  });

  it("limit <= 0 vẫn chạy được (coi như tuần tự, không crash)", async () => {
    const order: number[] = [];
    const result = await mapWithConcurrency([1, 2, 3], 0, async (x) => {
      order.push(x);
      return x;
    });
    expect(result).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });
});
