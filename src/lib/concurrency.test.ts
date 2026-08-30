import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

/** Chờ 1 chút mà không cần timer giả — đủ để các "làn" chạy xen kẽ nhau thật. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  it("giữ ĐÚNG THỨ TỰ đầu vào dù việc xong không theo thứ tự", async () => {
    // Việc đầu tiên cố tình chậm nhất — nếu hàm trả kết quả theo thứ tự XONG
    // thì mảng sẽ bị đảo, và các đợt trang đề sẽ ghép sai thứ tự.
    const delays = [30, 20, 10, 0];
    const result = await mapWithConcurrency(delays, 4, async (ms, i) => {
      await delay(ms);
      return i;
    });
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it("không bao giờ chạy quá số việc cùng lúc cho phép", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await delay(5);
      running -= 1;
      return null;
    });
    expect(peak).toBe(3);
  });

  it("chạy song song thật (nhanh hơn hẳn tuần tự)", async () => {
    const startedAt = Date.now();
    await mapWithConcurrency([20, 20, 20, 20], 4, async (ms) => {
      await delay(ms);
      return ms;
    });
    // Tuần tự sẽ mất ~80ms; song song 4 làn chỉ ~20ms. Ngưỡng 70ms để không
    // bị "đỏ" oan trên máy chậm mà vẫn phát hiện được nếu lỡ quay về tuần tự.
    expect(Date.now() - startedAt).toBeLessThan(70);
  });

  it("chạy đủ mọi phần tử kể cả khi số việc nhiều hơn số làn", async () => {
    const items = Array.from({ length: 7 }, (_, i) => i);
    const result = await mapWithConcurrency(items, 2, async (n) => n * 2);
    expect(result).toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  it("mảng rỗng thì trả về mảng rỗng, không gọi worker lần nào", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 3, async () => {
      calls += 1;
      return 1;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("giới hạn nhỏ hơn 1 vẫn chạy được (coi như 1 làn)", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 0, async (n) => n + 1);
    expect(result).toEqual([2, 3, 4]);
  });
});
