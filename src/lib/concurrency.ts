/**
 * Chạy `fn` cho từng phần tử của `items`, tối đa `limit` lệnh gọi đang chạy
 * ĐỒNG THỜI cùng lúc (worker pool) — thay vì chờ lệnh trước xong hẳn mới bắt
 * đầu lệnh sau (tuần tự). Luôn trả về kết quả ĐÚNG THỨ TỰ của `items`, bất kể
 * lệnh nào thực tế xong trước.
 *
 * Dùng để gọi nhiều đợt AI (Gemini) song song có kiểm soát khi tạo đề từ PDF
 * (xem PDF_CHUNK_CONCURRENCY trong ai.ts) — thay cho cách cũ chạy tuần tự
 * từng đợt một, vốn cộng dồn thời gian chờ của MỌI đợt lại với nhau. Giới hạn
 * `limit` (thay vì chạy song song không giới hạn) để không dội quá nhiều
 * request cùng lúc vào rate limit của Gemini.
 *
 * Hàm thuần (không phụ thuộc DOM/mạng), unit-test được độc lập bằng hàm `fn`
 * giả lập thời gian chờ qua `setTimeout` thường, không cần mock mạng thật.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;

  // limit <= 0 hoặc lớn hơn số phần tử đều phải chạy được (không crash) —
  // coi như tuần tự (1) hoặc song song hết (items.length) tương ứng.
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
