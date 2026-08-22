/**
 * Chia 1 mảng thành nhiều mảng con kích thước tối đa `size` — dùng để gửi ảnh
 * các trang PDF cho Gemini theo từng đợt (đề dài có thể vượt giới hạn 1 lần gọi).
 * Hàm thuần, không phụ thuộc trình duyệt, để có thể unit-test độc lập.
 */
export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) return items.length ? [items] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
