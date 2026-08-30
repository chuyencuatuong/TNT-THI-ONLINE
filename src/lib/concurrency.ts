/**
 * Chạy nhiều việc bất đồng bộ SONG SONG nhưng có giới hạn số việc chạy cùng
 * lúc, và trả kết quả về ĐÚNG THỨ TỰ đầu vào.
 *
 * Vì sao cần (30/08/2026): trước đây parseExamFromPdfPages() gọi AI cho từng
 * đợt trang theo kiểu TUẦN TỰ (`for ... await`) — đợt sau chỉ bắt đầu khi đợt
 * trước đã xong. Với 1 đề 12 trang chia 2 đợt, mỗi đợt 20-40 giây, tổng thời
 * gian là TỔNG của các đợt (40-80 giây) dù các đợt hoàn toàn độc lập với
 * nhau. Chạy song song thì tổng thời gian chỉ còn xấp xỉ đợt CHẬM NHẤT.
 *
 * Vì sao vẫn phải giới hạn, không bắn hết 1 lượt: gói miễn phí của Google có
 * hạn mức số lượt gọi mỗi PHÚT, bắn cùng lúc chục yêu cầu là dính 429 ngay —
 * lúc đó lại mất thời gian thử lại, chậm hơn cả chạy tuần tự. Ngoài ra mỗi
 * yêu cầu còn kèm vài ảnh trang khá nặng, mở quá nhiều kết nối một lúc cũng
 * làm chính đường mạng của giáo viên nghẽn.
 *
 * Hàm này KHÔNG bắt lỗi hộ: nếu `worker` ném lỗi thì lỗi lan ra ngoài. Nơi
 * đang dùng (parseExamFromImages) vốn đã tự bắt hết lỗi và trả về kết quả
 * rỗng kèm cảnh báo, nên không đợt nào làm hỏng các đợt còn lại.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const effectiveLimit = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  // Con trỏ dùng chung: mỗi "làn" chạy xong 1 việc thì tự nhặt việc kế tiếp
  // chưa ai làm. Cách này tốt hơn chia đều trước theo lô, vì các đợt không dài
  // bằng nhau — làn nào rảnh trước thì làm tiếp luôn, không phải đứng chờ.
  let nextIndex = 0;

  async function runLane(): Promise<void> {
    for (;;) {
      const current = nextIndex;
      if (current >= items.length) return;
      nextIndex += 1;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, runLane));
  return results;
}
